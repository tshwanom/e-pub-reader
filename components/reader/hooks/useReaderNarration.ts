'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  NarrationFeatureVoiceOption,
  NarrationManifestCue,
} from '@/lib/narration';
import type {
  NarrationPlaybackRate,
  NarrationStatusPayload,
  ReaderNarrationAccess,
} from '../types';
import {
  NARRATION_ACTIVE_ANNOTATION_STYLE,
  NARRATION_ACTIVE_ELEMENT_CLASS,
  NARRATION_PLAYER_PREFERENCE_KEY,
  NARRATION_WRAPPER_ATTRIBUTE,
  findNarrationCueElementByExcerpt,
  formatNarrationVoiceName,
  getNarrationVoicePreferenceStorageKey,
  isNarrationPlayerPreferenceSyncSkippableStatus,
  resolveNarrationChapterIndexFromChapters,
  wrapNarrationCueExcerpt,
} from '../utils';

interface UseReaderNarrationOptions {
  bookId: string;
  narrationAccess?: ReaderNarrationAccess;
  initialNarrationPlayerExpanded?: boolean | null;
  narrationPlayerPreferenceEndpoint?: string | null;
  renditionRef: React.MutableRefObject<any>;
  currentHref: string | null;
  currentCfiRef: React.MutableRefObject<string | null>;
  currentHrefRef: React.MutableRefObject<string | null>;
}

