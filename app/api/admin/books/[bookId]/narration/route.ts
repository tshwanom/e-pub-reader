import { authOptions } from "@/lib/auth";
import { resolveStoredBookFilePath } from "@/lib/book-storage";
import {
  buildNarrationCueTimelineFromBlocks,
  buildNarrationGenerationChunks,
  extractEpubNarrationChapters,
} from "@/lib/epub-narration";
import {
  buildGeminiNarrationVoiceSlug,
  buildGeminiVoiceProvider,
  GEMINI_TTS_MODELS,
  GEMINI_TTS_VOICES,
  getDefaultGeminiTtsModel,
  getDefaultGeminiTtsVoice,
  getGeminiModelFromProvider,
  getGeminiVoiceOptionName,
  isGeminiTtsConfigured,
  mergeGeminiPcmAudio,
  synthesizeGeminiSpeech,
} from "@/lib/gemini-tts";
import {
  buildNarrationManifest,
  toNarrationObjectStorageProvider,
  toPersistedNarrationStorageProvider,
} from "@/lib/narration";
import {
  getNarrationStorageConfig,
  getNarrationStorageProvider,
  getNarrationStorageProviderLabel,
  writeNarrationObject,
} from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const runtime = "nodejs";

const narrationActionSchema = z.object({
  action: z.enum(["generate", "sample", "set-default"]).default("generate"),
});

const generationRequestSchema = z.object({
  action: z.literal("generate").optional().default("generate"),
  voiceName: z.string().trim().min(1),
  model: z.string().trim().min(1).optional().nullable(),
  languageCode: z.string().trim().min(1).optional().nullable(),
  stylePrompt: z.string().trim().max(5000).optional().nullable(),
  maxChapters: z.preprocess(
    (value) => {
      if (value === "" || value == null) {
        return null;
      }

      return Number(value);
    },
    z.number().int().positive().max(200).nullable()
  ).optional().default(null),
  activateAsDefault: z.boolean().optional().default(false),
});

const sampleRequestSchema = z.object({
  action: z.literal("sample"),
  voiceName: z.string().trim().min(1),
  model: z.string().trim().min(1).optional().nullable(),
  languageCode: z.string().trim().min(1).optional().nullable(),
  stylePrompt: z.string().trim().max(5000).optional().nullable(),
  sampleText: z.string().trim().min(1).max(1600),
});

const setDefaultRequestSchema = z.object({
  action: z.literal("set-default"),
  narrationId: z.string().trim().min(1),
});

const adminNarrationSelect = {
  id: true,
  status: true,
  active: true,
  storageProvider: true,
  totalDurationMs: true,
  totalChapters: true,
  readyAt: true,
  errorMessage: true,
  manifestObjectKey: true,
  createdAt: true,
  updatedAt: true,
  voice: {
    select: {
      id: true,
      name: true,
      slug: true,
      provider: true,
      language: true,
    },
  },
  chapters: {
    orderBy: { chapterIndex: "asc" as const },
    select: {
      id: true,
      chapterIndex: true,
      title: true,
      spineHref: true,
      status: true,
      durationMs: true,
    },
  },
} as const;

function isAdminSession(session: Session | null) {
  return Boolean(session?.user && "role" in session.user && session.user.role === "ADMIN");
}

function buildNarrationObjectKeys(bookId: string, narrationId: string, chapterIndex: number) {
  const storageConfig = getNarrationStorageConfig();
  const prefix = storageConfig?.narrationPrefix || "narration";
  const chapterKey = `${prefix}/${bookId}/${narrationId}/chapters/${String(chapterIndex).padStart(3, "0")}.wav`;
  const manifestKey = `${prefix}/${bookId}/${narrationId}/manifest.json`;

  return {
    chapterKey,
    manifestKey,
  };
}

async function uploadNarrationObject(objectKey: string, body: Buffer, contentType: string) {
  const storageProvider = getNarrationStorageProvider();
  const storageConfig = getNarrationStorageConfig(storageProvider);

  if (!storageConfig) {
    throw new Error(
      `${getNarrationStorageProviderLabel(storageProvider)} narration storage is not configured.`
    );
  }

  await writeNarrationObject(objectKey, body, contentType, storageProvider);
}

