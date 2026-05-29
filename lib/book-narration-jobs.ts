import { randomUUID } from "crypto";
import { resolveStoredBookFilePath } from "@/lib/book-storage";
import {
  buildNarrationCueTimelineFromBlocks,
  buildNarrationGenerationChunks,
  extractEpubNarrationChapters,
  type NarrationSourceChapter,
} from "@/lib/epub-narration";
import {
  buildGeminiNarrationVoiceSlug,
  buildGeminiVoiceProvider,
  getDefaultGeminiTtsModel,
  getGeminiModelFromProvider,
  getGeminiVoiceOptionName,
  isGeminiTtsConfigured,
  mergeGeminiPcmAudio,
  synthesizeGeminiSpeech,
} from "@/lib/gemini-tts";
import {
  buildNarrationManifest,
  toPersistedNarrationStorageProvider,
} from "@/lib/narration";
import {
  getNarrationStorageConfig,
  getNarrationStorageProvider,
  getNarrationStorageProviderLabel,
  writeNarrationObject,
} from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";

const DEFAULT_BOOK_NARRATION_STYLE_PROMPT =
  "Warm, immersive single-speaker audiobook narration with stable pacing, clear diction, consistent emotional restraint, and natural paragraph pauses.";

type SelectedNarrationChapter = NarrationSourceChapter;

type QueueBookNarrationGenerationParams = {
  bookId: string;
  voiceName: string;
  model?: string | null;
  languageCode?: string | null;
  stylePrompt?: string | null;
  maxChapters?: number | null;
  chapterIndexes?: number[] | null;
  activateAsDefault?: boolean;
};

type ClaimedBookNarration = {
  id: string;
  bookId: string;
  book: {
    id: string;
    title: string;
    author: string;
    slug: string;
    epubFile: {
      fileUrl: string;
    } | null;
  };
  voice: {
    name: string;
    provider: string;
    language: string;
  };
  stylePrompt: string | null;
  storageProvider: "S3" | "R2" | "B2" | "LOCAL";
  active: boolean;
  jobKey: string | null;
};

type ClaimedNarrationChapter = {
  id: string;
  chapterIndex: number;
  title: string | null;
  spineHref: string;
};

const globalWorkerState = globalThis as typeof globalThis & {
  __omrBookNarrationActiveBooks?: Set<string>;
  __omrGlobalChapterMutex?: {
    promise: Promise<void>;
  };
};

const activeBookNarrationWorkers =
  globalWorkerState.__omrBookNarrationActiveBooks
  ?? (globalWorkerState.__omrBookNarrationActiveBooks = new Set<string>());

const globalChapterMutex =
  globalWorkerState.__omrGlobalChapterMutex
  ?? (globalWorkerState.__omrGlobalChapterMutex = { promise: Promise.resolve() });

async function runGloballySerialized<T>(fn: () => Promise<T>): Promise<T> {
  const currentPromise = globalChapterMutex.promise;
  let resolveMutex: () => void;
  const nextPromise = new Promise<void>((resolve) => {
    resolveMutex = resolve;
  });
  globalChapterMutex.promise = nextPromise;

  try {
    await currentPromise;
    return await fn();
  } finally {
    resolveMutex!();
  }
}

