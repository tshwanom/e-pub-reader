import type { NarrationManifestChapter } from '@/lib/narration';
import {
  NARRATION_ACTIVE_ANNOTATION_STYLE,
  NARRATION_ACTIVE_ELEMENT_CLASS,
  NARRATION_EXCERPT_MATCH_SELECTOR,
  NARRATION_PLAYER_PREFERENCE_KEY,
  NARRATION_PLAYBACK_RATES,
  NARRATION_VOICE_PREFERENCE_KEY_PREFIX,
  NARRATION_WRAPPER_ATTRIBUTE,
  FontFamily,
  LineSpacing,
} from './types';

export {
  NARRATION_ACTIVE_ANNOTATION_STYLE,
  NARRATION_ACTIVE_ELEMENT_CLASS,
  NARRATION_EXCERPT_MATCH_SELECTOR,
  NARRATION_PLAYER_PREFERENCE_KEY,
  NARRATION_PLAYBACK_RATES,
  NARRATION_VOICE_PREFERENCE_KEY_PREFIX,
  NARRATION_WRAPPER_ATTRIBUTE,
};

export const FONT_FAMILIES: { label: string; value: FontFamily }[] = [
  { label: 'Serif', value: 'Crimson Pro' },
  { label: 'Sans', value: 'Inter' },
  { label: 'Classic', value: 'Georgia' },
];

export const LINE_SPACINGS: { label: string; value: LineSpacing }[] = [
  { label: 'Compact', value: 1.4 },
  { label: 'Normal', value: 1.6 },
  { label: 'Relaxed', value: 1.9 },
];

export const READING_SPEED_WPM = 250; // avg adult reading speed

export function normalizeNarrationHref(value?: string | null) {
  return value ? value.split('#')[0] : null;
}

export function normalizeNarrationSearchText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildNarrationExcerptProbes(excerpt?: string | null) {
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

export function getNarrationExcerptElementScore(element: HTMLElement, probes: string[]) {
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

export function findNarrationCueElementByExcerpt(doc: Document | undefined, excerpt?: string | null) {
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

export function escapeNarrationExcerptForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findNarrationCueRangeInElement(element: HTMLElement, excerpt?: string | null) {
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

export function wrapNarrationCueExcerpt(element: HTMLElement, excerpt?: string | null) {
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

export function formatMediaTime(seconds: number) {
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

export function formatNarrationVoiceName(voiceName?: string | null) {
  const normalizedVoiceName = String(voiceName || '').replace(/^Gemini\s+/i, '').trim();
  return normalizedVoiceName || 'Voice';
}

export function getNarrationVoicePreferenceStorageKey(bookId: string) {
  return `${NARRATION_VOICE_PREFERENCE_KEY_PREFIX}-${bookId}`;
}

export function isNarrationPlayerPreferenceSyncSkippableStatus(status: number) {
  return status === 401 || status === 403 || status === 404;
}

export function resolveNarrationChapterIndexFromChapters(
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
