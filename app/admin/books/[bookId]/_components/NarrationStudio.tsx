"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  CheckCircle2,
  Cloud,
  HardDrive,
  Headphones,
  Loader2,
  Mic2,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
  WandSparkles,
  XCircle,
} from "lucide-react";

type NarrationStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";

type Notice = {
  type: "success" | "error";
  message: string;
};

interface NarrationSummaryResponse {
  book: {
    id: string;
    title: string;
    slug: string;
    donorOnly: boolean;
    status: string;
    coverUrl: string;
    hasEpubFile: boolean;
    epubFileUploadedAt: string | null;
  };
  gemini: {
    configured: boolean;
    defaultModel: string;
    defaultVoiceName: string;
    models: Array<{
      id: string;
      label: string;
      description: string;
    }>;
    voices: Array<{
      name: string;
      description: string;
    }>;
  };
  storage: {
    provider: string;
    providerLabel: string;
    configured: boolean;
  };
  generation: {
    canGenerate: boolean;
    missingRequirements: string[];
  };
  narrations: Array<{
    id: string;
    status: NarrationStatus;
    active: boolean;
    storageProvider: string;
    totalDurationMs: number | null;
    totalChapters: number;
    readyAt: string | null;
    errorMessage: string | null;
    manifestObjectKey: string | null;
    createdAt: string;
    updatedAt: string;
    voice: {
      id: string;
      name: string;
      slug: string;
      provider: string;
      language: string;
      optionName?: string;
      model?: string | null;
    };
    chapters: Array<{
      id: string;
      chapterIndex: number;
      title: string | null;
      spineHref: string;
      status: string;
      durationMs: number | null;
    }>;
  }>;
}

interface NarrationStudioProps {
  bookId: string;
}

type NarrationSummaryItem = NarrationSummaryResponse["narrations"][number];

const DEFAULT_STYLE_PROMPT =
  "Warm, immersive single-speaker audiobook narration with clear diction, subtle emotional shading, and natural pauses between paragraphs.";
const DEFAULT_SAMPLE_TEXT =
  "The room fell quiet as the story opened. Each line should feel intimate, expressive, and easy to follow, with a confident pace that stays clear for long-form listening.";

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "—";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function getStatusClasses(status: NarrationStatus, active: boolean) {
  if (active && status === "READY") {
    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  }

  switch (status) {
    case "READY":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    case "PROCESSING":
    case "PENDING":
      return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
    case "FAILED":
      return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  }
}

function formatVoiceLabel(name: string, optionName?: string) {
  return optionName || name;
}

function getNarrationChapterCounts(narration: NarrationSummaryItem) {
  const ready = narration.chapters.filter((chapter) => chapter.status === "READY").length;
  const processing = narration.chapters.filter((chapter) => chapter.status === "PROCESSING").length;
  const pending = narration.chapters.filter((chapter) => chapter.status === "PENDING").length;
  const failed = narration.chapters.filter((chapter) => chapter.status === "FAILED").length;
  const total = narration.chapters.length || narration.totalChapters || 0;

  return {
    ready,
    processing,
    pending,
    failed,
    total,
  };
}

