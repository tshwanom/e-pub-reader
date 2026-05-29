"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioLines, CheckCircle2, Headphones, Loader2, Mic2, RefreshCcw, Sparkles, TriangleAlert, XCircle } from "lucide-react";

type NarrationStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";

type SummaryResponse = {
  content: {
    id: string;
    title: string;
    type: string;
    status: string;
    narrationEnabled: boolean;
    transcriptCharacterCount: number;
    narrationSyncStatus: "CURRENT" | "PROCESSING" | "OUT_OF_SYNC" | "FAILED" | "NOT_GENERATED";
    narrationSyncMessage: string;
    hasTrackedSourceHash: boolean;
    syncedReadyVoiceCount: number;
    staleReadyVoiceCount: number;
  };
  gemini: {
    configured: boolean;
    defaultModel: string;
    defaultVoiceName: string;
    models: Array<{ id: string; label: string; description: string }>;
    voices: Array<{ name: string; description: string }>;
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
    audioObjectKey: string | null;
    audioMimeType: string;
    durationMs: number | null;
    readyAt: string | null;
    isCurrent: boolean;
    isStale: boolean;
    errorMessage: string | null;
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
  }>;
};

type Notice = {
  type: "success" | "error";
  message: string;
};

const DEFAULT_STYLE_PROMPT =
  "Warm, clear editorial narration for platform content. Keep the pace conversational, polished, and intimate.";
const DEFAULT_SAMPLE_TEXT =
  "This platform narration should sound clear, warm, and easy to follow, like a thoughtful editorial reading.";

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "—";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
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

