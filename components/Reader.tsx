'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';
import type {
  NarrationFeatureVoiceOption,
  NarrationFeatureResponse,
  NarrationManifestChapter,
  NarrationManifestCue,
} from '@/lib/narration';
import { clearCachedBookBinary, isBookLoadErrorCode, loadBookBinary } from '@/lib/book-client-cache';

interface ReaderProps {
  url: string;
  initialLocation?: string | null;
  bookId: string;
  title?: string;
  progressSaveEndpoint?: string | null;
  initialNarrationPlayerExpanded?: boolean | null;
  narrationPlayerPreferenceEndpoint?: string | null;
  narrationAccess?: ReaderNarrationAccess;
}

interface ReaderNarrationAccess {
  hasAccess: boolean;
  isSignedIn: boolean;
  manageHref: string;
  statusEndpoint: string;
  isEnabled?: boolean;
}

type NarrationStatusPayload = NarrationFeatureResponse;

interface Highlight {
  id: string;
  cfi: string;
  text: string;
  color: string;
  note?: string;
}

interface Bookmark {
  id: string;
  cfi: string;
  chapter?: string;
  label: string;
}

interface SearchResult {
  cfi: string;
  excerpt: string;
}

interface StandaloneNote {
  id: string;
  cfi: string;
  content: string;
  createdAt: string;
}

type Theme = 'light' | 'dark' | 'sepia';
type Flow = 'paginated' | 'scrolled';
type FontFamily = 'Crimson Pro' | 'Inter' | 'Georgia';
type LineSpacing = 1.4 | 1.6 | 1.9;
type SidePanel = 'toc' | 'highlights' | 'notes' | 'bookmarks' | null;
type NarrationPlaybackRate = 0.8 | 1 | 1.25 | 1.5;

const NARRATION_PLAYBACK_RATES: NarrationPlaybackRate[] = [0.8, 1, 1.25, 1.5];
const NARRATION_ACTIVE_ANNOTATION_STYLE = {
  fill: '#3D737A',
  'fill-opacity': '0.18',
  stroke: '#3D737A',
  'stroke-opacity': '0.55',
};
const NARRATION_ACTIVE_ELEMENT_CLASS = 'omr-narration-active-cue';
const NARRATION_EXCERPT_MATCH_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, div, span';
const NARRATION_WRAPPER_ATTRIBUTE = 'data-omr-narration-wrapper';
const NARRATION_PLAYER_PREFERENCE_KEY = 'reader-narration-player-expanded';
const NARRATION_VOICE_PREFERENCE_KEY_PREFIX = 'reader-narration-voice';

function normalizeNarrationHref(value?: string | null) {
  return value ? value.split('#')[0] : null;
}

function normalizeNarrationSearchText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNarrationExcerptProbes(excerpt?: string | null) {
  const normalizedExcerpt = normalizeNarrationSearchText(excerpt);

  if (!normalizedExcerpt) {
    return [] as string[];
  }

  const words = normalizedExcerpt.split(' ').filter(Boolean);
  const probes = [normalizedExcerpt];

  if (words.length >= 14) {
    probes.push(words.slice(0, 14).join(' '));
  }

  if (words.length >= 10) {
    probes.push(words.slice(0, 10).join(' '));
  }

  if (words.length >= 6) {
    probes.push(words.slice(0, 6).join(' '));
  }

  return [...new Set(probes.filter((probe) => probe.length >= 20))];
}

