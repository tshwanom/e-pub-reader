import { z } from "zod";

export type NarrationFeatureReason =
  | "ready"
  | "not-generated"
  | "processing"
  | "failed"
  | "donor-required"
  | "sign-in-required"
  | "storage-not-configured"
  | "book-access-required"
  | "catalog-unavailable";

export type NarrationObjectStorageProvider = "s3" | "r2" | "b2" | "local";
export type PersistedNarrationStorageProvider = "S3" | "R2" | "B2" | "LOCAL";

const objectToPersistedNarrationStorageProviderMap: Record<
  NarrationObjectStorageProvider,
  PersistedNarrationStorageProvider
> = {
  s3: "S3",
  r2: "R2",
  b2: "B2",
  local: "LOCAL",
};

const persistedToObjectNarrationStorageProviderMap: Record<
  PersistedNarrationStorageProvider,
  NarrationObjectStorageProvider
> = {
  S3: "s3",
  R2: "r2",
  B2: "b2",
  LOCAL: "local",
};

export interface NarrationManifestCue {
  sequence: number;
  startMs: number;
  endMs: number;
  targetHref: string;
  targetElementId: string | null;
  targetCfi: string | null;
  excerpt: string | null;
}

export interface NarrationManifestChapter {
  id: string;
  chapterIndex: number;
  title: string | null;
  spineHref: string;
  durationMs: number | null;
  audio: {
    objectKey: string | null;
    mimeType: string;
    url: string | null;
  };
  cueCount: number;
  cues: NarrationManifestCue[];
}

export interface NarrationManifest {
  version: 1;
  bookId: string;
  narrationId: string;
  generatedAt: string;
  totalDurationMs: number | null;
  chapterCount: number;
  storage: {
    provider: NarrationObjectStorageProvider;
    manifestObjectKey: string | null;
  };
  voice: {
    id: string;
    name: string;
    slug: string;
    provider: string;
    language: string;
  };
  chapters: NarrationManifestChapter[];
}

export interface NarrationFeatureVoiceOption {
  narrationId: string;
  active: boolean;
  totalDurationMs: number | null;
  chapterCount: number;
  manifest: NarrationManifest;
  manifestUrl: string | null;
  voice: NarrationManifest["voice"];
}

export interface NarrationFeatureResponse {
  feature: "narration";
  donorOnly: true;
  available: boolean;
  reason: NarrationFeatureReason;
  message: string;
  storageProvider: NarrationObjectStorageProvider;
  defaultVoiceSlug: string | null;
  voices: NarrationFeatureVoiceOption[];
  manifest: NarrationManifest | null;
  manifestUrl: string | null;
  bookHasLegacyAudiobook: boolean;
}

const nullableTrimmedStringSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return value ?? null;
  },
  z.string().nullable()
);

const persistedNarrationStorageProviderSchema = z.enum(["S3", "R2", "B2", "LOCAL"]);

const narrationStorageProviderInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "s3":
      return "S3";
    case "r2":
      return "R2";
    case "b2":
      return "B2";
    case "local":
      return "LOCAL";
    default:
      return value;
  }
}, persistedNarrationStorageProviderSchema.optional());

const narrationCueInputSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    targetHref: z.string().trim().min(1),
    targetElementId: nullableTrimmedStringSchema,
    targetCfi: nullableTrimmedStringSchema,
    excerpt: nullableTrimmedStringSchema,
  })
  .refine((cue) => cue.endMs > cue.startMs, {
    message: "endMs must be greater than startMs",
    path: ["endMs"],
  });