function buildGenerationRequirements(input: {
  hasEpubFile: boolean;
  geminiConfigured: boolean;
  storageConfigured: boolean;
}) {
  const missingRequirements: string[] = [];

  if (!input.hasEpubFile) {
    missingRequirements.push("An EPUB upload is required before narration can be generated.");
  }

  if (!input.geminiConfigured) {
    missingRequirements.push("Gemini TTS is not configured. Add GEMINI_API_KEY or GOOGLE_API_KEY on the server.");
  }

  if (!input.storageConfigured) {
    missingRequirements.push("Narration object storage is not configured yet.");
  }

  return missingRequirements;
}

function formatNarrationForAdmin(
  narration: {
    id: string;
    status: string;
    active: boolean;
    storageProvider: string;
    totalDurationMs: number | null;
    totalChapters: number;
    readyAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    manifestObjectKey: string | null;
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
      status: string;
      durationMs: number | null;
    }>;
  }
) {
  const optionName = getGeminiVoiceOptionName(narration.voice.name) || narration.voice.name;

  return {
    id: narration.id,
    status: narration.status,
    active: narration.active,
    storageProvider: toNarrationObjectStorageProvider(
      narration.storageProvider as "S3" | "R2" | "B2" | "LOCAL"
    ),
    totalDurationMs: narration.totalDurationMs,
    totalChapters: narration.totalChapters,
    readyAt: narration.readyAt?.toISOString() || null,
    errorMessage: narration.errorMessage,
    manifestObjectKey: narration.manifestObjectKey,
    createdAt: narration.createdAt.toISOString(),
    updatedAt: narration.updatedAt.toISOString(),
    voice: {
      ...narration.voice,
      optionName,
      model: getGeminiModelFromProvider(narration.voice.provider),
    },
    chapters: narration.chapters.map((chapter) => ({
      id: chapter.id,
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      spineHref: chapter.spineHref,
      status: chapter.status,
      durationMs: chapter.durationMs,
    })),
  };
}