function getNarrationExcerptElementScore(element: HTMLElement, probes: string[]) {
  const text = normalizeNarrationSearchText(element.textContent);

  if (!text || text.length < 16 || probes.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let matchedProbeIndex = -1;

  for (let probeIndex = 0; probeIndex < probes.length; probeIndex += 1) {
    const probe = probes[probeIndex];

    if (text.includes(probe) || probe.includes(text)) {
      matchedProbeIndex = probeIndex;
      break;
    }
  }

  if (matchedProbeIndex < 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const tagName = element.tagName.toLowerCase();
  let score = 260 - matchedProbeIndex * 25;

  if (tagName === 'p') {
    score += 90;
  } else if (tagName === 'blockquote') {
    score += 76;
  } else if (tagName === 'li') {
    score += 64;
  } else if (/^h[1-6]$/.test(tagName)) {
    score += 34;
  } else if (tagName === 'div') {
    score += 18;
  }

  if (element.id) {
    score += 8;
  }

  score -= Math.abs(text.length - probes[0].length) / 20;

  return score;
}

function findNarrationCueElementByExcerpt(doc: Document | undefined, excerpt?: string | null) {
  if (!doc?.body) {
    return null;
  }

  const probes = buildNarrationExcerptProbes(excerpt);

  if (probes.length === 0) {
    return null;
  }

  const elements = Array.from(doc.body.querySelectorAll<HTMLElement>(NARRATION_EXCERPT_MATCH_SELECTOR));
  let bestMatchElement: HTMLElement | null = null;
  let bestMatchScore = Number.NEGATIVE_INFINITY;

  elements.forEach((element) => {
    const score = getNarrationExcerptElementScore(element, probes);

    if (!Number.isFinite(score)) {
      return;
    }

    if (!bestMatchElement || score > bestMatchScore) {
      bestMatchElement = element;
      bestMatchScore = score;
    }
  });

  return bestMatchElement;
}

function escapeNarrationExcerptForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNarrationCueRangeInElement(element: HTMLElement, excerpt?: string | null) {
  const rawExcerpt = String(excerpt || '').trim();

  if (!rawExcerpt) {
    return null;
  }

  const document = element.ownerDocument;
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let currentNode = walker.nextNode();
  let combinedText = '';

  while (currentNode) {
    const textNode = currentNode as Text;
    const start = combinedText.length;
    combinedText += textNode.textContent || '';
    textNodes.push({ node: textNode, start, end: combinedText.length });
    currentNode = walker.nextNode();
  }

  if (combinedText.length === 0) {
    return null;
  }

  const excerptPattern = new RegExp(
    escapeNarrationExcerptForRegExp(rawExcerpt).replace(/\s+/g, '\\s+'),
    'i'
  );
  const match = combinedText.match(excerptPattern);

  if (!match || match.index == null) {
    return null;
  }

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const startEntry = textNodes.find((entry) => startIndex >= entry.start && startIndex < entry.end);
  const endEntry = textNodes.find((entry) => endIndex > entry.start && endIndex <= entry.end)
    || textNodes.find((entry) => endIndex === entry.end);

  if (!startEntry || !endEntry) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startEntry.node, startIndex - startEntry.start);
  range.setEnd(endEntry.node, endIndex - endEntry.start);
  return range;
}

function wrapNarrationCueExcerpt(element: HTMLElement, excerpt?: string | null) {
  const range = findNarrationCueRangeInElement(element, excerpt);

  if (!range || range.collapsed) {
    return null;
  }

  const document = element.ownerDocument;
  const wrapper = document.createElement('span');
  wrapper.setAttribute(NARRATION_WRAPPER_ATTRIBUTE, 'true');
  wrapper.className = NARRATION_ACTIVE_ELEMENT_CLASS;

  try {
    const contents = range.extractContents();
    wrapper.appendChild(contents);
    range.insertNode(wrapper);
    return wrapper;
  } catch (error) {
    console.error('Failed to wrap narration excerpt highlight', error);
    return null;
  }
}

function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatNarrationVoiceName(voiceName?: string | null) {
  const normalizedVoiceName = String(voiceName || '').replace(/^Gemini\s+/i, '').trim();
  return normalizedVoiceName || 'Voice';
}

function getNarrationVoicePreferenceStorageKey(bookId: string) {
  return `${NARRATION_VOICE_PREFERENCE_KEY_PREFIX}-${bookId}`;
}

function isNarrationPlayerPreferenceSyncSkippableStatus(status: number) {
  return status === 401 || status === 403 || status === 404;
}

function resolveNarrationChapterIndexFromChapters(
  chapters: NarrationManifestChapter[],
  preferredHref?: string | null,
  currentCfi?: string | null,
) {
  if (chapters.length === 0) {
    return 0;
  }

  const normalizedPreferredHref = normalizeNarrationHref(preferredHref);

  if (normalizedPreferredHref) {
    const matchingHrefIndex = chapters.findIndex(
      (chapter) => normalizeNarrationHref(chapter.spineHref) === normalizedPreferredHref
    );

    if (matchingHrefIndex >= 0) {
      return matchingHrefIndex;
    }
  }

  if (currentCfi) {
    const matchingCueIndex = chapters.findIndex((chapter) =>
      chapter.cues.some((cue) => cue.targetCfi === currentCfi)
    );

    if (matchingCueIndex >= 0) {
      return matchingCueIndex;
    }
  }

  return 0;
}

const FONT_FAMILIES: { label: string; value: FontFamily }[] = [
  { label: 'Serif', value: 'Crimson Pro' },
  { label: 'Sans', value: 'Inter' },
  { label: 'Classic', value: 'Georgia' },
];

const LINE_SPACINGS: { label: string; value: LineSpacing }[] = [
  { label: 'Compact', value: 1.4 },
  { label: 'Normal', value: 1.6 },
  { label: 'Relaxed', value: 1.9 },
];

const READING_SPEED_WPM = 250; // avg adult reading speed

const TOUR_STEPS = [
  {
    title: 'Turn Pages',
    body: 'Swipe left or right to move between pages. On desktop, use the arrow buttons or keyboard arrow keys.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
      </svg>
    ),
  },
  {
    title: 'Reading Controls',
    body: 'Tap the menu icon at the top-right any time to change theme, font, size, or browse the table of contents.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    title: 'Auto-Saved Progress',
    body: 'Your exact reading position is saved automatically. Pick up right where you left off next time.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
];

export default function Reader({
  url,
  initialLocation,
  bookId,
  title,
  progressSaveEndpoint = null,
  initialNarrationPlayerExpanded = null,
  narrationPlayerPreferenceEndpoint = null,
  narrationAccess,
}: ReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [readerLoadError, setReaderLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState(100);
  const [fontFamily, setFontFamily] = useState<FontFamily>('Crimson Pro');
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(1.6);
  const [flow, setFlow] = useState<Flow>('paginated');
  const [showMenu, setShowMenu] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selectedText, setSelectedText] = useState<{ cfi: string; text: string } | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [twoPage, setTwoPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [editNote, setEditNote] = useState('');
  const [pendingColor, setPendingColor] = useState('yellow');
  const [pendingNote, setPendingNote] = useState('');
  const [inlinePanelEditId, setInlinePanelEditId] = useState<string | null>(null);
  const [inlinePanelNote, setInlinePanelNote] = useState('');
  const [isFading, setIsFading] = useState(false);
  const [goToInput, setGoToInput] = useState('');
  const [showGoTo, setShowGoTo] = useState(false);
  const [currentBookmark, setCurrentBookmark] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [standaloneNotes, setStandaloneNotes] = useState<StandaloneNote[]>([]);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [showNarrationModal, setShowNarrationModal] = useState(false);
  const [isCheckingNarration, setIsCheckingNarration] = useState(false);
  const [narrationStatus, setNarrationStatus] = useState<NarrationStatusPayload | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [currentHref, setCurrentHref] = useState<string | null>(null);
  const [narrationChapterIndex, setNarrationChapterIndex] = useState(0);
  const [narrationCurrentTime, setNarrationCurrentTime] = useState(0);
  const [narrationDuration, setNarrationDuration] = useState(0);
  const [narrationPlaybackRate, setNarrationPlaybackRate] = useState<NarrationPlaybackRate>(1);
  const [isNarrationPlaying, setIsNarrationPlaying] = useState(false);
  const [isNarrationPlayerExpanded, setIsNarrationPlayerExpanded] = useState(Boolean(initialNarrationPlayerExpanded));
  const [selectedNarrationVoiceSlug, setSelectedNarrationVoiceSlug] = useState<string | null>(null);
  const [followNarrationText, setFollowNarrationText] = useState(true);
  const [activeNarrationCue, setActiveNarrationCue] = useState<NarrationManifestCue | null>(null);
  const [narrationPlaybackError, setNarrationPlaybackError] = useState<string | null>(null);

  const locationTimeout = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentCfiRef = useRef<string | null>(null);
  const currentHrefRef = useRef<string | null>(null);
  const dragWrapperRef = useRef<HTMLDivElement>(null);
  const swipeCommittedRef = useRef(false);
  const isFirstRelocate = useRef(true);
  const toolbarHideTimer = useRef<NodeJS.Timeout | null>(null);
  // Always-current mirror of highlights — used inside epub.js annotation callbacks
  // to avoid stale closures when notes are edited after registration.
  const highlightsRef = useRef<Highlight[]>([]);
  // Tracks which CFIs have already been registered so we never double-register.
  const registeredHighlightCfis = useRef<Set<string>>(new Set());
  const activeNarrationCueRef = useRef<NarrationManifestCue | null>(null);
  const activeNarrationCueCfiRef = useRef<string | null>(null);
  const narrationHighlightedElementsRef = useRef<HTMLElement[]>([]);
  const pendingNarrationAutoplayRef = useRef(false);
  const lastNarrationDisplayTargetRef = useRef<string | null>(null);
  const themeRef = useRef(theme);
  const fontSizeRef = useRef(fontSize);
  const fontFamilyRef = useRef(fontFamily);
  const lineSpacingRef = useRef(lineSpacing);

  const narrationVoiceOptions = useMemo<NarrationFeatureVoiceOption[]>(() => {
    if (narrationStatus?.voices?.length) {
      return narrationStatus.voices;
    }

    if (narrationStatus?.manifest) {
      return [{
        narrationId: narrationStatus.manifest.narrationId,
        active: true,
        totalDurationMs: narrationStatus.manifest.totalDurationMs,
        chapterCount: narrationStatus.manifest.chapterCount,
        manifest: narrationStatus.manifest,
        manifestUrl: narrationStatus.manifestUrl,
        voice: narrationStatus.manifest.voice,
      }];
    }

    return [];
  }, [narrationStatus]);
  const activeNarrationVoiceOption = useMemo(() => {
    return narrationVoiceOptions.find(
      (voiceOption) => voiceOption.voice.slug === selectedNarrationVoiceSlug
    ) ?? narrationVoiceOptions.find(
      (voiceOption) => voiceOption.voice.slug === narrationStatus?.defaultVoiceSlug
    ) ?? narrationVoiceOptions.find((voiceOption) => voiceOption.active)
      ?? narrationVoiceOptions[0]
      ?? null;
  }, [narrationStatus?.defaultVoiceSlug, narrationVoiceOptions, selectedNarrationVoiceSlug]);
  const narrationManifest = useMemo(
    () => activeNarrationVoiceOption?.manifest ?? narrationStatus?.manifest ?? null,
    [activeNarrationVoiceOption, narrationStatus?.manifest]
  );
  const narrationChapters = useMemo(
    () => narrationManifest?.chapters ?? [],
    [narrationManifest]
  );
  const activeNarrationChapter = narrationChapters[narrationChapterIndex] ?? null;
  const narrationHasReadyPlayer = Boolean(narrationStatus?.available && narrationManifest && narrationChapters.length > 0);
  const activeNarrationVoiceName = activeNarrationVoiceOption
    ? formatNarrationVoiceName(activeNarrationVoiceOption.voice.name)
    : narrationManifest
      ? formatNarrationVoiceName(narrationManifest.voice.name)
      : 'Voice';
  const narrationPlaybackMax = Math.max(
    narrationDuration,
    activeNarrationChapter?.durationMs ? activeNarrationChapter.durationMs / 1000 : 0,
    1
  );
  const narrationPlayerMessage = narrationPlaybackError
    || activeNarrationCue?.excerpt
    || narrationStatus?.message
    || 'Narrated mode is ready to stream.';
  const narrationPlayerTitle = activeNarrationChapter?.title || `Chapter ${narrationChapterIndex + 1}`;
  const narrationFeatureEnabled = Boolean(narrationAccess && narrationAccess.isEnabled !== false);
  const narrationPlaybackProgressPct = narrationPlaybackMax > 0
    ? Math.min(Math.max((narrationCurrentTime / narrationPlaybackMax) * 100, 0), 100)
    : 0;
  const readerViewportInsetClass = narrationHasReadyPlayer
    ? isNarrationPlayerExpanded
      ? 'pb-32 sm:pb-28 lg:pb-24'
      : 'pb-20 sm:pb-16'
    : '';

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    fontFamilyRef.current = fontFamily;
  }, [fontFamily]);

  useEffect(() => {
    lineSpacingRef.current = lineSpacing;
  }, [lineSpacing]);

  // ── First-time tour ──────────────────────────────────────────────
  useEffect(() => {
    const seen = localStorage.getItem('reader-tour-seen');
    if (!seen) setShowTour(true);
  }, []);

  const dismissTour = () => {
    localStorage.setItem('reader-tour-seen', '1');
    setShowTour(false);
    setTourStep(0);
  };

  // Reveal the mobile toolbar and start a 3-second auto-hide timer.
  const revealToolbar = useCallback(() => {
    setShowMobileToolbar(true);
    if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current);
    toolbarHideTimer.current = setTimeout(() => setShowMobileToolbar(false), 3000);
  }, []);

  const persistNarrationPlayerPreference = useCallback(async (expanded: boolean) => {
    try {
      localStorage.setItem(NARRATION_PLAYER_PREFERENCE_KEY, expanded ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save the narration player preference locally', error);
    }

    if (!narrationPlayerPreferenceEndpoint) {
      return;
    }

    try {
      const response = await fetch(narrationPlayerPreferenceEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrationPlayerExpanded: expanded }),
      });

      if (!response.ok) {
        if (isNarrationPlayerPreferenceSyncSkippableStatus(response.status)) {
          return;
        }

        throw new Error(`Preference sync failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to sync the narration player preference', error);
    }
  }, [narrationPlayerPreferenceEndpoint]);

  useEffect(() => {
    if (typeof initialNarrationPlayerExpanded === 'boolean') {
      setIsNarrationPlayerExpanded(initialNarrationPlayerExpanded);

      try {
        localStorage.setItem(
          NARRATION_PLAYER_PREFERENCE_KEY,
          initialNarrationPlayerExpanded ? 'true' : 'false'
        );
      } catch (error) {
        console.error('Failed to mirror the narration player preference locally', error);
      }

      return;
    }

    try {
      const savedPreference = localStorage.getItem(NARRATION_PLAYER_PREFERENCE_KEY);

      if (savedPreference === 'true' || savedPreference === 'false') {
        const expanded = savedPreference === 'true';
        setIsNarrationPlayerExpanded(expanded);

        if (narrationPlayerPreferenceEndpoint) {
          void persistNarrationPlayerPreference(expanded);
        }
      }
    } catch (error) {
      console.error('Failed to load the narration player preference', error);
    }
  }, [initialNarrationPlayerExpanded, narrationPlayerPreferenceEndpoint, persistNarrationPlayerPreference]);

  const expandNarrationPlayer = useCallback((persistPreference = true) => {
    setIsNarrationPlayerExpanded(true);

    if (!persistPreference) {
      return;
    }

    void persistNarrationPlayerPreference(true);
  }, [persistNarrationPlayerPreference]);

  const collapseNarrationPlayer = useCallback((persistPreference = true) => {
    setIsNarrationPlayerExpanded(false);

    if (!persistPreference) {
      return;
    }

    void persistNarrationPlayerPreference(false);
  }, [persistNarrationPlayerPreference]);

  // ── Keyboard navigation ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isReady) return;
      if (showSearch || showGoTo) return; // don't intercept while typing
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renditionRef.current?.next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') renditionRef.current?.prev();
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowSearch(true); }
      if (e.key === 'Escape') { setShowSearch(false); setShowGoTo(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isReady, showSearch, showGoTo]);

  // ── Swipe helpers (called from epub.js rendition events, not React) ──
  const onIframeTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    if (dragWrapperRef.current) {
      dragWrapperRef.current.style.transition = 'none';
    }
  };

  const onIframeTouchMove = (e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && dragWrapperRef.current) {
      // Rubber-band: resistance near edges for a natural feel
      const damped = dx * 0.6;
      dragWrapperRef.current.style.transform = `translateX(${damped}px)`;
    }
  };

  const onIframeTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    const committed = isHorizontal && Math.abs(dx) > 44;

    if (committed && dragWrapperRef.current) {
      // Snap off-screen in swipe direction, then navigate
      swipeCommittedRef.current = true;
      const snapX = dx < 0 ? -window.innerWidth : window.innerWidth;
      dragWrapperRef.current.style.transition = 'transform 0.22s ease-in';
      dragWrapperRef.current.style.transform = `translateX(${snapX}px)`;
      setTimeout(() => {
        // Instantly reset (new content will render), then navigate
        if (dragWrapperRef.current) {
          dragWrapperRef.current.style.transition = 'none';
          dragWrapperRef.current.style.transform = 'translateX(0)';
        }
        if (dx < 0) renditionRef.current?.next();
        else renditionRef.current?.prev();
      }, 220);
    } else if (!committed && dragWrapperRef.current) {
      // Snap back
      dragWrapperRef.current.style.transition = 'transform 0.25s ease-out';
      dragWrapperRef.current.style.transform = 'translateX(0)';
    }

    // Tap (negligible movement) → reveal mobile toolbar
    if (!committed && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      revealToolbar();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Save progress
  const saveProgress = useCallback(async (cfi: string, percentage: number) => {
    if (!progressSaveEndpoint) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }

    try {
      await fetch(progressSaveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, cfi, progress: percentage * 100 }),
      });
    } catch (error) {
      console.error('Failed to save progress', error);
    }
  }, [bookId, progressSaveEndpoint]);

  useEffect(() => {
    const handleOnline = () => {
      const currentCfi = currentCfiRef.current;

      if (!currentCfi) {
        return;
      }

      void saveProgress(currentCfi, progressPct / 100);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [progressPct, saveProgress]);

  const loadNarrationStatus = useCallback(async (force = false) => {
    if (!narrationFeatureEnabled || !narrationAccess?.hasAccess || isCheckingNarration) return;
    if (narrationStatus && !force) return;

    setIsCheckingNarration(true);
    if (force) {
      setNarrationStatus(null);
    }
    setNarrationError(null);

    try {
      const response = await fetch(narrationAccess.statusEndpoint, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as NarrationStatusPayload | null;

      if (payload) {
        setNarrationStatus(payload);
      }

      if (!response.ok && !payload?.message) {
        setNarrationError('Unable to load narration status right now.');
      }
    } catch (error) {
      console.error('Failed to load narration status', error);
      setNarrationError('Unable to load narration status right now.');
    } finally {
      setIsCheckingNarration(false);
    }
  }, [isCheckingNarration, narrationAccess, narrationFeatureEnabled, narrationStatus]);

  const openNarrationModal = useCallback(() => {
    setShowNarrationModal(true);
    void loadNarrationStatus();
  }, [loadNarrationStatus]);

  const ensureNarrationCueStyles = useCallback(() => {
    const contents = (renditionRef.current as any)?.getContents?.() ?? [];

    contents.forEach((content: any) => {
      const doc = content?.document as Document | undefined;

      if (!doc || doc.getElementById('omr-narration-cue-style')) {
        return;
      }

      const style = doc.createElement('style');
      style.id = 'omr-narration-cue-style';
      style.textContent = `
        .${NARRATION_ACTIVE_ELEMENT_CLASS} {
          background: rgba(61, 115, 122, 0.16) !important;
          box-shadow: 0 0 0 3px rgba(61, 115, 122, 0.18) !important;
          border-radius: 0.35rem;
          transition: background-color 160ms ease, box-shadow 160ms ease;
        }
      `;

      doc.head?.appendChild(style);
    });
  }, []);

  const clearNarrationCueHighlight = useCallback(() => {
    if (renditionRef.current && activeNarrationCueCfiRef.current) {
      try {
        renditionRef.current.annotations.remove(activeNarrationCueCfiRef.current, 'highlight');
      } catch (error) {
        console.error('Failed to remove narration highlight', error);
      }
    }

    activeNarrationCueCfiRef.current = null;

    narrationHighlightedElementsRef.current.forEach((element) => {
      if (element.getAttribute(NARRATION_WRAPPER_ATTRIBUTE) === 'true') {
        const parent = element.parentNode;

        while (element.firstChild) {
          parent?.insertBefore(element.firstChild, element);
        }

        parent?.removeChild(element);
        parent?.normalize?.();
        return;
      }

      element.classList.remove(NARRATION_ACTIVE_ELEMENT_CLASS);
    });
    narrationHighlightedElementsRef.current = [];
  }, []);

  const applyNarrationCueHighlight = useCallback((cue: NarrationManifestCue | null) => {
    clearNarrationCueHighlight();

    if (!cue) {
      return;
    }

    ensureNarrationCueStyles();

    if (cue.targetCfi && renditionRef.current) {
      try {
        renditionRef.current.annotations.highlight(
          cue.targetCfi,
          {},
          undefined,
          'hl-narration-active',
          NARRATION_ACTIVE_ANNOTATION_STYLE
        );
        activeNarrationCueCfiRef.current = cue.targetCfi;
      } catch (error) {
        console.error('Failed to apply narration CFI highlight', error);
      }
    }

    if (cue.targetElementId || cue.excerpt) {
      const contents = (renditionRef.current as any)?.getContents?.() ?? [];
      const nextElements: HTMLElement[] = [];

      contents.forEach((content: any) => {
        const doc = content?.document as Document | undefined;
        const excerptMatchedElement = findNarrationCueElementByExcerpt(doc, cue.excerpt);
        const element = excerptMatchedElement ?? doc?.getElementById(cue.targetElementId ?? '');
        const frameHTMLElement = doc?.defaultView?.HTMLElement;

        if (element && (!frameHTMLElement || element instanceof frameHTMLElement)) {
          const htmlElement = element as HTMLElement;
          const wrappedExcerpt = cue.excerpt ? wrapNarrationCueExcerpt(htmlElement, cue.excerpt) : null;

          if (wrappedExcerpt) {
            nextElements.push(wrappedExcerpt);
          } else {
            htmlElement.classList.add(NARRATION_ACTIVE_ELEMENT_CLASS);
            nextElements.push(htmlElement);
          }
        }
      });

      narrationHighlightedElementsRef.current = nextElements;
    }
  }, [clearNarrationCueHighlight, ensureNarrationCueStyles]);

  const resolveNarrationChapterIndex = useCallback((preferredHref?: string | null) => {
    return resolveNarrationChapterIndexFromChapters(
      narrationChapters,
      preferredHref ?? currentHrefRef.current,
      currentCfiRef.current,
    );
  }, [narrationChapters]);

  const handleNarrationVoiceChange = useCallback((voiceSlug: string) => {
    const nextVoiceOption = narrationVoiceOptions.find((voiceOption) => voiceOption.voice.slug === voiceSlug);

    if (!nextVoiceOption || selectedNarrationVoiceSlug === voiceSlug) {
      return;
    }

    pendingNarrationAutoplayRef.current = isNarrationPlaying;
    audioRef.current?.pause();
    setNarrationPlaybackError(null);
    setSelectedNarrationVoiceSlug(voiceSlug);

    try {
      localStorage.setItem(getNarrationVoicePreferenceStorageKey(bookId), voiceSlug);
    } catch (error) {
      console.error('Failed to save the narration voice preference', error);
    }

    const nextChapterIndex = resolveNarrationChapterIndexFromChapters(
      nextVoiceOption.manifest.chapters,
      currentHrefRef.current,
      currentCfiRef.current,
    );

    setNarrationChapterIndex(nextChapterIndex);
    setNarrationCurrentTime(0);
    setNarrationDuration(
      nextVoiceOption.manifest.chapters[nextChapterIndex]?.durationMs
        ? nextVoiceOption.manifest.chapters[nextChapterIndex].durationMs / 1000
        : 0
    );
    setActiveNarrationCue(null);
    lastNarrationDisplayTargetRef.current = null;
    expandNarrationPlayer(false);
  }, [
    bookId,
    expandNarrationPlayer,
    isNarrationPlaying,
    narrationVoiceOptions,
    selectedNarrationVoiceSlug,
  ]);

  const skipNarrationChapter = useCallback((direction: -1 | 1) => {
    if (narrationChapters.length === 0) {
      return;
    }

    const nextIndex = Math.min(
      Math.max(narrationChapterIndex + direction, 0),
      narrationChapters.length - 1
    );

    if (nextIndex === narrationChapterIndex) {
      return;
    }

    pendingNarrationAutoplayRef.current = isNarrationPlaying;
    setNarrationPlaybackError(null);
    setNarrationChapterIndex(nextIndex);
    setNarrationCurrentTime(0);
    setNarrationDuration(narrationChapters[nextIndex].durationMs ? narrationChapters[nextIndex].durationMs / 1000 : 0);
    lastNarrationDisplayTargetRef.current = null;
  }, [isNarrationPlaying, narrationChapterIndex, narrationChapters]);

  const toggleNarrationPlayback = useCallback(async () => {
    if (!narrationAccess?.hasAccess) {
      openNarrationModal();
      return;
    }

    if (!narrationHasReadyPlayer || !activeNarrationChapter?.audio.url) {
      setShowNarrationModal(true);
      void loadNarrationStatus(true);
      return;
    }

    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (isNarrationPlaying) {
      audio.pause();
      return;
    }

    const suggestedChapterIndex = resolveNarrationChapterIndex(currentHref);
    if (suggestedChapterIndex !== narrationChapterIndex) {
      pendingNarrationAutoplayRef.current = true;
      setNarrationPlaybackError(null);
      setNarrationChapterIndex(suggestedChapterIndex);
      setNarrationCurrentTime(0);
      setNarrationDuration(
        narrationChapters[suggestedChapterIndex]?.durationMs
          ? narrationChapters[suggestedChapterIndex].durationMs / 1000
          : 0
      );
      lastNarrationDisplayTargetRef.current = null;
      return;
    }

    try {
      setNarrationPlaybackError(null);
      await audio.play();
    } catch (error) {
      console.error('Unable to start narration playback', error);
      setNarrationPlaybackError('Unable to start narration playback right now.');
    }
  }, [
    activeNarrationChapter?.audio.url,
    currentHref,
    isNarrationPlaying,
    loadNarrationStatus,
    narrationAccess?.hasAccess,
    narrationChapterIndex,
    narrationChapters,
    narrationHasReadyPlayer,
    openNarrationModal,
    resolveNarrationChapterIndex,
  ]);

  const handleNarrationSeek = useCallback((nextTime: number) => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = nextTime;
    setNarrationCurrentTime(nextTime);
    lastNarrationDisplayTargetRef.current = null;
  }, []);

  // Load highlights, bookmarks and notes
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        const [hRes, bRes, nRes] = await Promise.all([
          fetch(`/api/highlights?bookId=${bookId}`),
          fetch(`/api/bookmarks?bookId=${bookId}`),
          fetch(`/api/notes?bookId=${bookId}`),
        ]);
        if (hRes.ok) setHighlights(await hRes.json());
        if (bRes.ok) setBookmarks(await bRes.json());
        if (nRes.ok) setStandaloneNotes(await nRes.json());
      } catch (error) {
        console.error('Failed to load annotations', error);
      }
    };
    loadAnnotations();
  }, [bookId]);

  useEffect(() => {
    activeNarrationCueRef.current = activeNarrationCue;
  }, [activeNarrationCue]);

  useEffect(() => {
    if (narrationPlaybackError) {
      expandNarrationPlayer(false);
    }
  }, [expandNarrationPlayer, narrationPlaybackError]);

  useEffect(() => {
    if (!narrationAccess?.hasAccess || narrationStatus || isCheckingNarration) {
      return;
    }

    void loadNarrationStatus();
  }, [isCheckingNarration, loadNarrationStatus, narrationAccess?.hasAccess, narrationStatus]);

  useEffect(() => {
    if (narrationVoiceOptions.length === 0) {
      setSelectedNarrationVoiceSlug(null);
      return;
    }

    let savedVoiceSlug: string | null = null;

    try {
      savedVoiceSlug = localStorage.getItem(getNarrationVoicePreferenceStorageKey(bookId));
    } catch (error) {
      console.error('Failed to read the narration voice preference', error);
    }

    const nextVoiceSlug = [
      selectedNarrationVoiceSlug,
      savedVoiceSlug,
      narrationStatus?.defaultVoiceSlug ?? null,
      narrationVoiceOptions.find((voiceOption) => voiceOption.active)?.voice.slug ?? null,
      narrationVoiceOptions[0]?.voice.slug ?? null,
    ].find(
      (voiceSlug): voiceSlug is string => Boolean(
        voiceSlug && narrationVoiceOptions.some((voiceOption) => voiceOption.voice.slug === voiceSlug)
      )
    ) ?? null;

    if (nextVoiceSlug !== selectedNarrationVoiceSlug) {
      setSelectedNarrationVoiceSlug(nextVoiceSlug);
    }
  }, [bookId, narrationStatus?.defaultVoiceSlug, narrationVoiceOptions, selectedNarrationVoiceSlug]);

  useEffect(() => {
    if (!narrationHasReadyPlayer) {
      return;
    }

    const nextChapterIndex = resolveNarrationChapterIndex(currentHref);

    if (nextChapterIndex === narrationChapterIndex) {
      return;
    }

    if (isNarrationPlaying) {
      pendingNarrationAutoplayRef.current = true;
      audioRef.current?.pause();
    }

    setNarrationPlaybackError(null);
    setNarrationChapterIndex(nextChapterIndex);
    setNarrationCurrentTime(0);
    setNarrationDuration(
      narrationChapters[nextChapterIndex]?.durationMs
        ? narrationChapters[nextChapterIndex].durationMs / 1000
        : 0
    );
    setActiveNarrationCue(null);
    lastNarrationDisplayTargetRef.current = null;
  }, [
    currentHref,
    isNarrationPlaying,
    narrationChapterIndex,
    narrationChapters,
    narrationHasReadyPlayer,
    resolveNarrationChapterIndex,
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !activeNarrationChapter?.audio.url) {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
      }
      setNarrationCurrentTime(0);
      setNarrationDuration(0);
      setActiveNarrationCue(null);
      return;
    }

    const nextSource = activeNarrationChapter.audio.url;

    if (audio.getAttribute('src') !== nextSource) {
      audio.setAttribute('src', nextSource);
      audio.load?.();
    }

    setNarrationCurrentTime(0);
    setNarrationDuration(activeNarrationChapter.durationMs ? activeNarrationChapter.durationMs / 1000 : 0);
    setActiveNarrationCue(null);
  }, [activeNarrationChapter?.audio.url, activeNarrationChapter?.durationMs]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.playbackRate = narrationPlaybackRate;
  }, [narrationPlaybackRate]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      setNarrationCurrentTime(audio.currentTime || 0);
    };

    const handleLoadedMetadata = () => {
      const resolvedDuration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : activeNarrationChapter?.durationMs
          ? activeNarrationChapter.durationMs / 1000
          : 0;

      setNarrationDuration(resolvedDuration);

      if (pendingNarrationAutoplayRef.current) {
        pendingNarrationAutoplayRef.current = false;
        audio.play().catch((error) => {
          console.error('Unable to continue narration playback', error);
          setNarrationPlaybackError('Unable to continue narration playback right now.');
        });
      }
    };

    const handlePlay = () => {
      setIsNarrationPlaying(true);
      setNarrationPlaybackError(null);
    };

    const handlePause = () => {
      setIsNarrationPlaying(false);
    };

    const handleEnded = () => {
      if (narrationChapterIndex < narrationChapters.length - 1) {
        pendingNarrationAutoplayRef.current = true;
        setNarrationChapterIndex((previousIndex) => previousIndex + 1);
        lastNarrationDisplayTargetRef.current = null;
        return;
      }

      setIsNarrationPlaying(false);
      setActiveNarrationCue(null);
    };

    const handleError = () => {
      pendingNarrationAutoplayRef.current = false;
      setIsNarrationPlaying(false);
      setNarrationPlaybackError('Unable to stream narration audio right now.');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [activeNarrationChapter?.durationMs, narrationChapterIndex, narrationChapters.length]);

  useEffect(() => {
    if (!activeNarrationChapter || activeNarrationChapter.cues.length === 0) {
      setActiveNarrationCue(null);
      return;
    }

    const currentTimeMs = narrationCurrentTime * 1000;
    const matchingCue = activeNarrationChapter.cues.find((cue, index) => {
      const nextCue = activeNarrationChapter.cues[index + 1];
      return currentTimeMs >= cue.startMs && (!nextCue || currentTimeMs < nextCue.startMs);
    }) ?? null;

    setActiveNarrationCue((previousCue) => {
      if (
        previousCue?.sequence === matchingCue?.sequence &&
        previousCue?.targetCfi === matchingCue?.targetCfi &&
        previousCue?.targetHref === matchingCue?.targetHref
      ) {
        return previousCue;
      }

      return matchingCue;
    });
  }, [activeNarrationChapter, narrationCurrentTime]);

  useEffect(() => {
    if (!activeNarrationCue) {
      clearNarrationCueHighlight();
      return;
    }

    let cancelled = false;

    const syncCue = async () => {
      const targetLocation = activeNarrationCue.targetCfi ?? activeNarrationCue.targetHref;

      try {
        if (followNarrationText && targetLocation && lastNarrationDisplayTargetRef.current !== targetLocation) {
          lastNarrationDisplayTargetRef.current = targetLocation;
          await renditionRef.current?.display(targetLocation);
        }
      } catch (error) {
        console.error('Failed to sync narration cue to the reader', error);
      }

      if (!cancelled) {
        applyNarrationCueHighlight(activeNarrationCue);
      }
    };

    void syncCue();

    return () => {
      cancelled = true;
    };
  }, [activeNarrationCue, applyNarrationCueHighlight, clearNarrationCueHighlight, followNarrationText]);

  useEffect(() => () => {
    clearNarrationCueHighlight();
  }, [clearNarrationCueHighlight]);

  // Initialize book - only once!
  useEffect(() => {
    if (!viewerRef.current) return;

    let destroyed = false;
    let renditionInstance: Rendition | null = null;
    const registeredHighlightCfisForRender = registeredHighlightCfis.current;

    setIsReady(false);
    setReaderLoadError(null);

    const resetRenderedBook = () => {
      renditionInstance?.destroy();
      renditionInstance = null;
      renditionRef.current = null;
      bookRef.current = null;
    };

    const initializeBookFromBinary = async (bookSource: ArrayBuffer) => {
      const book = ePub(bookSource, { openAs: 'binary' }) as unknown as Book;
      bookRef.current = book;

      // Use explicit pixel dimensions so epub.js paginates correctly
      const container = viewerRef.current!;
      const rendition = book.renderTo(container, {
        width: container.clientWidth || window.innerWidth,
        height: container.clientHeight || window.innerHeight,
        flow: flow === 'scrolled' ? 'scrolled' : 'paginated',
        spread: twoPage ? 'auto' : 'none',
      }) as Rendition;

      renditionInstance = rendition;
      renditionRef.current = rendition;

      // Register themes
      rendition.themes.default({
        body: {
          'box-shadow': 'none !important',
          'border': 'none !important',
          'border-radius': '0 !important',
          'margin': '0 !important',
          'max-width': 'none !important',
        },
      });

      rendition.themes.register('light', {
        body: { background: '#ffffff', color: '#000000' },
      });
      rendition.themes.register('dark', {
        body: { background: '#1a1a1a', color: '#e0e0e0' },
      });
      rendition.themes.register('sepia', {
        body: { background: '#f4ecd8', color: '#5c4a3a' },
      });

      rendition.themes.select(themeRef.current);
      rendition.themes.fontSize(`${fontSizeRef.current}%`);
      rendition.themes.font(fontFamilyRef.current);
      rendition.themes.override('line-height', String(lineSpacingRef.current));

      // Display book — resume position when two-page/flow mode changes.
      // Priority: in-memory ref (layout change) › localStorage (refresh within debounce) › server DB › beginning.
      const localCfi = typeof window !== 'undefined' ? localStorage.getItem(`reader-progress-${bookId}`) : null;
      const resumeAt = currentCfiRef.current ?? localCfi ?? initialLocation;

      try {
        if (resumeAt) {
          await rendition.display(resumeAt);
        } else {
          await rendition.display();
        }
      } catch (error) {
        if (!resumeAt) {
          throw error;
        }

        console.error('Failed to resume the saved reader location, falling back to the beginning of the book', error);
        await rendition.display();
      }

      if (!destroyed) {
        setReaderLoadError(null);
        setIsReady(true);
        isFirstRelocate.current = true;
      }

      // Deferred word-count — runs after the reader is visible so it never
      // blocks the critical rendering path. Uses requestIdleCallback where
      // available, falls back to setTimeout.
      const scheduleWordCount = (cb: () => void) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(cb, { timeout: 5000 });
        } else {
          setTimeout(cb, 500);
        }
      };

      scheduleWordCount(async () => {
        if (destroyed) return;
        try {
          const spineItems = (book as any).spine?.spineItems as any[] | undefined;
          if (!spineItems?.length) return;

          let total = 0;
          for (const item of spineItems) {
            if (destroyed) return;
            await item.load((book as any).load.bind(book));
            const text: string = item.document?.body?.textContent ?? '';
            total += text.split(/\s+/).filter(Boolean).length;
            item.unload();
          }

          if (!destroyed) {
            setWordCount(total);
          }
        } catch (err) {
          console.warn('Word count calculation failed', err);
        }
      });

      // Swipe navigation via epub.js relay (works across the iframe boundary)
      rendition.on('touchstart', onIframeTouchStart);
      rendition.on('touchmove', onIframeTouchMove);
      rendition.on('touchend', onIframeTouchEnd);
      rendition.on('rendered', () => {
        ensureNarrationCueStyles();

        if (activeNarrationCueRef.current) {
          applyNarrationCueHighlight(activeNarrationCueRef.current);
        }
      });

      // Handle text selection
      rendition.on('selected', (cfiRange: string) => {
        const iframe = viewerRef.current?.querySelector('iframe');
        const text = iframe?.contentWindow?.getSelection()?.toString() || '';
        if (text) {
          setSelectedText({ cfi: cfiRange, text });
        }
      });

      // Track location changes
      rendition.on('relocated', (location: any) => {
        if (locationTimeout.current) clearTimeout(locationTimeout.current);
        currentCfiRef.current = location.start.cfi;
        const nextHref = normalizeNarrationHref(location?.start?.href ?? null);
        currentHrefRef.current = nextHref;
        setCurrentHref(nextHref);
        // Persist synchronously to localStorage so a refresh within the
        // DB debounce window still restores the correct position.
        try { localStorage.setItem(`reader-progress-${bookId}`, location.start.cfi); } catch (_) {}

        const currentLocation = location.start.index || 0;
        setCurrentPage(currentLocation + 1);

        if (location.end && location.end.index) {
          setTotalPages(location.end.index + 1);
        }

        const pct = location.start.percentage || 0;
        setProgressPct(pct * 100);

        // Update current bookmark state
        setCurrentBookmark(null);

        // Page turn crossfade (skip for swipe — animation already played, skip first display)
        if (!isFirstRelocate.current && !swipeCommittedRef.current) {
          setIsFading(true);
          setTimeout(() => setIsFading(false), 120);
        }
        swipeCommittedRef.current = false;
        isFirstRelocate.current = false;

        locationTimeout.current = setTimeout(() => {
          saveProgress(location.start.cfi, pct);
        }, 1000);
      });
    };

    const initBook = async () => {
      if (destroyed || !viewerRef.current) return;

      let loadedBookSource: 'cache' | 'network' | null = null;

      const loadAndInitializeBook = async (options?: { forceNetwork?: boolean }) => {
        let loadedBook;

        try {
          loadedBook = await loadBookBinary(url, options);
        } catch (error) {
          console.error('Failed to load the EPUB file for the reader', error);
          throw error;
        }

        loadedBookSource = loadedBook.source;
        await initializeBookFromBinary(loadedBook.buffer);
      };

      try {
        await loadAndInitializeBook();
      } catch (error) {
        const shouldRetryFromNetwork = !destroyed
          && loadedBookSource === 'cache'
          && typeof navigator !== 'undefined'
          && navigator.onLine !== false;

        if (!shouldRetryFromNetwork) {
          throw error;
        }

        console.warn(
          'Cached EPUB failed to initialize. Clearing the saved copy and retrying from the network.',
          error,
        );

        resetRenderedBook();
        await clearCachedBookBinary(url).catch(() => undefined);
        await loadAndInitializeBook({ forceNetwork: true });
      }
    };

    initBook().catch((error) => {
      console.error('Failed to initialize the reader', error);

      if (!destroyed) {
        setReaderLoadError(
          isBookLoadErrorCode(error, 'BOOK_CACHE_MISS_OFFLINE')
            ? 'This book is not saved on this device yet. Open it online once and it will be ready instantly on this device—even offline.'
            : 'We could not open this page right away. Please refresh and try again.'
        );
      }
    });

    return () => {
      destroyed = true;
      // Clear the registered-CFI set so highlights are re-annotated on the
      // fresh rendition after a re-initialization.
      registeredHighlightCfisForRender.clear();
      if (locationTimeout.current) clearTimeout(locationTimeout.current);
      resetRenderedBook();
    };
  }, [
    applyNarrationCueHighlight,
    bookId,
    ensureNarrationCueStyles,
    flow,
    initialLocation,
    saveProgress,
    twoPage,
    url,
  ]); // Re-initialize if URL, page-spread, or flow mode changes

  // Keep the ref in sync so annotation callbacks always see the latest note text.
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  // Register NEW highlights only — never re-register an already-annotated CFI.
  // This prevents stale-closure bugs (old note showing on click) and duplicate
  // event listeners that would fire the modal multiple times per click.
  useEffect(() => {
    if (!renditionRef.current || highlights.length === 0) return;

    highlights.forEach((h) => {
      if (registeredHighlightCfis.current.has(h.cfi)) return;

      renditionRef.current?.annotations.highlight(
        h.cfi,
        {},
        () => {
          // Read from ref — always gets the latest note even after edits.
          const current = highlightsRef.current.find(x => x.id === h.id);
          if (current) {
            setEditingHighlight(current);
            setEditNote(current.note || '');
          }
        },
        'hl-' + h.color,
        { fill: h.color, 'fill-opacity': '0.3' }
      );

      registeredHighlightCfis.current.add(h.cfi);
    });
  }, [highlights]);

  // ResizeObserver: keep epub.js pagination in sync with the CSS-sized book container
  useEffect(() => {
    if (!isReady || !viewerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) renditionRef.current?.resize(width, height);
    });
    ro.observe(viewerRef.current);
    return () => ro.disconnect();
  }, [isReady]);

  // Theme switching
  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    renditionRef.current?.themes.select(newTheme);
  }, []);

  // Font size
  const changeFontSize = useCallback((delta: number) => {
    const newSize = Math.max(80, Math.min(150, fontSize + delta));
    setFontSize(newSize);
    renditionRef.current?.themes.fontSize(`${newSize}%`);
  }, [fontSize]);

  // Font family
  const changeFontFamily = useCallback((family: FontFamily) => {
    setFontFamily(family);
    renditionRef.current?.themes.font(family);
  }, []);

  // Line spacing
  const changeLineSpacing = useCallback((spacing: LineSpacing) => {
    setLineSpacing(spacing);
    renditionRef.current?.themes.override('line-height', String(spacing));
  }, []);

  // Add highlight (color + optional note in one step)
  const addHighlight = async () => {
    if (!selectedText) return;
    const color = pendingColor;
    const note = pendingNote.trim() || undefined;

    try {
      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, cfi: selectedText.cfi, text: selectedText.text, color, note }),
      });

      if (res.ok) {
        const newHighlight = await res.json();
        setHighlights([...highlights, newHighlight]);
        renditionRef.current?.annotations.highlight(
          newHighlight.cfi,
          {},
          () => {
            const current = highlightsRef.current.find(x => x.id === newHighlight.id);
            if (current) { setEditingHighlight(current); setEditNote(current.note || ''); }
          },
          'hl-' + color,
          { fill: color, 'fill-opacity': '0.3' }
        );
      }
    } catch (error) {
      console.error('Failed to add highlight', error);
    }

    setSelectedText(null);
    setPendingNote('');
    setPendingColor('yellow');
  };

  // Save highlight note
  const saveHighlightNote = async () => {
    if (!editingHighlight) return;
    try {
      const res = await fetch(`/api/highlights/${editingHighlight.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: editNote }),
      });
      if (res.ok) {
        setHighlights(highlights.map(h =>
          h.id === editingHighlight.id ? { ...h, note: editNote } : h
        ));
      }
    } catch (error) {
      console.error('Failed to save note', error);
    }
    setEditingHighlight(null);
  };

  // Delete highlight
  const deleteHighlight = async (id: string, cfi: string) => {
    try {
      await fetch(`/api/highlights?id=${id}`, { method: 'DELETE' });
      setHighlights(highlights.filter(h => h.id !== id));
      renditionRef.current?.annotations.remove(cfi, 'highlight');
      // Allow re-registration if this CFI is ever highlighted again.
      registeredHighlightCfis.current.delete(cfi);
    } catch (error) {
      console.error('Failed to delete highlight', error);
    }
    setEditingHighlight(null);
  };

  // Save a standalone note at current CFI
  const saveQuickNote = async () => {
    const cfi = currentCfiRef.current;
    const text = quickNoteText.trim();
    if (!cfi || !text) return;
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, cfi, content: text }),
      });
      if (res.ok) {
        const note = await res.json();
        setStandaloneNotes(prev => [note, ...prev]);
      }
    } catch (e) { console.error(e); }
    setShowQuickNote(false);
    setQuickNoteText('');
  };

  // Update standalone note content
  const updateStandaloneNote = async (id: string, content: string) => {
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) setStandaloneNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
    } catch (e) { console.error(e); }
    setEditingNoteId(null);
  };

  // Delete standalone note
  const deleteStandaloneNote = async (id: string) => {
    try {
      await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setStandaloneNotes(prev => prev.filter(n => n.id !== id));
    } catch (e) { console.error(e); }
  };

  // Toggle bookmark at current location
  const toggleBookmark = async () => {
    const cfi = currentCfiRef.current;
    if (!cfi) return;
    const existing = bookmarks.find(b => b.cfi === cfi);
    if (existing) {
      // Remove
      try {
        await fetch(`/api/bookmarks?id=${existing.id}`, { method: 'DELETE' });
        setBookmarks(bookmarks.filter(b => b.id !== existing.id));
        setCurrentBookmark(null);
      } catch (e) { console.error(e); }
    } else {
      // Add
      try {
        const chapterLabel = (bookRef.current as any)?.navigation?.toc?.find(
          (item: any) => item.href && cfi.includes(item.href.split('#')[0])
        )?.label || '';
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, cfi, chapter: chapterLabel, label: `Page ${currentPage}` }),
        });
        if (res.ok) {
          const b = await res.json();
          setBookmarks([...bookmarks, b]);
          setCurrentBookmark(cfi);
        }
      } catch (e) { console.error(e); }
    }
  };

  // In-book search — uses epub.js Section.find() which returns proper navigable CFIs
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim() || !bookRef.current) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results: SearchResult[] = [];
      const book = bookRef.current as any;
      await Promise.all(
        (book.spine.spineItems as any[]).map(async (item: any) => {
          await item.load(book.load.bind(book));
          const found: Array<{ cfi: string; excerpt: string }> = item.find(query) || [];
          results.push(...found);
          item.unload();
        })
      );
      setSearchResults(results.slice(0, 50));
    } catch (e) {
      console.error('Search failed', e);
    }
    setIsSearching(false);
  }, []);

  // Go to location by % or chapter index
  const goToLocation = () => {
    const val = goToInput.trim();
    if (!val) return;
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      // Navigate by percentage using spine
      const spine = (bookRef.current as any)?.spine?.spineItems;
      if (spine && spine.length) {
        const idx = Math.min(Math.floor((num / 100) * spine.length), spine.length - 1);
        renditionRef.current?.display(spine[idx].href);
      }
    }
    setShowGoTo(false);
    setGoToInput('');
  };

  // Time-to-finish estimate
  const wordsRemaining = wordCount > 0 ? wordCount * (1 - progressPct / 100) : 0;
  const minutesRemaining = wordsRemaining > 0 ? Math.ceil(wordsRemaining / READING_SPEED_WPM) : 0;

  const isBookmarkedHere = bookmarks.some(b => b.cfi === currentCfiRef.current);

  // On mobile the toolbar hides by default; it reveals on tap or when any panel is open.
  const isToolbarVisible = showMobileToolbar || Boolean(sidePanel) || showMenu || showSearch || showGoTo || showNarrationModal;

  return (
    <div className="reader-shell relative h-screen w-full overflow-hidden">

      {/* ── Reading area ──────────────────────────────────────────────── */}
      <div className={`absolute inset-0 flex items-stretch bg-landing-bg ${readerViewportInsetClass}`}>

        {/* Book canvas */}
        <div className="flex flex-1 min-h-0 items-stretch justify-center overflow-hidden md:p-5 md:items-stretch">
          {/* Drag wrapper — translates during swipe animation */}
          <div ref={dragWrapperRef} className="flex w-full h-full min-h-0 items-stretch justify-center md:items-stretch" style={{ willChange: 'transform' }}>
            <div
              className={`reader-viewport overflow-hidden flex flex-col w-full h-full bg-white transition-opacity duration-150 ${isFading ? 'opacity-0' : 'opacity-100'}`}
              style={flow === 'scrolled' ? {
                maxWidth: '680px',
              } : {
                maxWidth: twoPage ? '1100px' : '560px',
                height: '100%',
              }}
            >
              <div ref={viewerRef} className="h-full w-full" />

              {(!isReady || readerLoadError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/88 px-6 text-center backdrop-blur-[1px]">
                  <div className="surface-card max-w-sm px-6 py-5 sm:px-7">
                    {readerLoadError ? (
                      <>
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M5.93 19h12.14c1.54 0 2.5-1.67 1.73-3L13.73 5c-.77-1.33-2.69-1.33-3.46 0L4.2 16c-.77 1.33.19 3 1.73 3z" />
                          </svg>
                        </div>
                        <h2 className="mt-4 text-base font-semibold text-landing-text">The page needs another try</h2>
                        <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                          {readerLoadError}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-landing-border border-t-landing-accent motion-reduce:animate-none" />
                        <h2 className="mt-4 text-base font-semibold text-landing-text">Loading your book</h2>
                        <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                          We&apos;re opening {title ?? 'your book'} and restoring your place. Once it&apos;s open, it stays ready on this device for faster offline reading next time.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Desktop pagination arrows (absolutely positioned overlays) ─── */}
      {flow === 'paginated' && (
        <>
          <button
            onClick={() => renditionRef.current?.prev()}
            disabled={!isReady}
            aria-label="Previous page"
            className="absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 md:flex h-14 w-14 items-center justify-center rounded-full border border-landing-border bg-white/90 text-landing-accent shadow-lg backdrop-blur-sm transition-all hover:bg-landing-accent hover:text-white hover:border-landing-accent disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => renditionRef.current?.next()}
            disabled={!isReady}
            aria-label="Next page"
            className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 md:flex h-14 w-14 items-center justify-center rounded-full border border-landing-border bg-white/90 text-landing-accent shadow-lg backdrop-blur-sm transition-all hover:bg-landing-accent hover:text-white hover:border-landing-accent disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* ── Top toolbar ───────────────────────────────────────────────── */}
      <div className={`absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 py-3 pointer-events-none transition-[opacity,transform] duration-300 ease-out md:opacity-100 md:translate-y-0 ${isToolbarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'}`}>
        <div className="pointer-events-auto flex items-center gap-2">
          <div
            aria-live="polite"
            className="flex items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border px-3 py-1.5 text-xs font-semibold text-landing-text shadow-sm backdrop-blur-md"
          >
            {currentPage} / {totalPages || '—'}
          </div>
          {minutesRemaining > 0 && (
            <div className="flex items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border px-3 py-1.5 text-xs font-medium text-landing-text-muted shadow-sm backdrop-blur-md">
              {minutesRemaining < 60
                ? `${minutesRemaining} min left`
                : `${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m left`}
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowSearch(true)}
            aria-label="Search in book"
            title="Search in book"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>

          <button
            onClick={() => setShowGoTo(true)}
            aria-label="Go to location"
            title="Go to location"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <button
            onClick={() => setSidePanel(sidePanel === 'notes' ? null : 'notes')}
            aria-label="My notes"
            title="My notes"
            aria-pressed={sidePanel === 'notes'}
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
              sidePanel === 'notes'
                ? 'bg-landing-accent border-landing-accent text-white'
                : 'bg-landing-surface-muted/80 border-landing-border text-landing-text hover:bg-landing-border/40 hover:text-landing-accent'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button
            onClick={toggleBookmark}
            aria-label={isBookmarkedHere ? 'Remove bookmark' : 'Add bookmark'}
            title={isBookmarkedHere ? 'Remove bookmark' : 'Add bookmark'}
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
              isBookmarkedHere ? 'bg-landing-accent border-landing-accent text-white' : 'bg-landing-surface-muted/80 border-landing-border text-landing-text hover:text-landing-accent'
            }`}
          >
            <svg className="h-4 w-4" fill={isBookmarkedHere ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V5z" />
            </svg>
          </button>

          <button
            onClick={() => setSidePanel(sidePanel === 'toc' ? null : 'toc')}
            aria-label="Table of contents"
            title="Table of contents"
            aria-pressed={sidePanel === 'toc'}
            className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
              sidePanel === 'toc'
                ? 'bg-landing-accent border-landing-accent text-white'
                : 'bg-landing-surface-muted/80 border-landing-border text-landing-text hover:bg-landing-border/40 hover:text-landing-accent'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
            </svg>
          </button>

          {narrationFeatureEnabled && (
            <button
              onClick={narrationHasReadyPlayer ? () => void toggleNarrationPlayback() : openNarrationModal}
              aria-label={
                narrationHasReadyPlayer
                  ? isNarrationPlaying
                    ? 'Pause narration'
                    : 'Play narration'
                  : narrationAccess?.hasAccess
                    ? 'Open narrated mode status'
                    : 'Narrated mode reserved for donors'
              }
              title={
                narrationHasReadyPlayer
                  ? isNarrationPlaying
                    ? 'Pause narration'
                    : 'Play narration'
                  : narrationAccess?.hasAccess
                    ? 'Open narrated mode status'
                    : 'Narrated mode reserved for donors'
              }
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
                narrationHasReadyPlayer || narrationAccess?.hasAccess
                  ? 'bg-landing-accent border-landing-accent text-white hover:bg-landing-accent-secondary'
                  : 'bg-landing-surface-muted/80 border-landing-border text-landing-text hover:bg-landing-border/40 hover:text-landing-accent'
              }`}
            >
              {narrationHasReadyPlayer && isNarrationPlaying ? (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M4.5 12a7.5 7.5 0 1115 0v4.25A1.75 1.75 0 0117.75 18H16a1 1 0 01-1-1v-3.5a1 1 0 011-1h3.5m-15 0H8a1 1 0 011 1V17a1 1 0 01-1 1H6.25A1.75 1.75 0 014.5 16.25V12z"
                  />
                </svg>
              )}
              <span
                className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white text-[9px] font-bold ${
                  narrationHasReadyPlayer || narrationAccess?.hasAccess
                    ? 'bg-white text-landing-accent'
                    : 'bg-amber-400 text-amber-950 border-amber-100'
                }`}
              >
                {narrationHasReadyPlayer ? '▶' : narrationAccess?.hasAccess ? '✓' : '★'}
              </span>
            </button>
          )}

          <button
            onClick={() => setShowMenu(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
            aria-label="Open reading menu"
            title="Reader Options"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {narrationFeatureEnabled && <audio ref={audioRef} preload="metadata" data-testid="narration-audio" className="hidden" />}

      {narrationHasReadyPlayer && activeNarrationChapter && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:px-4">
          <div className={`pointer-events-auto w-full overflow-hidden rounded-2xl border border-landing-border bg-white/92 shadow-xl backdrop-blur-xl transition-all duration-200 ${
            isNarrationPlayerExpanded ? 'max-w-2xl' : 'max-w-xl'
          }`}>
            {isNarrationPlayerExpanded ? (
              <div className="px-3.5 py-3 sm:px-4">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => skipNarrationChapter(-1)}
                      disabled={narrationChapterIndex === 0}
                      aria-label="Previous narration chapter"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => void toggleNarrationPlayback()}
                      aria-label={isNarrationPlaying ? 'Pause narration' : 'Play narration'}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-accent text-white shadow-sm transition-colors hover:bg-landing-accent-secondary"
                    >
                      {isNarrationPlaying ? (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => skipNarrationChapter(1)}
                      disabled={narrationChapterIndex >= narrationChapters.length - 1}
                      aria-label="Next narration chapter"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          Donor narration
                        </span>
                        <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                          {activeNarrationVoiceName}
                        </span>
                        <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                          {narrationChapterIndex + 1}/{narrationChapters.length}
                        </span>
                        <button
                          onClick={() => setFollowNarrationText((value) => !value)}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                            followNarrationText
                              ? 'bg-landing-accent text-white'
                              : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                          }`}
                        >
                          Follow {followNarrationText ? 'on' : 'off'}
                        </button>
                      </div>

                      <button
                        onClick={() => collapseNarrationPlayer()}
                        aria-label="Collapse narration player"
                        aria-expanded={true}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-landing-text">
                        {narrationPlayerTitle}
                      </h3>
                      <button
                        onClick={openNarrationModal}
                        className="hidden rounded-full border border-landing-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent sm:inline-flex"
                      >
                        Details
                      </button>
                    </div>

                    <p className="mt-1 truncate text-[11px] leading-relaxed text-landing-text-muted">
                      {narrationPlayerMessage}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    type="range"
                    min={0}
                    max={narrationPlaybackMax}
                    step={0.1}
                    value={Math.min(narrationCurrentTime, narrationPlaybackMax)}
                    onChange={(event) => handleNarrationSeek(Number(event.target.value))}
                    aria-label="Narration playback position"
                    className="w-full accent-landing-accent"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-text-muted">
                    <span>{formatMediaTime(narrationCurrentTime)}</span>
                    <span>{activeNarrationCue ? 'Cue synced' : 'Awaiting cue'}</span>
                    <span>{formatMediaTime(narrationPlaybackMax)}</span>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {NARRATION_PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => setNarrationPlaybackRate(rate)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        narrationPlaybackRate === rate
                          ? 'bg-landing-accent text-white'
                          : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                      }`}
                    >
                      {rate}×
                    </button>
                  ))}
                  {narrationVoiceOptions.length > 1 && narrationVoiceOptions.map((voiceOption) => {
                    const isSelected = activeNarrationVoiceOption?.voice.slug === voiceOption.voice.slug;

                    return (
                      <button
                        key={voiceOption.voice.slug}
                        onClick={() => handleNarrationVoiceChange(voiceOption.voice.slug)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                        }`}
                      >
                        {formatNarrationVoiceName(voiceOption.voice.name)}
                      </button>
                    );
                  })}
                  <button
                    onClick={openNarrationModal}
                    className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-[11px] font-semibold text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent sm:hidden"
                  >
                    Details
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2.5 sm:px-3.5">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => void toggleNarrationPlayback()}
                    aria-label={isNarrationPlaying ? 'Pause narration' : 'Play narration'}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-landing-accent text-white shadow-sm transition-colors hover:bg-landing-accent-secondary"
                  >
                    {isNarrationPlaying ? (
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => expandNarrationPlayer()}
                    aria-label="Expand narration player"
                    aria-expanded={false}
                    className="min-w-0 flex-1 rounded-xl px-1 text-left transition-colors hover:bg-landing-surface-muted/80"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Donor narration
                          </span>
                          <span className="rounded-full border border-landing-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                            {activeNarrationVoiceName}
                          </span>
                          <span className="rounded-full border border-landing-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                            {narrationChapterIndex + 1}/{narrationChapters.length}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-landing-text">
                            {narrationPlayerTitle}
                          </h3>
                          <span className="shrink-0 text-[11px] font-semibold text-landing-text-muted">
                            {formatMediaTime(narrationCurrentTime)} / {formatMediaTime(narrationPlaybackMax)}
                          </span>
                        </div>
                      </div>

                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text-muted transition-colors">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </button>
                </div>

                <div className="mt-2 h-1 overflow-hidden rounded-full bg-landing-border/80">
                  <div
                    className="h-full rounded-full bg-landing-accent transition-[width] duration-200"
                    style={{ width: `${narrationPlaybackProgressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Progress strip (bottom edge) ──────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-1 bg-black/10">
        <div
          className="h-full bg-landing-accent transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── Reader Options menu (right slide-in) ──────────────────────── */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setShowMenu(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-72 transform border-l border-landing-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          showMenu ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Reading controls"
      >
        <div className="flex h-full flex-col overflow-y-auto p-5">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Reader Options</span>
            <button
              onClick={() => setShowMenu(false)}
              className="rounded-full p-2 text-landing-text-muted transition-colors hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => window.history.back()}
            className="mb-3 flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-3 text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Library
          </button>

          <div className="mb-5 flex gap-2">
            <button
              onClick={() => { setShowMenu(false); setSidePanel('toc'); }}
              className="flex flex-1 items-center gap-2 rounded-xl bg-landing-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              Contents
            </button>
            <button
              onClick={() => { setShowMenu(false); setSidePanel('notes'); }}
              className="flex flex-1 items-center gap-2 rounded-xl border border-landing-accent px-4 py-3 text-sm font-semibold text-landing-accent transition-colors hover:bg-landing-accent/10"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              My Notes
            </button>
          </div>

          {narrationFeatureEnabled && (
            <div className="mb-5 rounded-2xl border border-landing-border bg-landing-surface-muted px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Narrated mode</p>
                  <h3 className="mt-1 text-sm font-semibold text-landing-text">
                    {narrationHasReadyPlayer
                      ? 'Narrated mode is ready'
                      : narrationAccess?.hasAccess
                        ? 'Unlocked for your donor account'
                        : 'Reserved for donors'}
                  </h3>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    narrationHasReadyPlayer || narrationAccess?.hasAccess
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {narrationHasReadyPlayer
                    ? 'Ready to stream'
                    : narrationAccess?.hasAccess
                      ? 'Donor unlocked'
                      : 'Donors only'}
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-landing-text-muted">
                {narrationHasReadyPlayer
                  ? 'Signed narration audio is ready. Play it here and the reader will follow the text as each cue advances.'
                  : narrationAccess?.hasAccess
                    ? 'We will stream narrated audio securely once this book’s signed narration assets are ready.'
                    : narrationAccess?.isSignedIn
                      ? 'Due to the cost of running narration, this feature is reserved for donors only. Make one completed donation to unlock it on your account.'
                      : 'Due to the cost of running narration, this feature is reserved for donors only. Sign in to unlock it with your donation.'}
              </p>

              {narrationHasReadyPlayer && narrationVoiceOptions.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {narrationVoiceOptions.map((voiceOption) => {
                    const isSelected = activeNarrationVoiceOption?.voice.slug === voiceOption.voice.slug;

                    return (
                      <button
                        key={voiceOption.voice.slug}
                        onClick={() => handleNarrationVoiceChange(voiceOption.voice.slug)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                          isSelected
                            ? 'bg-landing-accent text-white'
                            : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                        }`}
                      >
                        {formatNarrationVoiceName(voiceOption.voice.name)}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={narrationHasReadyPlayer ? () => void toggleNarrationPlayback() : openNarrationModal}
                className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  narrationHasReadyPlayer || narrationAccess?.hasAccess
                    ? 'bg-landing-accent text-white hover:bg-landing-accent-secondary'
                    : 'border border-landing-border bg-white text-landing-text hover:border-landing-accent/40 hover:text-landing-accent'
                }`}
              >
                {narrationHasReadyPlayer
                  ? isNarrationPlaying
                    ? 'Pause narrated mode'
                    : 'Start narrated mode'
                  : narrationAccess?.hasAccess
                    ? 'Check narrated mode'
                    : narrationAccess?.isSignedIn
                      ? 'Unlock with donation'
                      : 'Sign in to unlock'}
              </button>
            </div>
          )}

          <div className="mb-4 border-t border-landing-border" />

          {/* Theme */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Theme</p>
          <div className="mb-5 flex gap-2">
            {(['light', 'dark', 'sepia'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  theme === t ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {t === 'light' ? '☀ Light' : t === 'dark' ? '🌙 Dark' : '📄 Sepia'}
              </button>
            ))}
          </div>

          {/* Flow mode */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Reading Mode</p>
          <div className="mb-5 flex gap-2">
            {(['paginated', 'scrolled'] as Flow[]).map((f) => (
              <button
                key={f}
                onClick={() => setFlow(f)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  flow === f ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {f === 'paginated' ? 'Pages' : 'Scroll'}
              </button>
            ))}
          </div>

          {/* Layout: single vs two-page (only relevant in paginated mode) */}
          {flow === 'paginated' && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Layout</p>
              <div className="mb-5 flex gap-2">
                <button
                  onClick={() => setTwoPage(false)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${!twoPage ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'}`}
                >
                  Single
                </button>
                <button
                  onClick={() => setTwoPage(true)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${twoPage ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'}`}
                >
                  Two Pages
                </button>
              </div>
            </>
          )}

          {/* Font family */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Font</p>
          <div className="mb-5 flex gap-2">
            {FONT_FAMILIES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => changeFontFamily(value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                  fontFamily === value ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Font size */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Font Size</p>
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2">
            <button onClick={() => changeFontSize(-10)} className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text" aria-label="Decrease font size">A-</button>
            <span className="flex-1 text-center text-sm font-medium text-landing-text">{fontSize}%</span>
            <button onClick={() => changeFontSize(10)} className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text" aria-label="Increase font size">A+</button>
          </div>

          {/* Line spacing */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Line Spacing</p>
          <div className="mb-5 flex gap-2">
            {LINE_SPACINGS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => changeLineSpacing(value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                  lineSpacing === value ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <button
            onClick={() => { setShowMenu(false); setTourStep(0); setShowTour(true); }}
            className="text-xs text-landing-text-muted underline-offset-2 transition hover:text-landing-accent hover:underline"
          >
            Replay reader tour
          </button>
        </div>
      </div>

      {/* ── Left side panel (TOC / Highlights / Bookmarks) ────────────── */}
      {sidePanel && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setSidePanel(null)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed left-0 top-0 z-50 h-full w-80 transform border-r border-landing-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          sidePanel ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Book navigation"
      >
        <div className="flex h-full flex-col">
          {/* Tab bar */}
          <div className="flex items-center border-b border-landing-border px-2 pt-2">
            {(['toc', 'highlights', 'notes', 'bookmarks'] as SidePanel[]).map((panel) => {
              const label = panel === 'toc' ? 'Contents' : panel === 'highlights' ? 'Highlights' : panel === 'notes' ? 'Notes' : 'Bookmarks';
              const badge = panel === 'notes'
                ? standaloneNotes.length + highlights.filter(h => h.note).length
                : panel === 'highlights' ? highlights.length
                : panel === 'bookmarks' ? bookmarks.length : 0;
                
              const getIcon = (p: SidePanel) => {
                switch(p) {
                  case 'toc': return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" /></svg>;
                  case 'highlights': return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3.535.884.884-3.535a4 4 0 01.94-1.414z" /></svg>;
                  case 'notes': return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
                  case 'bookmarks': return <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" /></svg>;
                  default: return null;
                }
              };

              return (
                <button
                  key={panel!}
                  onClick={() => setSidePanel(panel)}
                  title={label}
                  className={`relative flex flex-1 items-center justify-center rounded-t-lg py-3 transition-colors ${
                    sidePanel === panel
                      ? 'border-b-2 border-landing-accent text-landing-accent'
                      : 'text-landing-text-muted hover:text-landing-text hover:bg-landing-surface-muted/50'
                  }`}
                >
                  {getIcon(panel)}
                  {badge > 0 && (
                    <span className="absolute top-1 right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-landing-accent px-1 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setSidePanel(null)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-landing-text-muted transition hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
              aria-label="Close panel"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* TOC */}
          {sidePanel === 'toc' && (
            <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {bookRef.current?.navigation?.toc?.map((item: any, index: number) => (
                <button
                  key={index}
                  onClick={() => { renditionRef.current?.display(item.href); setSidePanel(null); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/10 hover:text-landing-accent"
                >
                  {item.label}
                </button>
              ))}
              {(!bookRef.current?.navigation?.toc || bookRef.current.navigation.toc.length === 0) && (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">No table of contents available.</p>
              )}
            </div>
          )}

          {/* Highlights */}
          {sidePanel === 'highlights' && (
            <div className="flex-1 overflow-y-auto">
              {highlights.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <svg className="mb-3 h-10 w-10 text-landing-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3.535.884.884-3.535a4 4 0 01.94-1.414z" />
                  </svg>
                  <p className="text-sm font-medium text-landing-text">No highlights yet</p>
                  <p className="mt-1 text-xs text-landing-text-muted">Select any text while reading to highlight it.</p>
                </div>
              ) : (
                <div className="divide-y divide-landing-border">
                  {highlights.map((h) => {
                    const accentColor = h.color === 'yellow' ? '#ca8a04' : h.color === 'green' ? '#16a34a' : '#2563eb';
                    const bgColor    = h.color === 'yellow' ? '#fefce8' : h.color === 'green' ? '#f0fdf4' : '#eff6ff';
                    const isEditing  = inlinePanelEditId === h.id;
                    return (
                      <div key={h.id} className="group px-4 py-4">
                        {/* Quoted text with colour bar */}
                        <div className="mb-2 flex gap-2.5">
                          <div className="mt-0.5 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
                          <p className="text-sm leading-relaxed text-landing-text">&ldquo;{h.text}&rdquo;</p>
                        </div>

                        {/* Note display / inline edit */}
                        {isEditing ? (
                          <div className="mb-2 ml-3.5">
                            <textarea
                              autoFocus
                              value={inlinePanelNote}
                              onChange={(e) => setInlinePanelNote(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  const res = await fetch(`/api/highlights/${h.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ note: inlinePanelNote.trim() || null }),
                                  });
                                  if (res.ok) setHighlights(highlights.map(x => x.id === h.id ? { ...x, note: inlinePanelNote.trim() || undefined } : x));
                                  setInlinePanelEditId(null);
                                }
                                if (e.key === 'Escape') setInlinePanelEditId(null);
                              }}
                              placeholder="Write a note…"
                              rows={3}
                              className="w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-3 py-2 text-xs text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
                            />
                            <div className="mt-1.5 flex gap-2">
                              <button
                                onClick={() => setInlinePanelEditId(null)}
                                className="rounded-lg border border-landing-border px-3 py-1 text-xs text-landing-text-muted transition hover:border-landing-accent/40"
                              >Cancel</button>
                              <button
                                onClick={async () => {
                                  const res = await fetch(`/api/highlights/${h.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ note: inlinePanelNote.trim() || null }),
                                  });
                                  if (res.ok) setHighlights(highlights.map(x => x.id === h.id ? { ...x, note: inlinePanelNote.trim() || undefined } : x));
                                  setInlinePanelEditId(null);
                                }}
                                className="rounded-lg bg-landing-accent px-3 py-1 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
                              >Save</button>
                            </div>
                          </div>
                        ) : (
                          h.note ? (
                            <div
                              className="mb-2 ml-3.5 cursor-text rounded-lg px-3 py-2 text-xs leading-relaxed text-landing-text transition-colors hover:bg-landing-surface-muted"
                              style={{ borderLeft: `2px solid ${accentColor}33`, backgroundColor: bgColor }}
                              onClick={() => { setInlinePanelEditId(h.id); setInlinePanelNote(h.note || ''); }}
                              title="Click to edit note"
                            >
                              {h.note}
                            </div>
                          ) : (
                            <button
                              onClick={() => { setInlinePanelEditId(h.id); setInlinePanelNote(''); }}
                              className="mb-2 ml-3.5 flex items-center gap-1 text-xs text-landing-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-landing-accent"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add note
                            </button>
                          )
                        )}

                        {/* Action row */}
                        <div className="ml-3.5 flex items-center gap-3">
                          <button
                            onClick={() => { renditionRef.current?.display(h.cfi); setSidePanel(null); }}
                            className="flex items-center gap-1 text-xs font-medium text-landing-accent transition hover:text-landing-accent-secondary"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            Jump to
                          </button>
                          <button
                            onClick={() => deleteHighlight(h.id, h.cfi)}
                            className="text-xs text-landing-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {sidePanel === 'notes' && (() => {
            // Merge highlight notes + standalone notes into a single sorted list
            const highlightNoteItems = highlights
              .filter(h => h.note)
              .map(h => ({ type: 'highlight' as const, id: h.id, content: h.note!, quote: h.text, color: h.color, cfi: h.cfi, createdAt: '' }));
            const standaloneItems = standaloneNotes
              .map(n => ({ type: 'note' as const, id: n.id, content: n.content, quote: '', color: '', cfi: n.cfi, createdAt: n.createdAt }));
            const all = [...highlightNoteItems, ...standaloneItems];

            return (
              <div className="flex-1 overflow-y-auto">
                {all.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <svg className="mb-3 h-10 w-10 text-landing-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <p className="text-sm font-medium text-landing-text">No notes yet</p>
                    <p className="mt-1 text-xs leading-relaxed text-landing-text-muted">
                      Use the pencil button in the toolbar to write a note at any position, or add notes to your highlights.
                    </p>
                    <button
                      onClick={() => { setShowQuickNote(true); setQuickNoteText(''); }}
                      className="mt-4 rounded-xl bg-landing-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
                    >
                      Write a note
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-landing-border">
                    {/* Quick-add note button at top */}
                    <button
                      onClick={() => { setShowQuickNote(true); setQuickNoteText(''); }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-xs font-semibold text-landing-accent transition hover:bg-landing-accent/5"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add note at current position
                    </button>

                    {all.map((item) => {
                      const accentColor = item.type === 'highlight'
                        ? (item.color === 'yellow' ? '#ca8a04' : item.color === 'green' ? '#16a34a' : '#2563eb')
                        : '#3D737A';
                      const isEditing = editingNoteId === item.id;

                      return (
                        <div key={`${item.type}-${item.id}`} className="group px-4 py-4">
                          {/* Source label */}
                          <div className="mb-2 flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: accentColor }}>
                              {item.type === 'highlight' ? 'Highlight note' : 'Note'}
                            </span>
                          </div>

                          {/* Quoted text (highlight notes only) */}
                          {item.quote && (
                            <p className="mb-2 border-l-2 pl-3 text-xs italic leading-relaxed text-landing-text-muted" style={{ borderColor: accentColor }}>
                              &ldquo;{item.quote}&rdquo;
                            </p>
                          )}

                          {/* Note content — inline editable */}
                          {isEditing ? (
                            <div className="mb-2">
                              <textarea
                                autoFocus
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    if (item.type === 'note') updateStandaloneNote(item.id, editingNoteText.trim());
                                    else {
                                      fetch(`/api/highlights/${item.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ note: editingNoteText.trim() || null }),
                                      }).then(r => { if (r.ok) setHighlights(prev => prev.map(h => h.id === item.id ? { ...h, note: editingNoteText.trim() || undefined } : h)); });
                                      setEditingNoteId(null);
                                    }
                                  }
                                  if (e.key === 'Escape') setEditingNoteId(null);
                                }}
                                rows={4}
                                className="w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-3 py-2.5 text-sm text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
                              />
                              <div className="mt-2 flex gap-2">
                                <button onClick={() => setEditingNoteId(null)} className="rounded-lg border border-landing-border px-3 py-1.5 text-xs text-landing-text-muted transition hover:border-landing-accent/40">Cancel</button>
                                <button
                                  onClick={() => {
                                    if (item.type === 'note') updateStandaloneNote(item.id, editingNoteText.trim());
                                    else {
                                      fetch(`/api/highlights/${item.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ note: editingNoteText.trim() || null }),
                                      }).then(r => { if (r.ok) setHighlights(prev => prev.map(h => h.id === item.id ? { ...h, note: editingNoteText.trim() || undefined } : h)); });
                                      setEditingNoteId(null);
                                    }
                                  }}
                                  className="rounded-lg bg-landing-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
                                >Save</button>
                              </div>
                            </div>
                          ) : (
                            <p
                              className="mb-3 cursor-text rounded-xl bg-landing-surface-muted px-3 py-2.5 text-sm leading-relaxed text-landing-text transition hover:bg-landing-border/40"
                              onClick={() => { setEditingNoteId(item.id); setEditingNoteText(item.content); }}
                              title="Click to edit"
                            >
                              {item.content}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { renditionRef.current?.display(item.cfi); setSidePanel(null); }}
                              className="flex items-center gap-1 text-xs font-medium text-landing-accent transition hover:text-landing-accent-secondary"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              Jump to
                            </button>
                            <button
                              onClick={() => {
                                if (item.type === 'note') deleteStandaloneNote(item.id);
                                else deleteHighlight(item.id, item.cfi);
                              }}
                              className="text-xs text-landing-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Bookmarks */}
          {sidePanel === 'bookmarks' && (
            <div className="flex-1 overflow-y-auto p-3">
              {bookmarks.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">No bookmarks yet. Use the bookmark icon to save your place.</p>
              ) : (
                <div className="space-y-1">
                  {bookmarks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { renditionRef.current?.display(b.cfi); setSidePanel(null); }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-landing-accent/10"
                    >
                      <svg className="h-4 w-4 shrink-0 text-landing-accent" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V5z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-landing-text">{b.label}</p>
                        {b.chapter && <p className="truncate text-xs text-landing-text-muted">{b.chapter}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── In-book search overlay ─────────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowSearch(false); }}>
          <div className="mx-auto mt-16 w-full max-w-lg rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 border-b border-landing-border px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-landing-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(searchQuery); if (e.key === 'Escape') setShowSearch(false); }}
                placeholder="Search in book…"
                className="flex-1 bg-transparent text-sm text-landing-text outline-none placeholder:text-landing-text-muted"
              />
              <button
                onClick={() => runSearch(searchQuery)}
                className="rounded-lg bg-landing-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
              >
                {isSearching ? 'Searching…' : 'Search'}
              </button>
              <button onClick={() => setShowSearch(false)} className="text-landing-text-muted hover:text-landing-text" aria-label="Close search">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {searchResults.length === 0 && !isSearching && searchQuery && (
                <p className="py-8 text-center text-sm text-landing-text-muted">No results found.</p>
              )}
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => { renditionRef.current?.display(r.cfi); setShowSearch(false); }}
                  className="block w-full border-b border-landing-border px-4 py-3 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/5 hover:text-landing-text last:border-0"
                >
                  {r.excerpt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick note modal ─────────────────────────────────────────── */}
      {showQuickNote && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowQuickNote(false); setQuickNoteText(''); } }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-landing-border bg-white shadow-2xl">
            {/* Header */}
            <div className="bg-[#f0f9fa] px-5 pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <svg className="h-4 w-4 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-accent">Note at this position</p>
              </div>
              <p className="text-xs text-landing-text-muted">This note will be pinned to your current reading location.</p>
            </div>

            <div className="px-5 py-4">
              <textarea
                autoFocus
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveQuickNote();
                  if (e.key === 'Escape') { setShowQuickNote(false); setQuickNoteText(''); }
                }}
                placeholder="Write your note… (⌘↵ to save)"
                rows={5}
                className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none placeholder:text-landing-text-muted/60 focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowQuickNote(false); setQuickNoteText(''); }}
                  className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
                >
                  Cancel
                </button>
                <button
                  onClick={saveQuickNote}
                  disabled={!quickNoteText.trim()}
                  className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary disabled:opacity-40"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Go to location dialog ─────────────────────────────────────── */}
      {showGoTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowGoTo(false); }}>
          <div className="w-72 rounded-2xl border border-landing-border bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-base font-semibold text-landing-text">Go to Location</h3>
            <p className="mb-4 text-xs text-landing-text-muted">Enter a percentage (0–100) to jump to that position in the book.</p>
            <input
              autoFocus
              type="number"
              min={0}
              max={100}
              value={goToInput}
              onChange={(e) => setGoToInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goToLocation(); if (e.key === 'Escape') setShowGoTo(false); }}
              placeholder="e.g. 50"
              className="mb-4 w-full rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowGoTo(false)} className="flex-1 rounded-xl border border-landing-border py-2 text-sm text-landing-text-muted transition hover:border-landing-accent/40">Cancel</button>
              <button onClick={goToLocation} className="flex-1 rounded-xl bg-landing-accent py-2 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary">Go</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Narration access modal ─────────────────────────────────── */}
      {showNarrationModal && narrationAccess && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNarrationModal(false);
            }
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-landing-border bg-white shadow-2xl">
            <div className="bg-landing-surface-muted px-5 pb-4 pt-5">
              <div className="mb-1 flex items-center gap-2">
                <svg className="h-4 w-4 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M4.5 12a7.5 7.5 0 1115 0v4.25A1.75 1.75 0 0117.75 18H16a1 1 0 01-1-1v-3.5a1 1 0 011-1h3.5m-15 0H8a1 1 0 011 1V17a1 1 0 01-1 1H6.25A1.75 1.75 0 014.5 16.25V12z"
                  />
                </svg>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-accent">Narrated mode</p>
              </div>
              <h3 className="text-base font-semibold text-landing-text">
                {narrationAccess.hasAccess ? 'Donor narration status' : 'Narrated mode is reserved for donors'}
              </h3>
            </div>

            <div className="px-5 py-4">
              {!narrationAccess.hasAccess ? (
                <>
                  <p className="text-sm leading-relaxed text-landing-text-muted">
                    {narrationAccess.isSignedIn
                      ? 'Due to the cost of running narration, this feature is reserved for donors only. Make one completed donation to unlock it on your account.'
                      : 'Due to the cost of running narration, this feature is reserved for donors only. Sign in to unlock it with your donation.'}
                  </p>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setShowNarrationModal(false)}
                      className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
                    >
                      Keep reading
                    </button>
                    <a
                      href={narrationAccess.manageHref}
                      className="brand-button flex-1 px-4 py-2.5 text-center text-sm"
                    >
                      {narrationAccess.isSignedIn ? 'Donate to unlock' : 'Sign in to unlock'}
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-landing-border bg-landing-surface-muted px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                        {narrationHasReadyPlayer ? 'Ready to stream' : 'Donor unlocked'}
                      </span>
                      <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                        {(narrationStatus?.storageProvider || 'signed').toUpperCase()} delivery
                      </span>
                      {narrationHasReadyPlayer && (
                        <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                          {activeNarrationVoiceName}
                        </span>
                      )}
                      {narrationHasReadyPlayer && narrationManifest && (
                        <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                          {narrationManifest.chapterCount} chapter{narrationManifest.chapterCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {narrationVoiceOptions.length > 1 && (
                        <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                          {narrationVoiceOptions.length} voices available
                        </span>
                      )}
                      {narrationStatus?.bookHasLegacyAudiobook && (
                        <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                          Legacy audiobook on file
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-landing-text-muted">
                      {isCheckingNarration
                        ? 'Checking whether this book’s narrated assets are ready…'
                        : narrationStatus?.message || narrationError || 'Donor narration is unlocked on your account. Check back soon for the first narrated release.'}
                    </p>

                    {narrationHasReadyPlayer && narrationManifest && (
                      <p className="mt-2 text-xs leading-relaxed text-landing-text-muted">
                        {narrationManifest.totalDurationMs
                          ? `${formatMediaTime(narrationManifest.totalDurationMs / 1000)} total runtime across ${narrationManifest.chapterCount} chapter${narrationManifest.chapterCount === 1 ? '' : 's'}.`
                          : `Signed narration assets are ready across ${narrationManifest.chapterCount} chapter${narrationManifest.chapterCount === 1 ? '' : 's'}.`}
                      </p>
                    )}

                    {narrationVoiceOptions.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                            Available voices
                          </p>
                          {narrationVoiceOptions.length > 1 && (
                            <span className="text-[11px] text-landing-text-muted">
                              Tap a voice to switch instantly
                            </span>
                          )}
                        </div>

                        <div className="grid gap-2">
                          {narrationVoiceOptions.map((voiceOption) => {
                            const isSelected = activeNarrationVoiceOption?.voice.slug === voiceOption.voice.slug;
                            const runtimeLabel = voiceOption.totalDurationMs
                              ? formatMediaTime(voiceOption.totalDurationMs / 1000)
                              : `${voiceOption.chapterCount} chapter${voiceOption.chapterCount === 1 ? '' : 's'}`;

                            return (
                              <button
                                key={voiceOption.voice.slug}
                                onClick={() => handleNarrationVoiceChange(voiceOption.voice.slug)}
                                className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                                  isSelected
                                    ? 'border-landing-accent bg-white shadow-sm'
                                    : 'border-landing-border bg-white/80 hover:border-landing-accent/40 hover:bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-landing-text">
                                      {formatNarrationVoiceName(voiceOption.voice.name)}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-landing-text-muted">
                                      {runtimeLabel}
                                      {voiceOption.active ? ' • Default voice' : ''}
                                    </p>
                                  </div>

                                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                    isSelected
                                      ? 'bg-landing-accent text-white'
                                      : 'border border-landing-border bg-white text-landing-text-muted'
                                  }`}>
                                    {isSelected ? 'Selected' : 'Choose'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setShowNarrationModal(false)}
                      className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
                    >
                      Close
                    </button>
                    {narrationHasReadyPlayer ? (
                      <button
                        onClick={() => {
                          setShowNarrationModal(false);
                          void toggleNarrationPlayback();
                        }}
                        className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
                      >
                        {isNarrationPlaying ? 'Pause narration' : 'Start narration'}
                      </button>
                    ) : (
                      <button
                        onClick={() => void loadNarrationStatus(true)}
                        disabled={isCheckingNarration}
                        className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary disabled:opacity-50"
                      >
                        {isCheckingNarration ? 'Checking…' : 'Refresh status'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Highlight picker — colour + note in one step ─────────────── */}
      {selectedText && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedText(null); setPendingNote(''); setPendingColor('yellow'); } }}>
          <div className="w-full max-w-sm rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
            {/* Colour strip header */}
            <div
              className="px-5 pt-5 pb-4 transition-colors duration-200"
              style={{ backgroundColor: pendingColor === 'yellow' ? '#fefce8' : pendingColor === 'green' ? '#f0fdf4' : '#eff6ff' }}
            >
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">Highlight</p>
              <p className="line-clamp-2 text-sm font-medium text-landing-text leading-snug">&ldquo;{selectedText.text}&rdquo;</p>
            </div>

            <div className="px-5 py-4">
              {/* Colour swatches */}
              <div className="mb-4 flex items-center gap-2">
                {[
                  { color: 'yellow', bg: '#f8e16f', ring: '#ca8a04' },
                  { color: 'green',  bg: '#99d98c', ring: '#16a34a' },
                  { color: 'blue',   bg: '#90caf9', ring: '#2563eb' },
                ].map(({ color, bg, ring }) => (
                  <button
                    key={color}
                    onClick={() => setPendingColor(color)}
                    aria-label={`${color} highlight`}
                    aria-pressed={pendingColor === color}
                    className="relative h-9 w-9 rounded-full border-2 transition-transform duration-150 hover:scale-110 focus-visible:outline-none"
                    style={{
                      backgroundColor: bg,
                      borderColor: pendingColor === color ? ring : 'transparent',
                      boxShadow: pendingColor === color ? `0 0 0 3px ${ring}33` : undefined,
                    }}
                  >
                    {pendingColor === color && (
                      <svg className="absolute inset-0 m-auto h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
                <span className="ml-auto text-xs capitalize text-landing-text-muted">{pendingColor}</span>
              </div>

              {/* Note textarea */}
              <textarea
                value={pendingNote}
                onChange={(e) => setPendingNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addHighlight(); }}
                placeholder="Add a note… (optional)"
                rows={3}
                className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none placeholder:text-landing-text-muted/60 focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedText(null); setPendingNote(''); setPendingColor('yellow'); }}
                  className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40 hover:text-landing-text"
                >
                  Cancel
                </button>
                <button
                  onClick={addHighlight}
                  className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
                >
                  Save Highlight
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Highlight note editor (opened by tapping a highlight in the book) ── */}
      {editingHighlight && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingHighlight(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
            {/* Colour header */}
            <div
              className="px-5 pt-5 pb-4"
              style={{ backgroundColor: editingHighlight.color === 'yellow' ? '#fefce8' : editingHighlight.color === 'green' ? '#f0fdf4' : '#eff6ff' }}
            >
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">Highlight</p>
              <p className="line-clamp-2 text-sm font-medium text-landing-text leading-snug">&ldquo;{editingHighlight.text}&rdquo;</p>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-xs font-semibold text-landing-text-muted">Your note</label>
              <textarea
                autoFocus
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveHighlightNote(); if (e.key === 'Escape') setEditingHighlight(null); }}
                placeholder="Write a note…"
                rows={4}
                className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none placeholder:text-landing-text-muted/60 focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => deleteHighlight(editingHighlight.id, editingHighlight.cfi)}
                  className="rounded-xl border border-red-200 px-3 py-2.5 text-sm text-red-500 transition hover:bg-red-50"
                >
                  Delete
                </button>
                <button onClick={() => setEditingHighlight(null)} className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40">Cancel</button>
                <button onClick={saveHighlightNote} className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── First-time reader tour ────────────────────────────────────── */}
      {showTour && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-landing-border bg-white p-8 shadow-2xl">
            <div className="mb-6 flex justify-center gap-2">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${i === tourStep ? 'w-6 bg-landing-accent' : 'w-2 bg-landing-border'}`}
                />
              ))}
            </div>
            <div className="mb-4">{TOUR_STEPS[tourStep].icon}</div>
            <h3 className="mb-2 text-center text-lg font-semibold text-landing-text">{TOUR_STEPS[tourStep].title}</h3>
            <p className="mb-8 text-center text-sm leading-relaxed text-landing-text-muted">{TOUR_STEPS[tourStep].body}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={dismissTour}
                className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40 hover:text-landing-text"
              >
                Skip
              </button>
              <button
                onClick={() => { if (tourStep < TOUR_STEPS.length - 1) setTourStep(tourStep + 1); else dismissTour(); }}
                className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
              >
                {tourStep < TOUR_STEPS.length - 1 ? 'Next' : 'Start Reading'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