export function useReaderNarration({
  bookId,
  narrationAccess,
  initialNarrationPlayerExpanded,
  narrationPlayerPreferenceEndpoint,
  renditionRef,
  currentHref,
  currentCfiRef,
  currentHrefRef,
}: UseReaderNarrationOptions) {
  const [showNarrationModal, setShowNarrationModal] = useState(false);
  const [isCheckingNarration, setIsCheckingNarration] = useState(false);
  const [narrationStatus, setNarrationStatus] = useState<NarrationStatusPayload | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [narrationChapterIndex, setNarrationChapterIndex] = useState(0);
  const [narrationCurrentTime, setNarrationCurrentTime] = useState(0);
  const [narrationDuration, setNarrationDuration] = useState(0);
  const [narrationPlaybackRate, setNarrationPlaybackRate] = useState<NarrationPlaybackRate>(1);
  const [isNarrationPlaying, setIsNarrationPlaying] = useState(false);
  const [isNarrationPlayerExpanded, setIsNarrationPlayerExpanded] = useState(
    Boolean(initialNarrationPlayerExpanded)
  );
  const [selectedNarrationVoiceSlug, setSelectedNarrationVoiceSlug] = useState<string | null>(null);
  const [followNarrationText, setFollowNarrationText] = useState(true);
  const [activeNarrationCue, setActiveNarrationCue] = useState<NarrationManifestCue | null>(null);
  const [narrationPlaybackError, setNarrationPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const activeNarrationCueRef = useRef<NarrationManifestCue | null>(null);
  const activeNarrationCueCfiRef = useRef<string | null>(null);
  const narrationHighlightedElementsRef = useRef<HTMLElement[]>([]);
  const pendingNarrationAutoplayRef = useRef(false);
  const lastNarrationDisplayTargetRef = useRef<string | null>(null);

  const narrationFeatureEnabled = Boolean(narrationAccess && narrationAccess.isEnabled !== false);

  const narrationVoiceOptions = useMemo<NarrationFeatureVoiceOption[]>(() => {
    if (narrationStatus?.voices?.length) {
      return narrationStatus.voices;
    }

    if (narrationStatus?.manifest) {
      return [
        {
          narrationId: narrationStatus.manifest.narrationId,
          active: true,
          totalDurationMs: narrationStatus.manifest.totalDurationMs,
          chapterCount: narrationStatus.manifest.chapterCount,
          manifest: narrationStatus.manifest,
          manifestUrl: narrationStatus.manifestUrl,
          voice: narrationStatus.manifest.voice,
        },
      ];
    }

    return [];
  }, [narrationStatus]);

  const activeNarrationVoiceOption = useMemo(() => {
    return (
      narrationVoiceOptions.find(
        (voiceOption) => voiceOption.voice.slug === selectedNarrationVoiceSlug
      ) ??
      narrationVoiceOptions.find(
        (voiceOption) => voiceOption.voice.slug === narrationStatus?.defaultVoiceSlug
      ) ??
      narrationVoiceOptions.find((voiceOption) => voiceOption.active) ??
      narrationVoiceOptions[0] ??
      null
    );
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
  const narrationHasReadyPlayer = Boolean(
    narrationStatus?.available && narrationManifest && narrationChapters.length > 0
  );

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

  const narrationPlayerMessage =
    narrationPlaybackError ||
    activeNarrationCue?.excerpt ||
    narrationStatus?.message ||
    'Narrated mode is ready to stream.';

  const narrationPlayerTitle =
    activeNarrationChapter?.title || `Chapter ${narrationChapterIndex + 1}`;

  const narrationPlaybackProgressPct =
    narrationPlaybackMax > 0
      ? Math.min(Math.max((narrationCurrentTime / narrationPlaybackMax) * 100, 0), 100)
      : 0;

  const readerViewportInsetClass = narrationHasReadyPlayer
    ? isNarrationPlayerExpanded
      ? 'pb-32 sm:pb-28 lg:pb-24'
      : 'pb-20 sm:pb-16'
    : '';

  const persistNarrationPlayerPreference = useCallback(
    async (expanded: boolean) => {
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
    },
    [narrationPlayerPreferenceEndpoint]
  );

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

  const expandNarrationPlayer = useCallback(
    (persistPreference = true) => {
      setIsNarrationPlayerExpanded(true);

      if (!persistPreference) {
        return;
      }

      void persistNarrationPlayerPreference(true);
    },
    [persistNarrationPlayerPreference]
  );

  const collapseNarrationPlayer = useCallback(
    (persistPreference = true) => {
      setIsNarrationPlayerExpanded(false);

      if (!persistPreference) {
        return;
      }

      void persistNarrationPlayerPreference(false);
    },
    [persistNarrationPlayerPreference]
  );

  const loadNarrationStatus = useCallback(
    async (force = false) => {
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
    },
    [isCheckingNarration, narrationAccess, narrationFeatureEnabled, narrationStatus]
  );

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
  }, [renditionRef]);

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
  }, [renditionRef]);

  const applyNarrationCueHighlight = useCallback(
    (cue: NarrationManifestCue | null) => {
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
    },
    [clearNarrationCueHighlight, ensureNarrationCueStyles, renditionRef]
  );

  const resolveNarrationChapterIndex = useCallback(
    (preferredHref?: string | null) => {
      return resolveNarrationChapterIndexFromChapters(
        narrationChapters,
        preferredHref ?? currentHrefRef.current,
        currentCfiRef.current
      );
    },
    [currentCfiRef, currentHrefRef, narrationChapters]
  );

  const handleNarrationVoiceChange = useCallback(
    (voiceSlug: string) => {
      const nextVoiceOption = narrationVoiceOptions.find(
        (voiceOption) => voiceOption.voice.slug === voiceSlug
      );

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
        currentCfiRef.current
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
    },
    [
      bookId,
      currentCfiRef,
      currentHrefRef,
      expandNarrationPlayer,
      isNarrationPlaying,
      narrationVoiceOptions,
      selectedNarrationVoiceSlug,
    ]
  );

  const skipNarrationChapter = useCallback(
    (direction: -1 | 1) => {
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
      setNarrationDuration(
        narrationChapters[nextIndex].durationMs
          ? narrationChapters[nextIndex].durationMs / 1000
          : 0
      );
      lastNarrationDisplayTargetRef.current = null;
    },
    [isNarrationPlaying, narrationChapterIndex, narrationChapters]
  );

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

    const nextVoiceSlug =
      [
        selectedNarrationVoiceSlug,
        savedVoiceSlug,
        narrationStatus?.defaultVoiceSlug ?? null,
        narrationVoiceOptions.find((voiceOption) => voiceOption.active)?.voice.slug ?? null,
        narrationVoiceOptions[0]?.voice.slug ?? null,
      ].find((voiceSlug): voiceSlug is string =>
        Boolean(
          voiceSlug &&
            narrationVoiceOptions.some((voiceOption) => voiceOption.voice.slug === voiceSlug)
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
    setNarrationDuration(
      activeNarrationChapter.durationMs ? activeNarrationChapter.durationMs / 1000 : 0
    );
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
      const resolvedDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
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
    const matchingCue =
      activeNarrationChapter.cues.find((cue, index) => {
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
        if (
          followNarrationText &&
          targetLocation &&
          lastNarrationDisplayTargetRef.current !== targetLocation
        ) {
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
  }, [activeNarrationCue, applyNarrationCueHighlight, clearNarrationCueHighlight, followNarrationText, renditionRef]);

  useEffect(
    () => () => {
      clearNarrationCueHighlight();
    },
    [clearNarrationCueHighlight]
  );

  return {
    audioRef,
    showNarrationModal,
    setShowNarrationModal,
    isCheckingNarration,
    narrationStatus,
    narrationError,
    narrationChapterIndex,
    setNarrationChapterIndex,
    narrationCurrentTime,
    narrationDuration,
    narrationPlaybackRate,
    setNarrationPlaybackRate,
    isNarrationPlaying,
    isNarrationPlayerExpanded,
    selectedNarrationVoiceSlug,
    followNarrationText,
    setFollowNarrationText,
    activeNarrationCue,
    narrationPlaybackError,
    narrationFeatureEnabled,
    narrationVoiceOptions,
    activeNarrationVoiceOption,
    narrationManifest,
    narrationChapters,
    activeNarrationChapter,
    narrationHasReadyPlayer,
    activeNarrationVoiceName,
    narrationPlaybackMax,
    narrationPlayerMessage,
    narrationPlayerTitle,
    narrationPlaybackProgressPct,
    readerViewportInsetClass,
    openNarrationModal,
    expandNarrationPlayer,
    collapseNarrationPlayer,
    loadNarrationStatus,
    handleNarrationVoiceChange,
    skipNarrationChapter,
    toggleNarrationPlayback,
    handleNarrationSeek,
    ensureNarrationCueStyles,
  };
}