// ---------------------------------------------------------------------------
// Background job — runs detached from the HTTP request to avoid proxy timeouts
// ---------------------------------------------------------------------------
async function runNarrationJob(params: {
  book: { id: string; title: string; slug: string };
  draftNarration: { id: string };
  selectedChapters: Awaited<ReturnType<typeof extractEpubNarrationChapters>>;
  voiceName: string;
  voiceLabel: string;
  model: string;
  languageCode: string;
  stylePrompt: string | null | undefined;
  shouldActivateAsDefault: boolean;
  storageProvider: ReturnType<typeof getNarrationStorageProvider>;
  manifestKey: string;
}) {
  const {
    book, draftNarration, selectedChapters,
    voiceName, voiceLabel, model, languageCode, stylePrompt,
    shouldActivateAsDefault, storageProvider, manifestKey,
  } = params;

  try {
    // Clear chapters from any previous run so polling sees fresh incremental progress
    await prisma.narrationChapter.deleteMany({ where: { narrationId: draftNarration.id } });

    let generatedCount = 0;
    let totalDurationMs = 0;

    for (const chapter of selectedChapters) {
      const chunks = buildNarrationGenerationChunks(chapter.blocks);
      if (chunks.length === 0) continue;

      const chunkAudio: Awaited<ReturnType<typeof synthesizeGeminiSpeech>>[] = [];
      for (const chunk of chunks) {
        chunkAudio.push(
          await synthesizeGeminiSpeech({ transcript: chunk.transcript, voiceName, model, stylePrompt, languageCode })
        );
      }

      const mergedAudio = mergeGeminiPcmAudio(chunkAudio);
      const { chapterKey } = buildNarrationObjectKeys(book.id, draftNarration.id, chapter.chapterIndex);
      await uploadNarrationObject(chapterKey, mergedAudio.wavBuffer, mergedAudio.audioMimeType);

      const cues = buildNarrationCueTimelineFromBlocks(chapter.blocks, mergedAudio.durationMs);

      // Write chapter record immediately — visible on next poll refresh
      await prisma.narrationChapter.create({
        data: {
          narrationId: draftNarration.id,
          chapterIndex: chapter.chapterIndex,
          title: chapter.title,
          spineHref: chapter.spineHref,
          status: "READY",
          audioObjectKey: chapterKey,
          audioMimeType: mergedAudio.audioMimeType,
          durationMs: mergedAudio.durationMs,
          cues: {
            create: cues.map((cue) => ({
              sequence: cue.sequence,
              startMs: cue.startMs,
              endMs: cue.endMs,
              targetHref: cue.targetHref,
              targetElementId: cue.targetElementId,
              targetCfi: cue.targetCfi,
              excerpt: cue.excerpt,
            })),
          },
        },
      });

      generatedCount += 1;
      totalDurationMs += mergedAudio.durationMs;
    }

    if (generatedCount === 0) {
      throw new Error("Gemini generation did not produce any chapter audio.");
    }

    // Fetch persisted chapters to build the manifest
    const persistedNarration = await prisma.bookNarration.findUniqueOrThrow({
      where: { id: draftNarration.id },
      select: {
        id: true, totalDurationMs: true, manifestObjectKey: true, updatedAt: true,
        voice: { select: { id: true, name: true, slug: true, provider: true, language: true } },
        chapters: {
          orderBy: { chapterIndex: "asc" },
          select: {
            id: true, chapterIndex: true, title: true, spineHref: true,
            audioObjectKey: true, audioMimeType: true, durationMs: true,
            cues: {
              orderBy: { sequence: "asc" },
              select: { sequence: true, startMs: true, endMs: true, targetHref: true, targetElementId: true, targetCfi: true, excerpt: true },
            },
          },
        },
      },
    });

    const manifest = buildNarrationManifest(
      book.id,
      { id: persistedNarration.id, totalDurationMs, manifestObjectKey: manifestKey, updatedAt: persistedNarration.updatedAt, voice: persistedNarration.voice, chapters: persistedNarration.chapters },
      storageProvider
    );
    await uploadNarrationObject(manifestKey, Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), "application/json");

    await prisma.$transaction(async (tx) => {
      if (shouldActivateAsDefault) {
        await tx.bookNarration.updateMany({
          where: { bookId: book.id, NOT: { id: draftNarration.id } },
          data: { active: false },
        });
      }
      await tx.bookNarration.update({
        where: { id: draftNarration.id },
        data: {
          status: "READY",
          active: shouldActivateAsDefault,
          readyAt: new Date(),
          errorMessage: null,
          totalDurationMs,
          totalChapters: generatedCount,
          manifestObjectKey: manifestKey,
          audioMimeType: "audio/wav",
        },
      });
    });

    console.log(`[narration-job] Done: book=${book.id} narration=${draftNarration.id} voice=${voiceLabel} chapters=${generatedCount}`);
  } catch (jobError) {
    const errorMessage = jobError instanceof Error ? jobError.message : String(jobError);
    console.error("[narration-job] Failed:", { book: book.id, narration: draftNarration.id, error: errorMessage });
    await prisma.bookNarration.update({
      where: { id: draftNarration.id },
      data: { status: "FAILED", active: false, errorMessage },
    }).catch((dbErr) => console.error("[narration-job] Failed to write FAILED status:", dbErr));
  }
}

// ---------------------------------------------------------------------------

async function getBookNarrationSummary(bookId: string) {
  return prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      slug: true,
      donorOnly: true,
      status: true,
      coverUrl: true,
      epubFile: {
        select: {
          id: true,
          fileUrl: true,
          mimeType: true,
          createdAt: true,
        },
      },
      narrations: {
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        take: 50,
        select: adminNarrationSelect,
      },
    },
  });
}

