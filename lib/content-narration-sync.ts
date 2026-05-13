import { createHash } from "crypto";
import {
  getContentNarrationTranscript,
  type ContentNarrationSource,
  type ContentNarrationTranscriptSource,
} from "@/lib/content";

export type ContentNarrationSyncState =
  | "CURRENT"
  | "PROCESSING"
  | "OUT_OF_SYNC"
  | "FAILED"
  | "NOT_GENERATED";

export type SyncableContentNarration = {
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED" | string;
  audioObjectKey: string | null;
  sourceHash?: string | null;
};

export type ContentNarrationSyncSummary = {
  syncState: ContentNarrationSyncState;
  message: string;
  hasTrackedSourceHash: boolean;
  currentReadyCount: number;
  currentProcessingCount: number;
  staleReadyCount: number;
};

function normalizeHash(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildContentNarrationSourceHash(content: ContentNarrationTranscriptSource) {
  return createHash("sha256")
    .update(getContentNarrationTranscript(content), "utf8")
    .digest("hex");
}

export function hasTrackedContentNarrationSourceHash(content: { narrationSourceHash?: string | null }) {
  return Boolean(normalizeHash(content.narrationSourceHash));
}

export function getContentNarrationSourceHash(
  content: ContentNarrationTranscriptSource & { narrationSourceHash?: string | null }
) {
  return normalizeHash(content.narrationSourceHash) || buildContentNarrationSourceHash(content);
}

export function isContentNarrationCurrent(
  narration: SyncableContentNarration,
  input: {
    currentSourceHash: string;
    hasTrackedSourceHash: boolean;
  }
) {
  if (!input.hasTrackedSourceHash) {
    return true;
  }

  return normalizeHash(narration.sourceHash) === normalizeHash(input.currentSourceHash);
}

export function getContentNarrationSyncSummary(input: {
  currentSourceHash: string;
  hasTrackedSourceHash: boolean;
  narrations: SyncableContentNarration[];
}): ContentNarrationSyncSummary {
  const { currentSourceHash, hasTrackedSourceHash, narrations } = input;
  const isCurrent = (narration: SyncableContentNarration) =>
    isContentNarrationCurrent(narration, { currentSourceHash, hasTrackedSourceHash });

  const currentReadyNarrations = narrations.filter(
    (narration) => narration.status === "READY" && Boolean(narration.audioObjectKey) && isCurrent(narration)
  );
  const currentProcessingNarrations = narrations.filter(
    (narration) =>
      (narration.status === "PENDING" || narration.status === "PROCESSING") && isCurrent(narration)
  );
  const currentFailedNarrations = narrations.filter(
    (narration) => narration.status === "FAILED" && isCurrent(narration)
  );
  const staleReadyNarrations = hasTrackedSourceHash
    ? narrations.filter(
        (narration) =>
          narration.status === "READY"
          && Boolean(narration.audioObjectKey)
          && !isCurrent(narration)
      )
    : [];

  if (currentReadyNarrations.length > 0) {
    return {
      syncState: "CURRENT",
      message: hasTrackedSourceHash
        ? currentReadyNarrations.length > 1
          ? `Narration is synced with the latest content in ${currentReadyNarrations.length} published voices.`
          : "Narration matches the latest saved content."
        : "Narration is live. The next content save will attach strict sync tracking automatically.",
      hasTrackedSourceHash,
      currentReadyCount: currentReadyNarrations.length,
      currentProcessingCount: currentProcessingNarrations.length,
      staleReadyCount: staleReadyNarrations.length,
    };
  }

  if (currentProcessingNarrations.length > 0) {
    return {
      syncState: "PROCESSING",
      message: "Narration is being regenerated so playback matches the latest content.",
      hasTrackedSourceHash,
      currentReadyCount: 0,
      currentProcessingCount: currentProcessingNarrations.length,
      staleReadyCount: staleReadyNarrations.length,
    };
  }

  if (currentFailedNarrations.length > 0) {
    return {
      syncState: "FAILED",
      message: "The latest narration refresh failed. Run generation again to re-sync this content.",
      hasTrackedSourceHash,
      currentReadyCount: 0,
      currentProcessingCount: 0,
      staleReadyCount: staleReadyNarrations.length,
    };
  }

  if (hasTrackedSourceHash && narrations.some((narration) => !isCurrent(narration))) {
    return {
      syncState: "OUT_OF_SYNC",
      message: "Saved content is newer than the available audio. Sync needs to finish before playback can return.",
      hasTrackedSourceHash,
      currentReadyCount: 0,
      currentProcessingCount: 0,
      staleReadyCount: staleReadyNarrations.length,
    };
  }

  return {
    syncState: "NOT_GENERATED",
    message: "No narration has been generated for this content yet.",
    hasTrackedSourceHash,
    currentReadyCount: 0,
    currentProcessingCount: 0,
    staleReadyCount: 0,
  };
}