export default function NarrationStudio({ bookId }: NarrationStudioProps) {
  const [summary, setSummary] = useState<NarrationSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [samplingVoiceName, setSamplingVoiceName] = useState<string | null>(null);
  const [settingDefaultNarrationId, setSettingDefaultNarrationId] = useState<string | null>(null);
  const [retryingNarrationId, setRetryingNarrationId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    voiceName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedVoiceNames, setSelectedVoiceNames] = useState<string[]>([]);
  const [preferredDefaultVoiceName, setPreferredDefaultVoiceName] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [languageCode, setLanguageCode] = useState("en");
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE_PROMPT);
  const [chaptersToGenerate, setChaptersToGenerate] = useState("");
  const [sampleText, setSampleText] = useState(DEFAULT_SAMPLE_TEXT);
  const [samplePreview, setSamplePreview] = useState<{
    voiceName: string;
    model: string;
    durationMs: number;
    audioDataUrl: string;
  } | null>(null);

  const loadSummary = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (options.quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch(`/api/admin/books/${bookId}/narration`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || payload.details || "Failed to load narration studio.");
      }

      setSummary(payload);
      setSelectedModel((current) => {
        if (current && payload.gemini.models.some((model: { id: string }) => model.id === current)) {
          return current;
        }

        return payload.gemini.defaultModel;
      });
      setSelectedVoiceNames((current) => {
        const availableVoiceNames = payload.gemini.voices.map((voice: { name: string }) => voice.name);
        const filtered = current.filter((voiceName) => availableVoiceNames.includes(voiceName));

        return filtered.length > 0 ? filtered : [payload.gemini.defaultVoiceName];
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load narration studio.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setPreferredDefaultVoiceName((current) => (
      selectedVoiceNames.includes(current) ? current : selectedVoiceNames[0] || ""
    ));
  }, [selectedVoiceNames]);

  const narrationByVoiceName = useMemo(() => {
    const map = new Map<string, NarrationSummaryResponse["narrations"][number]>();

    (summary?.narrations || []).forEach((narration) => {
      if (!map.has(narration.voice.name)) {
        map.set(narration.voice.name, narration);
      }
    });

    return map;
  }, [summary]);

  const readyNarrations = useMemo(
    () => (summary?.narrations || []).filter((narration) => narration.status === "READY"),
    [summary]
  );

  const activeNarration = useMemo(
    () => readyNarrations.find((narration) => narration.active) || readyNarrations[0] || null,
    [readyNarrations]
  );

  const selectedVoiceSummaries = useMemo(
    () => (summary?.gemini.voices || []).filter((voice) => selectedVoiceNames.includes(voice.name)),
    [selectedVoiceNames, summary]
  );

  const generatedVoiceCount = readyNarrations.length;
  const processingVoiceCount = (summary?.narrations || []).filter(
    (narration) => narration.status === "PROCESSING" || narration.status === "PENDING"
  ).length;
  const chapterQueueSummary = useMemo(() => {
    return (summary?.narrations || []).reduce(
      (totals, narration) => {
        const chapterCounts = getNarrationChapterCounts(narration);

        totals.ready += chapterCounts.ready;
        totals.processing += chapterCounts.processing;
        totals.pending += chapterCounts.pending;
        totals.failed += chapterCounts.failed;
        totals.total += chapterCounts.total;
        return totals;
      },
      { ready: 0, processing: 0, pending: 0, failed: 0, total: 0 }
    );
  }, [summary]);
  const hasActiveQueue = processingVoiceCount > 0;

  useEffect(() => {
    if (!hasActiveQueue) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSummary({ quiet: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveQueue, loadSummary]);

  const toggleVoiceSelection = (voiceName: string) => {
    setSelectedVoiceNames((current) => (
      current.includes(voiceName)
        ? current.filter((entry) => entry !== voiceName)
        : [...current, voiceName]
    ));
  };

  const handleSampleVoice = async (voiceName: string) => {
    if (!sampleText.trim()) {
      setNotice({
        type: "error",
        message: "Add sample text before requesting a preview.",
      });
      return;
    }

    setSamplingVoiceName(voiceName);
    setNotice(null);
    setError(null);
    setSamplePreview(null);

    try {
      const response = await fetch(`/api/admin/books/${bookId}/narration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "sample",
          voiceName,
          model: selectedModel,
          languageCode: languageCode.trim() || null,
          stylePrompt: stylePrompt.trim() || null,
          sampleText: sampleText.trim(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to sample this voice.");
      }

      setSamplePreview({
        voiceName,
        model: payload.model || selectedModel,
        durationMs: payload.durationMs || 0,
        audioDataUrl: payload.audioDataUrl,
      });
      setNotice({
        type: "success",
        message: payload.message || `${voiceName} is ready to preview.`,
      });
    } catch (sampleError) {
      setNotice({
        type: "error",
        message: sampleError instanceof Error ? sampleError.message : "Failed to sample this voice.",
      });
    } finally {
      setSamplingVoiceName(null);
    }
  };

  const handleGenerateSelectedVoices = async () => {
    if (selectedVoiceNames.length === 0) {
      setNotice({
        type: "error",
        message: "Select at least one Gemini voice before generating narration.",
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({
      current: 0,
      total: selectedVoiceNames.length,
      voiceName: selectedVoiceNames[0],
    });
    setNotice(null);
    setError(null);
    setSamplePreview(null);

    let queuedVoices = 0;
    let queuedChapters = 0;
    const failures: string[] = [];

    for (let index = 0; index < selectedVoiceNames.length; index += 1) {
      const voiceName = selectedVoiceNames[index];
      setGenerationProgress({
        current: index + 1,
        total: selectedVoiceNames.length,
        voiceName,
      });

      try {
        // POST returns 202 immediately — job runs in background on server
        const response = await fetch(`/api/admin/books/${bookId}/narration`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            voiceName,
            model: selectedModel,
            languageCode: languageCode.trim() || null,
            stylePrompt: stylePrompt.trim() || null,
            chapterIndexes: chaptersToGenerate.trim()
              ? chaptersToGenerate
                  .split(",")
                  .map((val) => parseInt(val.trim(), 10))
                  .filter((val) => !isNaN(val) && val >= 0)
              : null,
            activateAsDefault: voiceName === preferredDefaultVoiceName,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          const message =
            payload.details ||
            payload.error ||
            payload.missingRequirements?.join(" ") ||
            `Failed to start generation for ${voiceName}.`;
          throw new Error(message);
        }

        queuedVoices += 1;
        queuedChapters += Number(payload.queuedChapterCount || 0);
      } catch (generationError) {
        failures.push(
          `${voiceName}: ${generationError instanceof Error ? generationError.message : "Generation failed."}`
        );
      }
    }

    setIsGenerating(false);
    setGenerationProgress(null);
    await loadSummary({ quiet: true });

    if (failures.length === 0) {
      setNotice({
        type: "success",
        message: `Queued ${queuedVoices} voice${queuedVoices === 1 ? "" : "s"} covering ${queuedChapters} chapter${queuedChapters === 1 ? "" : "s"}. The background worker will keep the studio updated as each chapter finishes.`,
      });
      return;
    }

    setNotice({
      type: "error",
      message: queuedVoices > 0
        ? `Queued ${queuedVoices} voice${queuedVoices === 1 ? "" : "s"}, but ${failures.length} request${failures.length === 1 ? "" : "s"} failed. ${failures.join(" ")}`
        : failures.join(" "),
    });
  };

  const handleSetDefaultNarration = async (narrationId: string) => {
    setSettingDefaultNarrationId(narrationId);
    setNotice(null);
    setError(null);
    setSamplePreview(null);

    try {
      const response = await fetch(`/api/admin/books/${bookId}/narration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-default",
          narrationId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to set the default narration voice.");
      }

      setNotice({
        type: "success",
        message: payload.message || "Default narration voice updated.",
      });
      await loadSummary({ quiet: true });
    } catch (setDefaultError) {
      setNotice({
        type: "error",
        message: setDefaultError instanceof Error
          ? setDefaultError.message
          : "Failed to set the default narration voice.",
      });
    } finally {
      setSettingDefaultNarrationId(null);
    }
  };

  const handleRetryFailedChapters = async (narrationId: string) => {
    setRetryingNarrationId(narrationId);
    setNotice(null);
    setError(null);
    setSamplePreview(null);

    try {
      const response = await fetch(`/api/admin/books/${bookId}/narration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "retry-failed",
          narrationId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to retry failed narration chapters.");
      }

      setNotice({
        type: "success",
        message: payload.message || "Retry started for failed chapters.",
      });
      await loadSummary({ quiet: true });
    } catch (retryError) {
      setNotice({
        type: "error",
        message: retryError instanceof Error
          ? retryError.message
          : "Failed to retry failed narration chapters.",
      });
    } finally {
      setRetryingNarrationId(null);
    }
  };

  const canGenerate = Boolean(summary?.generation.canGenerate && selectedVoiceNames.length > 0);
  const isLocalStorage = summary?.storage.provider === "local";
  const storageSummaryLabel = summary
    ? `${summary.storage.providerLabel} ${isLocalStorage ? "disk" : "cloud"}${summary.storage.configured ? " ready" : " not configured"}`
    : "—";
  const storageHintTitle = summary
    ? `${summary.storage.providerLabel} ${isLocalStorage ? "local disk" : "cloud object storage"} ${summary.storage.configured ? "is active" : "is selected"}`
    : "";
  const storageHintMessage = summary
    ? isLocalStorage
      ? "New narration manifests and audio are written to this server. On Plesk, keep NARRATION_STORAGE_LOCAL_DIR on persistent writable storage because deployment packages only ship empty storage placeholders."
      : "Narration manifests and audio are being written to private object storage for this provider, not to the server disk."
      : "";

  return (
    <section className="surface-card p-6 sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
            Narration studio
          </p>
          <h2 className="mt-2 font-playfair text-2xl text-landing-text sm:text-3xl">
            Multi-voice Gemini TTS studio
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
            Sample voices, queue multiple narration options for this book, and choose which ready voice the reader should publish by default. Long books are broken into background chapter jobs so the browser is no longer stuck babysitting one heroic request.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadSummary({ quiet: true })}
          className="ghost-button gap-2 self-start px-4 py-2"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh studio
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="surface-muted p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Gemini
              </p>
              <p className="text-sm font-semibold text-landing-text">
                {summary?.gemini.configured ? "Configured" : "Missing API key"}
              </p>
            </div>
          </div>
        </div>

        <div className="surface-muted p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
              {isLocalStorage ? <HardDrive className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Storage
              </p>
              <p className="text-sm font-semibold text-landing-text">
                {storageSummaryLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="surface-muted p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
              <AudioLines className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Ready voices
              </p>
              <p className="text-sm font-semibold text-landing-text">
                {generatedVoiceCount} published option{generatedVoiceCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>

        <div className="surface-muted p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
              <Headphones className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Reader default
              </p>
              <p className="text-sm font-semibold text-landing-text">
                {activeNarration ? formatVoiceLabel(activeNarration.voice.name, activeNarration.voice.optionName) : "Not published yet"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!loading && summary ? (
        <div
          className={[
            "mt-4 rounded-2xl px-4 py-3 text-sm ring-1",
            isLocalStorage
              ? "bg-amber-50 text-amber-900 ring-amber-200"
              : "bg-sky-50 text-sky-900 ring-sky-200",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            <span
              className={[
                "mt-0.5 rounded-xl p-2",
                isLocalStorage
                  ? "bg-amber-100 text-amber-700"
                  : "bg-sky-100 text-sky-700",
              ].join(" ")}
            >
              {isLocalStorage ? <HardDrive className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
            </span>

            <div>
              <p className="font-semibold text-landing-text">{storageHintTitle}</p>
              <p className="mt-1 leading-6 text-landing-text-muted">{storageHintMessage}</p>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          className={[
            "mt-6 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm",
            notice.type === "success"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
          ].join(" ")}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="w-full">
            <p>{notice.message}</p>
            {notice.type === "success" && samplePreview ? (
              <div className="mt-3">
                <audio
                  src={samplePreview.audioDataUrl}
                  controls
                  controlsList="nodownload"
                  onContextMenu={(e) => e.preventDefault()}
                  autoPlay
                  className="h-10 w-full max-w-md rounded-lg"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {summary?.generation.missingRequirements.length ? (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Generation is blocked until these are fixed:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-700">
                {summary.generation.missingRequirements.map((requirement) => (
                  <li key={requirement}>• {requirement}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-4 text-sm text-landing-text-muted ring-1 ring-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-landing-accent" />
          Loading narration studio...
        </div>
      ) : null}

      {!loading && summary ? (
        <>
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
            <div className="surface-muted p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
                  <WandSparkles className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-landing-text">Voice casting & batch generation</h3>
                  <p className="mt-1 text-sm text-landing-text-muted">
                    Choose as many Gemini voices as you want, sample them instantly, then queue the book. Each voice is processed chapter-by-chapter in the background so very long EPUBs behave like civilized citizens.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-white/70 p-4 ring-1 ring-white/65">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                      Selected voices
                    </p>
                    <p className="mt-1 text-sm text-landing-text-muted">
                      {selectedVoiceNames.length > 0
                        ? `${selectedVoiceNames.length} voice${selectedVoiceNames.length === 1 ? "" : "s"} ready to queue for background generation.`
                        : "Pick one or more voices below to build your book-level voice library."}
                    </p>
                  </div>

                  <div className="rounded-full bg-landing-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
                    {selectedVoiceNames.length} selected
                  </div>
                </div>

                {selectedVoiceNames.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                      Default voice after generation
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedVoiceSummaries.map((voice) => {
                        const isPreferredDefault = preferredDefaultVoiceName === voice.name;

                        return (
                          <button
                            key={voice.name}
                            type="button"
                            onClick={() => setPreferredDefaultVoiceName(voice.name)}
                            className={[
                              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                              isPreferredDefault
                                ? "bg-landing-accent text-white"
                                : "border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent",
                            ].join(" ")}
                          >
                            {voice.name}
                            {isPreferredDefault ? " · publish default" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid max-h-[28rem] grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3 overflow-y-auto pr-1">
                {summary.gemini.voices.map((voice) => {
                  const narration = narrationByVoiceName.get(voice.name);
                  const isSelected = selectedVoiceNames.includes(voice.name);
                  const isReady = narration?.status === "READY";
                  const isActive = Boolean(narration?.active && narration?.status === "READY");
                  const isSampling = samplingVoiceName === voice.name;
                  const chapterCounts = narration ? getNarrationChapterCounts(narration) : null;

                  return (
                    <article
                      key={voice.name}
                      className={[
                        "rounded-2xl border bg-white/85 p-4 shadow-sm transition-all duration-200",
                        isSelected
                          ? "border-landing-accent ring-2 ring-landing-accent/20"
                          : "border-landing-border hover:border-landing-accent/40",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleVoiceSelection(voice.name)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-landing-text">{voice.name}</p>
                            <p className="mt-1 text-xs leading-5 text-landing-text-muted">
                              {voice.description}
                            </p>
                          </div>
                          <span
                            className={[
                              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                              isSelected
                                ? "bg-landing-accent text-white"
                                : "bg-landing-surface-muted text-landing-text-muted",
                            ].join(" ")}
                          >
                            {isSelected ? "Selected" : "Add"}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                          {isReady ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                              Ready
                            </span>
                          ) : null}
                          {isActive ? (
                            <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-landing-accent">
                              Reader default
                            </span>
                          ) : null}
                          {narration && !isReady ? (
                            <span
                              className={[
                                "rounded-full px-2.5 py-1",
                                getStatusClasses(narration.status, narration.active),
                              ].join(" ")}
                            >
                              {narration.status}
                            </span>
                          ) : null}
                        </div>
                      </button>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-landing-text-muted">
                          <p>
                            {narration
                              ? `Last updated ${new Date(narration.updatedAt).toLocaleString()}`
                              : "Not generated for this book yet"}
                          </p>
                          {chapterCounts ? (
                            <p className="mt-1">
                              {chapterCounts.ready}/{chapterCounts.total} chapter{chapterCounts.total === 1 ? "" : "s"} ready
                              {chapterCounts.processing > 0 ? ` · ${chapterCounts.processing} processing` : ""}
                              {chapterCounts.pending > 0 ? ` · ${chapterCounts.pending} queued` : ""}
                              {chapterCounts.failed > 0 ? ` · ${chapterCounts.failed} failed` : ""}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSampleVoice(voice.name)}
                          className="ghost-button px-3 py-1.5 text-xs"
                        >
                          {isSampling ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Sampling...
                            </>
                          ) : (
                            <>
                              <Mic2 className="h-3.5 w-3.5" />
                              Sample
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">Model</span>
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  >
                    {summary.gemini.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">Language code</span>
                  <input
                    value={languageCode}
                    onChange={(event) => setLanguageCode(event.target.value)}
                    placeholder="en"
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>

                <label className="block text-sm text-landing-text-muted md:col-span-2">
                  <span className="mb-2 block font-medium text-landing-text">Sample text for voice previews</span>
                  <textarea
                    value={sampleText}
                    onChange={(event) => setSampleText(event.target.value.slice(0, 1600))}
                    rows={4}
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                  <span className="mt-2 block text-xs text-landing-text-muted">
                    {sampleText.length}/1600 characters · used only for instant voice sampling.
                  </span>
                </label>

                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">Chapters to generate (optional)</span>
                  <input
                    value={chaptersToGenerate}
                    onChange={(event) => setChaptersToGenerate(event.target.value)}
                    placeholder="e.g. 0, 1, 2 (leave blank for full book)"
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>

                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">Processing queue</span>
                  <div className="rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm">
                    <p>
                      {processingVoiceCount > 0
                        ? `${processingVoiceCount} voice queue${processingVoiceCount === 1 ? " is" : "s are"} active · ${chapterQueueSummary.processing} chapter${chapterQueueSummary.processing === 1 ? "" : "s"} processing · ${chapterQueueSummary.pending} queued.`
                        : "No active narration chapter jobs right now."}
                    </p>
                  </div>
                </label>
              </div>

              <label className="mt-4 block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Director notes</span>
                <textarea
                  value={stylePrompt}
                  onChange={(event) => setStylePrompt(event.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </label>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-white/75 p-4 ring-1 ring-white/65 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-landing-text">
                    {generationProgress
                      ? `Queueing ${generationProgress.voiceName} (${generationProgress.current}/${generationProgress.total})`
                      : `Queue ${selectedVoiceNames.length || 0} selected voice${selectedVoiceNames.length === 1 ? "" : "s"}`}
                  </p>
                  <p className="mt-1 text-sm text-landing-text-muted">
                    Jobs are broken into background chapter tasks and the studio auto-refreshes while they run. Use a chapter limit first if you want a quick pilot pass.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleGenerateSelectedVoices()}
                  disabled={isGenerating || !canGenerate}
                  className="brand-button gap-2 px-5 py-3 disabled:cursor-not-allowed disabled:bg-landing-accent/50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Queueing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Queue selected voices
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="surface-muted p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
                    <Mic2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-landing-text">Sample booth</h3>
                    <p className="mt-1 text-sm text-landing-text-muted">
                      Preview a voice before you commit to a full-book generation run.
                    </p>
                  </div>
                </div>

                {samplePreview ? (
                  <div className="mt-5 rounded-2xl bg-white/80 p-4 ring-1 ring-white/65">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-landing-accent">
                        {samplePreview.voiceName}
                      </span>
                      <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                        {samplePreview.model}
                      </span>
                      <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                        {formatDuration(samplePreview.durationMs)}
                      </span>
                    </div>
                    <audio
                      controls
                      controlsList="nodownload"
                      onContextMenu={(e) => e.preventDefault()}
                      className="mt-4 w-full"
                      src={samplePreview.audioDataUrl}
                    />
                    <p className="mt-3 text-sm leading-6 text-landing-text-muted">
                      This preview uses the current director notes, language code, and sample copy above.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl bg-white/80 px-4 py-4 text-sm text-landing-text-muted ring-1 ring-white/65">
                    Choose any voice card and click <span className="font-semibold text-landing-text">Sample</span> to hear a short preview here.
                  </div>
                )}
              </div>

              <div className="surface-muted p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
                    <Headphones className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-landing-text">Published voice library</h3>
                    <p className="mt-1 text-sm text-landing-text-muted">
                      Every ready narration becomes a selectable option for readers. Set any ready voice as the default reader experience here.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {readyNarrations.length > 0 ? readyNarrations.map((narration) => (
                    <article key={narration.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-white/65">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-landing-text">
                              {formatVoiceLabel(narration.voice.name, narration.voice.optionName)}
                            </p>
                            <span
                              className={[
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                getStatusClasses(narration.status, narration.active),
                              ].join(" ")}
                            >
                              {narration.active ? "Default · " : ""}
                              {narration.status}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-landing-text-muted">
                            {narration.voice.provider} · {narration.voice.language}
                            {narration.voice.model ? ` · ${narration.voice.model}` : ""}
                          </p>
                        </div>

                        <div className="text-right text-sm">
                          <p className="font-semibold text-landing-text">{formatDuration(narration.totalDurationMs)}</p>
                          <p className="text-landing-text-muted">{narration.totalChapters} chapters</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-landing-text-muted">
                        <span className="rounded-full bg-landing-surface-muted px-3 py-1 ring-1 ring-landing-border/70">
                          {narration.storageProvider.toUpperCase()}
                        </span>
                        <span className="rounded-full bg-landing-surface-muted px-3 py-1 ring-1 ring-landing-border/70">
                          Ready {narration.readyAt ? new Date(narration.readyAt).toLocaleString() : "recently"}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-landing-text-muted">
                          Readers can switch to this voice from the narration player.
                        </p>
                        {narration.active ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                            Live in reader
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleSetDefaultNarration(narration.id)}
                            disabled={settingDefaultNarrationId === narration.id}
                            className="brand-button gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-landing-accent/50"
                          >
                            {settingDefaultNarrationId === narration.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Publishing...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                Make default
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </article>
                  )) : (
                    <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-landing-text-muted ring-1 ring-white/65">
                      No ready voices yet. Generate your first narration pass to start building the reader’s voice library.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
                <AudioLines className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-landing-text">Narration run history</h3>
                <p className="mt-1 text-sm text-landing-text-muted">
                  Recent generations, failures, and in-progress runs for this book.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {summary.narrations.map((narration) => (
                <article key={narration.id} className="surface-muted p-4">
                  {(() => {
                    const chapterCounts = getNarrationChapterCounts(narration);

                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-landing-text">
                                {formatVoiceLabel(narration.voice.name, narration.voice.optionName)}
                              </p>
                              <span
                                className={[
                                  "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                  getStatusClasses(narration.status, narration.active),
                                ].join(" ")}
                              >
                                {narration.active ? "Default · " : ""}
                                {narration.status}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-landing-text-muted">
                              Updated {new Date(narration.updatedAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="text-right text-sm">
                            <p className="font-semibold text-landing-text">{formatDuration(narration.totalDurationMs)}</p>
                            <p className="text-landing-text-muted">{chapterCounts.total} chapters</p>
                          </div>
                        </div>

                        {narration.errorMessage ? (
                          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                            {narration.errorMessage}
                          </p>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-landing-text-muted">
                          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-landing-border/70">
                            {narration.storageProvider.toUpperCase()}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-landing-border/70">
                            {narration.voice.language}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-landing-border/70">
                            {narration.voice.provider}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
                            {chapterCounts.ready} ready
                          </span>
                          {chapterCounts.processing > 0 ? (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
                              {chapterCounts.processing} processing
                            </span>
                          ) : null}
                          {chapterCounts.pending > 0 ? (
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-200">
                              {chapterCounts.pending} queued
                            </span>
                          ) : null}
                          {chapterCounts.failed > 0 ? (
                            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-rose-200">
                              {chapterCounts.failed} failed
                            </span>
                          ) : null}
                        </div>

                        {narration.status === "FAILED" && chapterCounts.failed > 0 ? (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-landing-border/40 pt-4">
                            <p className="text-sm text-landing-text-muted">
                              Generate only the failed chapters of this narration.
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleRetryFailedChapters(narration.id)}
                              disabled={retryingNarrationId === narration.id}
                              className="brand-button gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-landing-accent/50"
                            >
                              {retryingNarrationId === narration.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RefreshCcw className="h-4 w-4" />
                                  Retry failed chapters
                                </>
                              )}
                            </button>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </article>
              ))}

              {summary.narrations.length === 0 ? (
                <div className="surface-muted p-4 text-sm text-landing-text-muted">
                  Narration runs will appear here once generation starts.
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