async function getNarrationForAdmin(bookId: string, narrationId: string) {
  return prisma.bookNarration.findFirst({
    where: { id: narrationId, bookId },
    select: adminNarrationSelect,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const book = await getBookNarrationSummary(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const storageProvider = getNarrationStorageProvider();
  const storageConfigured = Boolean(getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();
  const missingRequirements = buildGenerationRequirements({
    hasEpubFile: Boolean(book.epubFile?.fileUrl),
    geminiConfigured,
    storageConfigured,
  });

  return NextResponse.json({
    book: {
      id: book.id,
      title: book.title,
      slug: book.slug,
      donorOnly: book.donorOnly,
      status: book.status,
      coverUrl: book.coverUrl,
      hasEpubFile: Boolean(book.epubFile?.fileUrl),
      epubFileUploadedAt: book.epubFile?.createdAt.toISOString() || null,
    },
    gemini: {
      configured: geminiConfigured,
      defaultModel: getDefaultGeminiTtsModel(),
      defaultVoiceName: getDefaultGeminiTtsVoice(),
      models: GEMINI_TTS_MODELS,
      voices: GEMINI_TTS_VOICES,
    },
    storage: {
      provider: storageProvider,
      providerLabel: getNarrationStorageProviderLabel(storageProvider),
      configured: storageConfigured,
    },
    generation: {
      canGenerate: missingRequirements.length === 0,
      missingRequirements,
    },
    narrations: book.narrations.map(formatNarrationForAdmin),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const storageProvider = getNarrationStorageProvider();
  const storageConfigured = Boolean(getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();

  try {
    const rawPayload = await req.json();
    const { action } = narrationActionSchema.parse(rawPayload);

    if (action === "sample") {
      const payload = sampleRequestSchema.parse(rawPayload);

      if (!geminiConfigured) {
        return NextResponse.json(
          { error: "Gemini TTS is not configured yet." },
          { status: 400 }
        );
      }

      const sampleAudio = await synthesizeGeminiSpeech({
        transcript: payload.sampleText,
        voiceName: payload.voiceName,
        model: payload.model,
        stylePrompt: payload.stylePrompt,
        languageCode: payload.languageCode,
      });
      const audioBase64 = sampleAudio.wavBuffer.toString("base64");

      return NextResponse.json({
        message: `Sample preview ready for ${getGeminiVoiceOptionName(payload.voiceName) || payload.voiceName}.`,
        voiceName: getGeminiVoiceOptionName(payload.voiceName) || payload.voiceName,
        model: payload.model?.trim() || getDefaultGeminiTtsModel(),
        durationMs: sampleAudio.durationMs,
        audioMimeType: sampleAudio.audioMimeType,
        audioBase64,
        audioDataUrl: `data:${sampleAudio.audioMimeType};base64,${audioBase64}`,
      });
    }

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        slug: true,
        epubFile: {
          select: {
            fileUrl: true,
          },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (action === "set-default") {
      const payload = setDefaultRequestSchema.parse(rawPayload);
      const narration = await getNarrationForAdmin(bookId, payload.narrationId);

      if (!narration) {
        return NextResponse.json({ error: "Narration not found for this book" }, { status: 404 });
      }

      const finalNarration = await prisma.$transaction(async (tx) => {
        await tx.bookNarration.updateMany({
          where: {
            bookId,
            NOT: { id: narration.id },
          },
          data: {
            active: false,
          },
        });

        await tx.bookNarration.update({
          where: { id: narration.id },
          data: {
            active: true,
          },
        });

        return tx.bookNarration.findUniqueOrThrow({
          where: { id: narration.id },
          select: adminNarrationSelect,
        });
      });

      return NextResponse.json({
        message: `${getGeminiVoiceOptionName(finalNarration.voice.name) || finalNarration.voice.name} is now the default narration voice for “${book.title}”.`,
        narration: formatNarrationForAdmin(finalNarration),
      });
    }

    const payload = generationRequestSchema.parse(rawPayload);
    const missingRequirements = buildGenerationRequirements({
      hasEpubFile: Boolean(book.epubFile?.fileUrl),
      geminiConfigured,
      storageConfigured,
    });

    if (missingRequirements.length > 0) {
      return NextResponse.json(
        {
          error: "Narration generation is not ready to run",
          missingRequirements,
        },
        { status: 400 }
      );
    }

    const resolvedBookFilePath = await resolveStoredBookFilePath(book.epubFile!.fileUrl);
    const extractedChapters = await extractEpubNarrationChapters(resolvedBookFilePath);
    const selectedChapters = payload.maxChapters
      ? extractedChapters.slice(0, payload.maxChapters)
      : extractedChapters;

    if (selectedChapters.length === 0) {
      return NextResponse.json(
        { error: "No readable chapters were found in this EPUB for narration." },
        { status: 400 }
      );
    }

    const model = payload.model?.trim() || getDefaultGeminiTtsModel();
    const languageCode = payload.languageCode?.trim() || "en";
    const voiceName = payload.voiceName.trim();
    const voiceLabel = getGeminiVoiceOptionName(voiceName) || voiceName;
    const voiceSlug = buildGeminiNarrationVoiceSlug({
      voiceName,
      model,
      languageCode,
    });
    const persistedStorageProvider = toPersistedNarrationStorageProvider(storageProvider);

    const [voice, currentActiveNarration] = await Promise.all([
      prisma.narrationVoice.upsert({
        where: { slug: voiceSlug },
        update: {
          name: voiceLabel,
          provider: buildGeminiVoiceProvider(model),
          language: languageCode,
          description: `Generated with ${model} using Gemini prebuilt voice ${voiceLabel}.`,
          sampleText: selectedChapters[0]?.transcript.slice(0, 400) || null,
        },
        create: {
          slug: voiceSlug,
          name: voiceLabel,
          provider: buildGeminiVoiceProvider(model),
          language: languageCode,
          description: `Generated with ${model} using Gemini prebuilt voice ${voiceLabel}.`,
          sampleText: selectedChapters[0]?.transcript.slice(0, 400) || null,
        },
      }),
      prisma.bookNarration.findFirst({
        where: {
          bookId: book.id,
          active: true,
          status: "READY",
        },
        select: { id: true },
      }),
    ]);

    const existingNarration = await prisma.bookNarration.findUnique({
      where: {
        bookId_voiceId: {
          bookId: book.id,
          voiceId: voice.id,
        },
      },
      select: { id: true },
    });

    const draftNarration = existingNarration
      ? await prisma.bookNarration.update({
          where: { id: existingNarration.id },
          data: {
            status: "PROCESSING",
            storageProvider: persistedStorageProvider,
            manifestObjectKey: null,
            audioMimeType: "audio/wav",
            totalDurationMs: null,
            totalChapters: selectedChapters.length,
            readyAt: null,
            errorMessage: null,
          },
        })
      : await prisma.bookNarration.create({
          data: {
            bookId: book.id,
            voiceId: voice.id,
            status: "PROCESSING",
            storageProvider: persistedStorageProvider,
            audioMimeType: "audio/wav",
            totalDurationMs: null,
            totalChapters: selectedChapters.length,
            active: false,
            errorMessage: null,
          },
        });

    const shouldActivateAsDefault = Boolean(
      payload.activateAsDefault
      || !currentActiveNarration
      || currentActiveNarration.id === draftNarration.id
    );

    const { manifestKey } = buildNarrationObjectKeys(book.id, draftNarration.id, 0);

    // Fire the pipeline as a detached background task — HTTP responds immediately.
    void runNarrationJob({
      book,
      draftNarration,
      selectedChapters,
      voiceName,
      voiceLabel,
      model,
      languageCode,
      stylePrompt: payload.stylePrompt,
      shouldActivateAsDefault,
      storageProvider,
      manifestKey,
    });

    return NextResponse.json(
      {
        message: `Narration generation has started for "${book.title}". The studio will update as chapters complete.`,
        narrationId: draftNarration.id,
        status: "PROCESSING",
      },
      { status: 202 }
    );

  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid narration studio request",
          issues: error.flatten(),
        },
        { status: 400 }
      );
    }

    console.error("Admin Gemini narration generation error:", error);

    return NextResponse.json(
      {
        error: "Failed to process the narration studio request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