function getSyncClasses(syncStatus: SummaryResponse["content"]["narrationSyncStatus"]) {
  switch (syncStatus) {
    case "CURRENT":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "PROCESSING":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
    case "FAILED":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    case "OUT_OF_SYNC":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

export default function ContentNarrationStudio({ contentId }: { contentId: string }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const [model, setModel] = useState("");
  const [languageCode, setLanguageCode] = useState("en");
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE_PROMPT);
  const [sampleText, setSampleText] = useState(DEFAULT_SAMPLE_TEXT);
  const [samplePreview, setSamplePreview] = useState<{ audioDataUrl: string; voiceName: string; durationMs: number } | null>(null);

  const loadSummary = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (options.quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch(`/api/admin/content/${contentId}/narration`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || payload.details || "Failed to load content narration studio.");
      }

      setSummary(payload);
      setVoiceName((current) => current || payload.gemini.defaultVoiceName);
      setModel((current) => current || payload.gemini.defaultModel);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load content narration studio.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [contentId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const readyNarrations = useMemo(
    () => (summary?.narrations || []).filter((narration) => narration.status === "READY" && narration.isCurrent),
    [summary]
  );

  const activeNarration = useMemo(
    () => readyNarrations.find((narration) => narration.active) || readyNarrations[0] || null,
    [readyNarrations]
  );

  const canGenerate = Boolean(summary?.generation.canGenerate && voiceName);

  const handleSample = async () => {
    if (!sampleText.trim()) {
      setNotice({ type: "error", message: "Add sample text before requesting a preview." });
      return;
    }

    setSampling(true);
    setNotice(null);
    setSamplePreview(null);

    try {
      const response = await fetch(`/api/admin/content/${contentId}/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sample",
          voiceName,
          model,
          languageCode,
          stylePrompt,
          sampleText,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to sample this voice.");
      }

      setSamplePreview({ audioDataUrl: payload.audioDataUrl, voiceName: payload.voiceName, durationMs: payload.durationMs || 0 });
      setNotice({ type: "success", message: payload.message || "Sample preview is ready." });
    } catch (sampleError) {
      setNotice({ type: "error", message: sampleError instanceof Error ? sampleError.message : "Failed to sample this voice." });
    } finally {
      setSampling(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setNotice(null);
    setSamplePreview(null);

    try {
      const response = await fetch(`/api/admin/content/${contentId}/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          voiceName,
          model,
          languageCode,
          stylePrompt,
          activateAsDefault: true,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || payload.missingRequirements?.join(" ") || "Failed to start content narration.");
      }

      setNotice({ type: "success", message: payload.message || "Narration generation started." });
      await loadSummary({ quiet: true });
    } catch (generateError) {
      setNotice({ type: "error", message: generateError instanceof Error ? generateError.message : "Failed to start content narration." });
    } finally {
      setGenerating(false);
    }
  };

  const handleSetDefault = async (narrationId: string) => {
    setSettingDefaultId(narrationId);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/content/${contentId}/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-default", narrationId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Failed to set default voice.");
      }

      setNotice({ type: "success", message: payload.message || "Default voice updated." });
      await loadSummary({ quiet: true });
    } catch (defaultError) {
      setNotice({ type: "error", message: defaultError instanceof Error ? defaultError.message : "Failed to set default voice." });
    } finally {
      setSettingDefaultId(null);
    }
  };

  return (
    <section className="surface-card p-6 sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Content narration</p>
          <h2 className="mt-2 font-playfair text-2xl text-landing-text sm:text-3xl">Donor voice studio</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
            Generate narrated audio for articles, poems, and quotes — not only EPUBs. Videos use the custom player only and stay narration-free.
          </p>
        </div>

        <button type="button" onClick={() => void loadSummary({ quiet: true })} className="ghost-button gap-2 self-start px-4 py-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-4 text-sm text-landing-text-muted ring-1 ring-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-landing-accent" />
          Loading content narration studio...
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {notice ? (
        <div className={["mt-6 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm", notice.type === "success" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"].join(" ")}>
          {notice.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="w-full">
            <p>{notice.message}</p>
            {samplePreview ? (
              <audio
                src={samplePreview.audioDataUrl}
                controls
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                className="mt-3 h-10 w-full max-w-md rounded-lg"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {summary?.generation.missingRequirements.length ? (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Generation is blocked until these are fixed:</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-700">
                {summary.generation.missingRequirements.map((requirement) => <li key={requirement}>• {requirement}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className={["mt-6 rounded-2xl px-4 py-4 text-sm", getSyncClasses(summary.content.narrationSyncStatus)].join(" ")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold">Sync status · {summary.content.narrationSyncStatus.replace(/_/g, " ")}</p>
              <p className="mt-1 leading-6">{summary.content.narrationSyncMessage}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
              <span className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-current/10">
                {summary.content.syncedReadyVoiceCount} synced ready
              </span>
              {summary.content.staleReadyVoiceCount > 0 ? (
                <span className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-current/10">
                  {summary.content.staleReadyVoiceCount} stale ready
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {summary ? (
        summary.content.type === "VIDEO" ? (
          <div className="mt-6 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-amber-900">Video narration is disabled for this item</p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              This content uses the clean in-library video player instead of donor narration. Any legacy video narration stays hidden from readers and new generation runs are blocked.
            </p>
            {summary.narrations.length > 0 ? (
              <p className="mt-3 text-sm leading-6 text-amber-800">
                Existing narration records: {summary.narrations.length}. They remain in the editor history for reference only.
              </p>
            ) : null}
          </div>
        ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div className="surface-muted p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Voice</span>
                <select value={voiceName} onChange={(event) => setVoiceName(event.target.value)} className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25">
                  {summary.gemini.voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} — {voice.description}</option>)}
                </select>
              </label>

              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Model</span>
                <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25">
                  {summary.gemini.models.map((modelOption) => <option key={modelOption.id} value={modelOption.id}>{modelOption.label}</option>)}
                </select>
              </label>

              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Language code</span>
                <input value={languageCode} onChange={(event) => setLanguageCode(event.target.value)} className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25" />
              </label>

              <div className="rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm">
                <p className="font-medium text-landing-text">Transcript length</p>
                <p className="mt-1 text-landing-text-muted">{summary.content.transcriptCharacterCount.toLocaleString()} characters queued for narration.</p>
                <p className="mt-2 text-xs text-landing-text-muted">
                  {summary.content.hasTrackedSourceHash
                    ? "Saved edits automatically invalidate older audio until the matching refresh finishes."
                    : "Legacy audio is live now; the next save will attach automatic sync tracking."}
                </p>
              </div>
            </div>

            <label className="mt-4 block text-sm text-landing-text-muted">
              <span className="mb-2 block font-medium text-landing-text">Sample text</span>
              <textarea value={sampleText} onChange={(event) => setSampleText(event.target.value.slice(0, 1600))} rows={3} className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25" />
            </label>

            <label className="mt-4 block text-sm text-landing-text-muted">
              <span className="mb-2 block font-medium text-landing-text">Director notes</span>
              <textarea value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} rows={4} className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm leading-6 text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25" />
            </label>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-white/75 p-4 ring-1 ring-white/65 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-landing-text">Generate or re-sync narration</p>
                <p className="mt-1 text-sm text-landing-text-muted">Creates one stored audio file for this content item and refreshes it whenever the saved script changes.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => void handleSample()} disabled={sampling || !voiceName} className="ghost-button gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                  {sampling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
                  Sample
                </button>
                <button type="button" onClick={() => void handleGenerate()} disabled={generating || !canGenerate} className="brand-button gap-2 disabled:cursor-not-allowed disabled:bg-landing-accent/50">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? "Starting..." : "Generate"}
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="surface-muted p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent"><Headphones className="h-4 w-4" /></span>
                <div>
                  <h3 className="text-base font-semibold text-landing-text">Published voices</h3>
                  <p className="mt-1 text-sm text-landing-text-muted">{activeNarration ? `${activeNarration.voice.optionName || activeNarration.voice.name} is live by default.` : "No ready voice yet."}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {summary.narrations.map((narration) => (
                  <article key={narration.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-white/65">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-landing-text">{narration.voice.optionName || narration.voice.name}</p>
                        <p className="mt-1 text-xs text-landing-text-muted">Updated {new Date(narration.updatedAt).toLocaleString()}</p>
                      </div>
                      <span className={["inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", getStatusClasses(narration.status, narration.active)].join(" ")}>{narration.active ? "Default · " : ""}{narration.isStale && narration.status === "READY" ? "Needs sync" : narration.status}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-landing-text-muted">
                      <span className="rounded-full bg-landing-surface-muted px-3 py-1 ring-1 ring-landing-border/70">{formatDuration(narration.durationMs)}</span>
                      <span className="rounded-full bg-landing-surface-muted px-3 py-1 ring-1 ring-landing-border/70">{narration.storageProvider.toUpperCase()}</span>
                      <span className="rounded-full bg-landing-surface-muted px-3 py-1 ring-1 ring-landing-border/70">{narration.isCurrent ? "Current script" : "Older script"}</span>
                    </div>

                    {narration.isStale ? (
                      <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                        This audio was generated from an older content version and stays hidden until it is re-synced.
                      </p>
                    ) : null}

                    {narration.errorMessage ? <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{narration.errorMessage}</p> : null}

                    {narration.status === "READY" && narration.isCurrent && !narration.active ? (
                      <button type="button" onClick={() => void handleSetDefault(narration.id)} disabled={settingDefaultId === narration.id} className="brand-button mt-4 gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-landing-accent/50">
                        {settingDefaultId === narration.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Make default
                      </button>
                    ) : null}
                  </article>
                ))}

                {summary.narrations.length === 0 ? (
                  <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-landing-text-muted ring-1 ring-white/65">
                    No content narration runs yet. Generate the first pass from the controls on the left.
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
        )
      ) : null}
    </section>
  );
}