const narrationChapterInputSchema = z
  .object({
    chapterIndex: z.number().int().nonnegative(),
    title: nullableTrimmedStringSchema,
    spineHref: z.string().trim().min(1),
    status: z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]).default("PENDING"),
    audioObjectKey: nullableTrimmedStringSchema,
    audioMimeType: z.string().trim().min(1).default("audio/mpeg"),
    durationMs: z.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
    cues: z.array(narrationCueInputSchema).default([]),
  })
  .superRefine((chapter, ctx) => {
    const sequences = new Set<number>();

    chapter.cues.forEach((cue, index) => {
      if (sequences.has(cue.sequence)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate cue sequence ${cue.sequence}`,
          path: ["cues", index, "sequence"],
        });
      }

      sequences.add(cue.sequence);
    });
  });

export const narrationUpsertPayloadSchema = z
  .object({
    voice: z.object({
      slug: z.string().trim().min(1),
      name: z.string().trim().min(1),
      provider: z.string().trim().min(1),
      language: z.string().trim().min(1).default("en"),
      description: nullableTrimmedStringSchema,
      sampleText: nullableTrimmedStringSchema,
    }),
    narration: z.object({
      status: z.enum(["PENDING", "PROCESSING", "READY", "FAILED", "ARCHIVED"]).default("PENDING"),
      storageProvider: narrationStorageProviderInputSchema,
      manifestObjectKey: nullableTrimmedStringSchema,
      audioMimeType: z.string().trim().min(1).default("audio/mpeg"),
      totalDurationMs: z.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
      active: z.boolean().default(false),
      readyAt: z.preprocess(
        (value) => {
          if (value == null || value === "") return null;
          if (value instanceof Date) return value;
          return new Date(String(value));
        },
        z.date().nullable()
      ),
      errorMessage: nullableTrimmedStringSchema,
    }),
    replaceExistingChapters: z.boolean().default(true),
    chapters: z.array(narrationChapterInputSchema).default([]),
  })
  .superRefine((payload, ctx) => {
    const chapterIndexes = new Set<number>();
    const chapterHrefs = new Set<string>();

    payload.chapters.forEach((chapter, index) => {
      if (chapterIndexes.has(chapter.chapterIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate chapter index ${chapter.chapterIndex}`,
          path: ["chapters", index, "chapterIndex"],
        });
      }

      if (chapterHrefs.has(chapter.spineHref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate chapter spineHref ${chapter.spineHref}`,
          path: ["chapters", index, "spineHref"],
        });
      }

      chapterIndexes.add(chapter.chapterIndex);
      chapterHrefs.add(chapter.spineHref);
    });
  })
  .transform((payload) => ({
    ...payload,
    chapters: [...payload.chapters].sort((a, b) => a.chapterIndex - b.chapterIndex),
  }));

export type NarrationUpsertPayload = z.infer<typeof narrationUpsertPayloadSchema>;

type NarrationManifestSource = {
  id: string;
  totalDurationMs: number | null;
  manifestObjectKey: string | null;
  updatedAt: Date | string;
  voice: {
    id: string;
    name: string;
    slug: string;
    provider: string;
    language: string;
  };
  chapters: Array<{
    id: string;
    chapterIndex: number;
    title: string | null;
    spineHref: string;
    durationMs: number | null;
    audioObjectKey: string | null;
    audioMimeType: string;
    cues: Array<{
      sequence: number;
      startMs: number;
      endMs: number;
      targetHref: string;
      targetElementId: string | null;
      targetCfi: string | null;
      excerpt: string | null;
    }>;
  }>;
};

export type NarrationObjectUrlSigner = (objectKey: string) => Promise<string>;

export function toPersistedNarrationStorageProvider(
  provider: NarrationObjectStorageProvider | PersistedNarrationStorageProvider
): PersistedNarrationStorageProvider {
  if (provider in persistedToObjectNarrationStorageProviderMap) {
    return provider as PersistedNarrationStorageProvider;
  }

  return objectToPersistedNarrationStorageProviderMap[
    provider as NarrationObjectStorageProvider
  ];
}

export function toNarrationObjectStorageProvider(
  provider: NarrationObjectStorageProvider | PersistedNarrationStorageProvider
): NarrationObjectStorageProvider {
  if (provider in objectToPersistedNarrationStorageProviderMap) {
    return provider as NarrationObjectStorageProvider;
  }

  return persistedToObjectNarrationStorageProviderMap[
    provider as PersistedNarrationStorageProvider
  ];
}

export function createNarrationFeatureResponse(
  input: Omit<
    NarrationFeatureResponse,
    "feature" | "donorOnly" | "storageProvider" | "defaultVoiceSlug" | "voices"
  > & {
    storageProvider?: NarrationObjectStorageProvider;
    defaultVoiceSlug?: string | null;
    voices?: NarrationFeatureVoiceOption[];
  }
): NarrationFeatureResponse {
  const fallbackVoices = input.voices && input.voices.length > 0
    ? input.voices
    : input.manifest
      ? [{
          narrationId: input.manifest.narrationId,
          active: true,
          totalDurationMs: input.manifest.totalDurationMs,
          chapterCount: input.manifest.chapterCount,
          manifest: input.manifest,
          manifestUrl: input.manifestUrl,
          voice: input.manifest.voice,
        }]
      : [];

  return {
    feature: "narration",
    donorOnly: true,
    storageProvider: input.storageProvider ?? "s3",
    ...input,
    defaultVoiceSlug: input.defaultVoiceSlug
      ?? input.manifest?.voice.slug
      ?? fallbackVoices[0]?.voice.slug
      ?? null,
    voices: fallbackVoices,
  };
}

export function parseNarrationUpsertPayload(payload: unknown): NarrationUpsertPayload {
  return narrationUpsertPayloadSchema.parse(payload);
}

export function buildNarrationManifest(
  bookId: string,
  narration: NarrationManifestSource,
  storageProvider: NarrationObjectStorageProvider = "s3"
): NarrationManifest {
  return {
    version: 1,
    bookId,
    narrationId: narration.id,
    generatedAt: new Date(narration.updatedAt).toISOString(),
    totalDurationMs: narration.totalDurationMs,
    chapterCount: narration.chapters.length,
    storage: {
      provider: storageProvider,
      manifestObjectKey: narration.manifestObjectKey,
    },
    voice: {
      id: narration.voice.id,
      name: narration.voice.name,
      slug: narration.voice.slug,
      provider: narration.voice.provider,
      language: narration.voice.language,
    },
    chapters: narration.chapters.map((chapter) => ({
      id: chapter.id,
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      spineHref: chapter.spineHref,
      durationMs: chapter.durationMs,
      audio: {
        objectKey: chapter.audioObjectKey,
        mimeType: chapter.audioMimeType,
        url: null,
      },
      cueCount: chapter.cues.length,
      cues: chapter.cues.map((cue) => ({
        sequence: cue.sequence,
        startMs: cue.startMs,
        endMs: cue.endMs,
        targetHref: cue.targetHref,
        targetElementId: cue.targetElementId,
        targetCfi: cue.targetCfi,
        excerpt: cue.excerpt,
      })),
    })),
  };
}

export async function signNarrationManifestAssets(
  manifest: NarrationManifest,
  signObjectUrl: NarrationObjectUrlSigner
) {
  const signedUrlCache = new Map<string, Promise<string>>();

  const resolveSignedUrl = (objectKey: string) => {
    const normalizedObjectKey = objectKey.trim();

    if (!signedUrlCache.has(normalizedObjectKey)) {
      signedUrlCache.set(normalizedObjectKey, signObjectUrl(normalizedObjectKey));
    }

    return signedUrlCache.get(normalizedObjectKey)!;
  };

  const chapters = await Promise.all(
    manifest.chapters.map(async (chapter) => ({
      ...chapter,
      audio: {
        ...chapter.audio,
        url: chapter.audio.objectKey
          ? await resolveSignedUrl(chapter.audio.objectKey)
          : null,
      },
    }))
  );

  return {
    manifest: {
      ...manifest,
      chapters,
    },
    manifestUrl: manifest.storage.manifestObjectKey
      ? await resolveSignedUrl(manifest.storage.manifestObjectKey)
      : null,
  };
}
