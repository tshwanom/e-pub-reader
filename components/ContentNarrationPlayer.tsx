"use client";

import { useEffect, useMemo, useState } from "react";
import { Headphones, Loader2, Lock, TriangleAlert } from "lucide-react";

type NarrationVoice = {
  narrationId: string;
  active: boolean;
  durationMs: number | null;
  audioMimeType: string;
  audioUrl: string;
  voice: {
    id: string;
    name: string;
    slug: string;
    provider: string;
    language: string;
  };
};

type NarrationResponse = {
  available: boolean;
  reason: string;
  message: string;
  defaultVoiceSlug?: string | null;
  voices?: NarrationVoice[];
};

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export default function ContentNarrationPlayer({ contentId, compact = false }: { contentId: string; compact?: boolean }) {
  const [data, setData] = useState<NarrationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVoiceSlug, setSelectedVoiceSlug] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadNarration = async () => {
      try {
        const response = await fetch(`/api/content/${contentId}/narration`, { cache: "no-store" });
        const payload = await response.json();

        if (!isActive) {
          return;
        }

        setData(payload);
        setSelectedVoiceSlug(payload.defaultVoiceSlug || payload.voices?.[0]?.voice?.slug || null);
      } catch {
        if (isActive) {
          setData({ available: false, reason: "unavailable", message: "Narration is unavailable right now.", voices: [] });
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadNarration();

    return () => {
      isActive = false;
    };
  }, [contentId]);

  const voices = data?.voices || [];
  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voice.slug === selectedVoiceSlug) || voices[0] || null,
    [selectedVoiceSlug, voices]
  );
  const shouldShowCompactLockedBadge = compact && (
    data?.reason === "donor-required"
    || data?.reason === "sign-in-required"
  );
  const shouldHideUnavailableState = compact && (
    data?.reason === "disabled"
    || data?.reason === "not-generated"
  );

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/60 px-4 py-3 text-sm text-landing-text-muted ring-1 ring-white/65">
        <Loader2 className="h-4 w-4 animate-spin text-landing-accent" />
        Checking donor narration...
      </div>
    );
  }

  if (!data?.available || !selectedVoice) {
    if (shouldShowCompactLockedBadge) {
      return (
        <div className="mt-4">
          <div
            role="status"
            aria-label={data?.message || "Donor narration is locked for this content."}
            title={data?.message || undefined}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-landing-accent/15 bg-white/75 px-3 py-1.5 text-[11px] shadow-sm ring-1 ring-white/65 backdrop-blur-sm"
          >
            <span className="rounded-full bg-landing-accent/10 p-1 text-landing-accent" aria-hidden="true">
              <Lock className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold uppercase tracking-[0.14em] text-landing-text">Donor narration</span>
            <span className="text-landing-text-muted">Locked</span>
          </div>
        </div>
      );
    }

    if (shouldHideUnavailableState) {
      return null;
    }

    return (
      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{data?.message || "Narration is not available yet."}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl bg-white/75 p-4 ring-1 ring-white/65">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
            <Headphones className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-landing-text">Donor narration</p>
            <p className="mt-1 text-xs text-landing-text-muted">
              {selectedVoice.voice.name}{formatDuration(selectedVoice.durationMs) ? ` · ${formatDuration(selectedVoice.durationMs)}` : ""}
            </p>
          </div>
        </div>

        {voices.length > 1 ? (
          <select
            value={selectedVoice.voice.slug}
            onChange={(event) => setSelectedVoiceSlug(event.target.value)}
            className="rounded-xl border border-landing-border bg-white px-3 py-2 text-sm text-landing-text focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
          >
            {voices.map((voice) => (
              <option key={voice.narrationId} value={voice.voice.slug}>{voice.voice.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      <audio controls src={selectedVoice.audioUrl} className="mt-4 w-full" preload="none" />
    </div>
  );
}