function buildNarrationObjectKeys(bookId: string, narrationId: string, chapterIndex: number) {
  const storageProvider = getNarrationStorageProvider();
  const storageConfig = getNarrationStorageConfig(storageProvider);
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

async function extractSelectedNarrationChapters(params: {
  bookFileUrl: string;
  maxChapters?: number | null;
  chapterIndexes?: number[] | null;
}) {
  const resolvedBookFilePath = await resolveStoredBookFilePath(params.bookFileUrl);
  const extractedChapters = await extractEpubNarrationChapters(resolvedBookFilePath);

  if (params.chapterIndexes && params.chapterIndexes.length > 0) {
    return extractedChapters.filter((chapter) => params.chapterIndexes!.includes(chapter.chapterIndex));
  }

  if (params.maxChapters) {
    return extractedChapters.slice(0, params.maxChapters);
  }

  return extractedChapters;
}

export function buildBookNarrationGenerationRequirements(input: {
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

function buildBookNarrationConsistencyPrompt(params: {
  bookTitle: string;
  bookAuthor: string;
  chapterTitle?: string | null;
  stylePrompt?: string | null;
  referenceExcerpt?: string | null;
}) {
  const promptParts = [
    params.stylePrompt?.trim() || DEFAULT_BOOK_NARRATION_STYLE_PROMPT,
    `Maintain the exact same narrator identity, pacing, pronunciation, tone, microphone distance, and emotional intensity across every chapter of “${params.bookTitle}” by ${params.bookAuthor}.`,
  ];

  if (params.chapterTitle) {
    promptParts.push(`Current chapter title: ${params.chapterTitle}.`);
  }

  if (params.referenceExcerpt?.trim()) {
    promptParts.push(
      `Reference excerpt for voice continuity only — do not read this unless it also appears in the current chapter transcript: ${params.referenceExcerpt.trim().slice(0, 900)}`
    );
  }

  return promptParts.join("\n\n");
}

async function claimNextNarrationForBook(bookId: string): Promise<ClaimedBookNarration | null> {
  return prisma.$transaction(async (tx) => {
    const nextNarration = await tx.bookNarration.findFirst({
      where: {
        bookId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      orderBy: [{ active: "desc" }, { updatedAt: "asc" }],
      select: {
        id: true,
      },
    });

    if (!nextNarration) {
      return null;
    }

    return tx.bookNarration.update({
      where: { id: nextNarration.id },
      data: {
        status: "PROCESSING",
        errorMessage: null,
      },
      select: {
        id: true,
        bookId: true,
        stylePrompt: true,
        storageProvider: true,
        active: true,
        jobKey: true,
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            slug: true,
            epubFile: {
              select: {
                fileUrl: true,
              },
            },
          },
        },
        voice: {
          select: {
            name: true,
            provider: true,
            language: true,
          },
        },
      },
    });
  });
}

async function claimNextChapterForNarration(params: {
  narrationId: string;
  jobKey: string;
}): Promise<ClaimedNarrationChapter | null> {
  const { narrationId, jobKey } = params;

  return prisma.$transaction(async (tx) => {
    const narration = await tx.bookNarration.findUnique({
      where: { id: narrationId },
      select: {
        id: true,
        jobKey: true,
      },
    });

    if (!narration || narration.jobKey !== jobKey) {
      return null;
    }

    const chapter = await tx.narrationChapter.findFirst({
      where: {
        narrationId,
        status: "PENDING",
      },
      orderBy: { chapterIndex: "asc" },
      select: {
        id: true,
        chapterIndex: true,
        title: true,
        spineHref: true,
      },
    });

    if (!chapter) {
      return null;
    }

    await tx.narrationChapter.update({
      where: { id: chapter.id },
      data: {
        status: "PROCESSING",
        audioObjectKey: null,
        audioMimeType: "audio/wav",
        durationMs: null,
      },
    });

    return chapter;
  });
}

async function markNarrationChapterFailed(params: {
  narrationId: string;
  chapterId: string;
  chapterIndex: number;
  errorMessage: string;
  jobKey: string;
}) {
  const { narrationId, chapterId, chapterIndex, errorMessage, jobKey } = params;

  const narration = await prisma.bookNarration.findUnique({
    where: { id: narrationId },
    select: { jobKey: true },
  });

  if (!narration || narration.jobKey !== jobKey) {
    return;
  }

  await prisma.narrationChapter.update({
    where: { id: chapterId },
    data: {
      status: "FAILED",
      audioObjectKey: null,
      durationMs: null,
    },
  });

  await prisma.bookNarration.update({
    where: { id: narrationId },
    data: {
      errorMessage: `Chapter ${chapterIndex + 1} failed: ${errorMessage}`,
    },
  });
}

async function finalizeNarration(params: {
  narrationId: string;
  bookId: string;
  jobKey: string;
}) {
  const { narrationId, bookId, jobKey } = params;

  const narration = await prisma.bookNarration.findUnique({
    where: { id: narrationId },
    select: {
      id: true,
      bookId: true,
      jobKey: true,
      active: true,
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
        orderBy: { chapterIndex: "asc" },
        select: {
          id: true,
          chapterIndex: true,
          title: true,
          spineHref: true,
          status: true,
          audioObjectKey: true,
          audioMimeType: true,
          durationMs: true,
          cues: {
            orderBy: { sequence: "asc" },
            select: {
              sequence: true,
              startMs: true,
              endMs: true,
              targetHref: true,
              targetElementId: true,
              targetCfi: true,
              excerpt: true,
            },
          },
        },
      },
    },
  });

  if (!narration || narration.jobKey !== jobKey) {
    return;
  }

  const readyChapters = narration.chapters.filter((chapter) => chapter.status === "READY");
  const failedChapters = narration.chapters.filter((chapter) => chapter.status === "FAILED");
  const pendingChapters = narration.chapters.filter(
    (chapter) => chapter.status === "PENDING" || chapter.status === "PROCESSING"
  );

  if (pendingChapters.length > 0) {
    return;
  }

  const totalDurationMs = readyChapters.reduce((sum, chapter) => sum + (chapter.durationMs || 0), 0);
  const totalChapters = narration.chapters.length;

  if (readyChapters.length === 0 || failedChapters.length > 0) {
    await prisma.bookNarration.update({
      where: { id: narration.id },
      data: {
        status: "FAILED",
        totalDurationMs,
        totalChapters,
        readyAt: null,
        errorMessage: failedChapters.length > 0
          ? `${failedChapters.length} chapter job${failedChapters.length === 1 ? " has" : "s have"} failed. Retry the failed chapters from the studio.`
          : "Narration generation did not produce any chapter audio.",
      },
    });
    return;
  }

  const { manifestKey } = buildNarrationObjectKeys(bookId, narration.id, 0);
  const storageProvider = getNarrationStorageProvider();
  const manifest = buildNarrationManifest(
    bookId,
    {
      id: narration.id,
      totalDurationMs,
      manifestObjectKey: manifestKey,
      updatedAt: narration.updatedAt,
      voice: narration.voice,
      chapters: readyChapters,
    },
    storageProvider
  );

  await uploadNarrationObject(
    manifestKey,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json"
  );

  await prisma.$transaction(async (tx) => {
    const latestNarration = await tx.bookNarration.findUnique({
      where: { id: narration.id },
      select: { jobKey: true, active: true },
    });

    if (!latestNarration || latestNarration.jobKey !== jobKey) {
      return;
    }

    if (latestNarration.active) {
      await tx.bookNarration.updateMany({
        where: { bookId, NOT: { id: narration.id } },
        data: { active: false },
      });
    }

    await tx.bookNarration.update({
      where: { id: narration.id },
      data: {
        status: "READY",
        totalDurationMs,
        totalChapters,
        manifestObjectKey: manifestKey,
        audioMimeType: "audio/wav",
        readyAt: new Date(),
        errorMessage: null,
      },
    });
  });
}

async function processNarration(params: {
  narration: ClaimedBookNarration;
}) {
  const { narration } = params;

  if (!narration.book.epubFile?.fileUrl || !narration.jobKey) {
    await prisma.bookNarration.update({
      where: { id: narration.id },
      data: {
        status: "FAILED",
        errorMessage: "An EPUB upload is required before narration can be generated.",
      },
    });
    return;
  }

  const resolvedBookFilePath = await resolveStoredBookFilePath(narration.book.epubFile.fileUrl);
  const extractedChapters = await extractEpubNarrationChapters(resolvedBookFilePath);
  const chaptersByIndex = new Map<number, NarrationSourceChapter>(
    extractedChapters.map((chapter) => [chapter.chapterIndex, chapter])
  );
  const referenceExcerpt = extractedChapters[0]?.transcript.slice(0, 900) || null;
  const model = getGeminiModelFromProvider(narration.voice.provider) || getDefaultGeminiTtsModel();
  const voiceName = narration.voice.name;
  const stylePrompt = narration.stylePrompt?.trim() || null;

  await prisma.narrationChapter.updateMany({
    where: {
      narrationId: narration.id,
      status: "PROCESSING",
    },
    data: {
      status: "PENDING",
    },
  });

  while (true) {
    const claimedChapter = await claimNextChapterForNarration({
      narrationId: narration.id,
      jobKey: narration.jobKey,
    });

    if (!claimedChapter) {
      break;
    }

    const sourceChapter = chaptersByIndex.get(claimedChapter.chapterIndex)
      || extractedChapters.find((chapter) => chapter.spineHref === claimedChapter.spineHref)
      || null;

    if (!sourceChapter) {
      await markNarrationChapterFailed({
        narrationId: narration.id,
        chapterId: claimedChapter.id,
        chapterIndex: claimedChapter.chapterIndex,
        errorMessage: "The EPUB chapter could not be found for this narration job.",
        jobKey: narration.jobKey,
      });
      continue;
    }

    try {
      const { mergedAudio, chapterKey } = await runGloballySerialized(async () => {
        const consistencyPrompt = buildBookNarrationConsistencyPrompt({
          bookTitle: narration.book.title,
          bookAuthor: narration.book.author,
          chapterTitle: sourceChapter.title,
          stylePrompt,
          referenceExcerpt,
        });
        const chunks = buildNarrationGenerationChunks(sourceChapter.blocks);

        if (chunks.length === 0) {
          throw new Error("No readable blocks were found for this chapter.");
        }

        const chunkAudio = [] as Awaited<ReturnType<typeof synthesizeGeminiSpeech>>[];

        for (const chunk of chunks) {
          chunkAudio.push(
            await synthesizeGeminiSpeech({
              transcript: chunk.transcript,
              voiceName,
              model,
              stylePrompt: consistencyPrompt,
              languageCode: narration.voice.language,
            })
          );
        }

        const merged = mergeGeminiPcmAudio(chunkAudio);
        const { chapterKey: key } = buildNarrationObjectKeys(
          narration.bookId,
          narration.id,
          claimedChapter.chapterIndex
        );
        await uploadNarrationObject(key, merged.wavBuffer, merged.audioMimeType);

        return {
          mergedAudio: merged,
          chapterKey: key,
        };
      });

      const latestNarration = await prisma.bookNarration.findUnique({
        where: { id: narration.id },
        select: { jobKey: true },
      });

      if (!latestNarration || latestNarration.jobKey !== narration.jobKey) {
        return;
      }

      const cues = buildNarrationCueTimelineFromBlocks(sourceChapter.blocks, mergedAudio.durationMs);

      await prisma.$transaction(async (tx) => {
        await tx.narrationCue.deleteMany({
          where: { chapterId: claimedChapter.id },
        });

        await tx.narrationChapter.update({
          where: { id: claimedChapter.id },
          data: {
            title: sourceChapter.title,
            spineHref: sourceChapter.spineHref,
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
      });
    } catch (chapterError) {
      const errorMessage = chapterError instanceof Error ? chapterError.message : String(chapterError);
      console.error("[book-narration-chapter] Failed:", {
        narration: narration.id,
        chapter: claimedChapter.chapterIndex,
        error: errorMessage,
      });

      await markNarrationChapterFailed({
        narrationId: narration.id,
        chapterId: claimedChapter.id,
        chapterIndex: claimedChapter.chapterIndex,
        errorMessage,
        jobKey: narration.jobKey,
      });
    }
  }

  await finalizeNarration({
    narrationId: narration.id,
    bookId: narration.bookId,
    jobKey: narration.jobKey,
  });
}

async function runBookNarrationWorker(bookId: string) {
  while (true) {
    const narration = await claimNextNarrationForBook(bookId);

    if (!narration) {
      break;
    }

    try {
      await processNarration({ narration });
    } catch (workerError) {
      const errorMessage = workerError instanceof Error ? workerError.message : String(workerError);
      console.error("[book-narration-worker] Failed:", { bookId, narrationId: narration.id, error: errorMessage });
      await prisma.bookNarration.updateMany({
        where: {
          id: narration.id,
          jobKey: narration.jobKey,
        },
        data: {
          status: "FAILED",
          errorMessage,
        },
      }).catch((dbError) => {
        console.error("[book-narration-worker] Failed to write FAILED status:", dbError);
      });
    }
  }
}

export function ensureBookNarrationBackgroundProcessing(bookId: string) {
  if (activeBookNarrationWorkers.has(bookId)) {
    return;
  }

  activeBookNarrationWorkers.add(bookId);

  queueMicrotask(async () => {
    try {
      await runBookNarrationWorker(bookId);
    } finally {
      activeBookNarrationWorkers.delete(bookId);

      const hasRemainingQueuedNarrations = await prisma.bookNarration.findFirst({
        where: {
          bookId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        select: { id: true },
      }).catch(() => null);

      if (hasRemainingQueuedNarrations) {
        ensureBookNarrationBackgroundProcessing(bookId);
      }
    }
  });
}

export async function queueBookNarrationGeneration(
  params: QueueBookNarrationGenerationParams
) {
  const storageProvider = getNarrationStorageProvider();
  const storageConfigured = Boolean(getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();

  const book = await prisma.book.findUnique({
    where: { id: params.bookId },
    select: {
      id: true,
      title: true,
      author: true,
      slug: true,
      epubFile: {
        select: {
          fileUrl: true,
        },
      },
    },
  });

  if (!book) {
    throw new Error("Book not found");
  }

  const missingRequirements = buildBookNarrationGenerationRequirements({
    hasEpubFile: Boolean(book.epubFile?.fileUrl),
    geminiConfigured,
    storageConfigured,
  });

  if (missingRequirements.length > 0) {
    throw new Error(missingRequirements.join(" "));
  }

  const selectedChapters = await extractSelectedNarrationChapters({
    bookFileUrl: book.epubFile!.fileUrl,
    maxChapters: params.maxChapters,
    chapterIndexes: params.chapterIndexes,
  });

  if (selectedChapters.length === 0) {
    throw new Error("No readable chapters were found in this EPUB for narration.");
  }

  const model = params.model?.trim() || getDefaultGeminiTtsModel();
  const languageCode = params.languageCode?.trim() || "en";
  const voiceName = params.voiceName.trim();
  const voiceLabel = getGeminiVoiceOptionName(voiceName) || voiceName;
  const voiceSlug = buildGeminiNarrationVoiceSlug({
    voiceName,
    model,
    languageCode,
  });
  const persistedStorageProvider = toPersistedNarrationStorageProvider(storageProvider);
  const stylePrompt = params.stylePrompt?.trim() ? params.stylePrompt.trim() : null;
  const jobKey = randomUUID();

  const voice = await prisma.narrationVoice.upsert({
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
  });

  const existingNarration = await prisma.bookNarration.findUnique({
    where: {
      bookId_voiceId: {
        bookId: book.id,
        voiceId: voice.id,
      },
    },
    select: {
      id: true,
      active: true,
    },
  });

  const selectedChapterIndexes = selectedChapters.map((chapter) => chapter.chapterIndex);

  const draftNarration = existingNarration
    ? await prisma.$transaction(async (tx) => {
        await tx.narrationChapter.deleteMany({
          where: {
            narrationId: existingNarration.id,
            chapterIndex: { in: selectedChapterIndexes },
          },
        });

        if (params.activateAsDefault || existingNarration.active) {
          await tx.bookNarration.updateMany({
            where: { bookId: book.id, NOT: { id: existingNarration.id } },
            data: { active: false },
          });
        }

        const untouchedChapterCount = await tx.narrationChapter.count({
          where: {
            narrationId: existingNarration.id,
          },
        });

        const updatedNarration = await tx.bookNarration.update({
          where: { id: existingNarration.id },
          data: {
            status: "PENDING",
            storageProvider: persistedStorageProvider,
            stylePrompt,
            jobKey,
            readyAt: null,
            errorMessage: null,
            active: params.activateAsDefault || existingNarration.active,
            totalChapters: untouchedChapterCount + selectedChapters.length,
          },
        });

        await tx.narrationChapter.createMany({
          data: selectedChapters.map((chapter) => ({
            narrationId: existingNarration.id,
            chapterIndex: chapter.chapterIndex,
            title: chapter.title,
            spineHref: chapter.spineHref,
            status: "PENDING",
            audioMimeType: "audio/wav",
          })),
        });

        return updatedNarration;
      })
    : await prisma.$transaction(async (tx) => {
        if (params.activateAsDefault) {
          await tx.bookNarration.updateMany({
            where: { bookId: book.id },
            data: { active: false },
          });
        }

        const createdNarration = await tx.bookNarration.create({
          data: {
            bookId: book.id,
            voiceId: voice.id,
            status: "PENDING",
            storageProvider: persistedStorageProvider,
            stylePrompt,
            jobKey,
            audioMimeType: "audio/wav",
            totalDurationMs: null,
            totalChapters: selectedChapters.length,
            active: Boolean(params.activateAsDefault),
            errorMessage: null,
          },
        });

        await tx.narrationChapter.createMany({
          data: selectedChapters.map((chapter) => ({
            narrationId: createdNarration.id,
            chapterIndex: chapter.chapterIndex,
            title: chapter.title,
            spineHref: chapter.spineHref,
            status: "PENDING",
            audioMimeType: "audio/wav",
          })),
        });

        return createdNarration;
      });

  ensureBookNarrationBackgroundProcessing(book.id);

  return {
    narrationId: draftNarration.id,
    status: draftNarration.status,
    queuedChapterCount: selectedChapters.length,
  };
}

export async function retryFailedNarrationChapters(params: {
  bookId: string;
  narrationId: string;
}) {
  const { bookId, narrationId } = params;

  const narration = await prisma.bookNarration.findFirst({
    where: { id: narrationId, bookId },
    include: {
      chapters: {
        where: { status: "FAILED" },
      },
    },
  });

  if (!narration) {
    throw new Error("Narration not found");
  }

  if (narration.status !== "FAILED") {
    throw new Error("Only failed narrations can be retried.");
  }

  const failedChapters = narration.chapters;
  if (failedChapters.length === 0) {
    throw new Error("No failed chapters found to retry.");
  }

  const jobKey = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.narrationChapter.updateMany({
      where: {
        narrationId: narration.id,
        status: "FAILED",
      },
      data: {
        status: "PENDING",
      },
    });

    await tx.bookNarration.update({
      where: { id: narration.id },
      data: {
        status: "PENDING",
        jobKey,
        readyAt: null,
        errorMessage: null,
      },
    });
  });

  ensureBookNarrationBackgroundProcessing(bookId);

  return {
    narrationId: narration.id,
    retriedChapterCount: failedChapters.length,
  };
}

