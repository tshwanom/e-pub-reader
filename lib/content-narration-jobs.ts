import { buildNarrationGenerationChunks } from "@/lib/epub-narration";
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
  buildContentNarrationBlocks,
  getContentNarrationTranscript,
  hasNarratableContent,
} from "@/lib/content";
import {
  buildContentNarrationSourceHash,
  getContentNarrationSourceHash,
} from "@/lib/content-narration-sync";
import { toPersistedNarrationStorageProvider } from "@/lib/narration";
import {
  getNarrationStorageConfig,
  getNarrationStorageProvider,
  getNarrationStorageProviderLabel,
  writeNarrationObject,
} from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";

function buildContentNarrationObjectKey(contentId: string, narrationId: string) {
  const storageProvider = getNarrationStorageProvider();
  const storageConfig = getNarrationStorageConfig(storageProvider);
  const prefix = storageConfig?.narrationPrefix || "narration";
  return `${prefix}/content/${contentId}/${narrationId}/audio.wav`;
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

export function buildContentNarrationGenerationRequirements(input: {
  hasText: boolean;
  geminiConfigured: boolean;
  storageConfigured: boolean;
}) {
  const missingRequirements: string[] = [];

  if (!input.hasText) {
    missingRequirements.push("Add narratable title, summary, or body content before generating audio.");
  }

  if (!input.geminiConfigured) {
    missingRequirements.push("Gemini TTS is not configured. Add GEMINI_API_KEY or GOOGLE_API_KEY on the server.");
  }

  if (!input.storageConfigured) {
    missingRequirements.push("Narration object storage is not configured yet.");
  }

  return missingRequirements;
}

type GenerationContent = {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  author: string | null;
  type: string;
  narrationSourceHash: string | null;
};

async function runContentNarrationJob(params: {
  content: GenerationContent;
  draftNarration: { id: string };
  voiceName: string;
  voiceLabel: string;
  model: string;
  languageCode: string;
  stylePrompt: string | null;
  shouldActivateAsDefault: boolean;
  audioObjectKey: string;
  sourceHash: string;
  ensureNarrationEnabled: boolean;
}) {
  const {
    content,
    draftNarration,
    voiceName,
    voiceLabel,
    model,
    languageCode,
    stylePrompt,
    shouldActivateAsDefault,
    audioObjectKey,
    sourceHash,
    ensureNarrationEnabled,
  } = params;

  try {
    const blocks = buildContentNarrationBlocks(content);
    const chunks = buildNarrationGenerationChunks(blocks, {
      maxCharacters: 3600,
      maxWords: 720,
    });

    if (chunks.length === 0) {
      throw new Error("No narratable text was found for this content item.");
    }

    const audioSegments = [];

    for (const chunk of chunks) {
      audioSegments.push(
        await synthesizeGeminiSpeech({
          transcript: chunk.transcript,
          voiceName,
          model,
          stylePrompt,
          languageCode,
        })
      );
    }

    const mergedAudio = mergeGeminiPcmAudio(audioSegments);
    await uploadNarrationObject(audioObjectKey, mergedAudio.wavBuffer, mergedAudio.audioMimeType);

    await prisma.$transaction(async (tx) => {
      const latestContent = await tx.supplementaryContent.findUnique({
        where: { id: content.id },
        select: {
          id: true,
          title: true,
          summary: true,
          content: true,
          author: true,
          type: true,
          narrationSourceHash: true,
        },
      });
      const latestNarration = await tx.contentNarration.findUnique({
        where: { id: draftNarration.id },
        select: {
          id: true,
          sourceHash: true,
          status: true,
        },
      });

      if (!latestContent || !latestNarration) {
        return;
      }

      const latestSourceHash = getContentNarrationSourceHash(latestContent);

      if (
        latestSourceHash !== sourceHash
        || latestNarration.sourceHash !== sourceHash
        || latestNarration.status !== "PROCESSING"
      ) {
        console.warn(
          `[content-narration-job] Skipped stale completion: content=${content.id} narration=${draftNarration.id} voice=${voiceLabel}`
        );
        return;
      }

      if (shouldActivateAsDefault) {
        await tx.contentNarration.updateMany({
          where: { contentId: content.id, NOT: { id: draftNarration.id } },
          data: { active: false },
        });
      }

      await tx.contentNarration.update({
        where: { id: draftNarration.id },
        data: {
          status: "READY",
          ...(shouldActivateAsDefault ? { active: true } : {}),
          storageProvider: toPersistedNarrationStorageProvider(getNarrationStorageProvider()),
          sourceHash,
          stylePrompt,
          audioObjectKey,
          audioMimeType: mergedAudio.audioMimeType,
          durationMs: mergedAudio.durationMs,
          readyAt: new Date(),
          errorMessage: null,
        },
      });

      if (ensureNarrationEnabled) {
        await tx.supplementaryContent.update({
          where: { id: content.id },
          data: {
            narrationEnabled: true,
            narrationSourceHash: sourceHash,
          },
        });
      }
    });

    console.log(`[content-narration-job] Done: content=${content.id} narration=${draftNarration.id} voice=${voiceLabel}`);
  } catch (jobError) {
    const errorMessage = jobError instanceof Error ? jobError.message : String(jobError);
    console.error("[content-narration-job] Failed:", { content: content.id, narration: draftNarration.id, error: errorMessage });

    await prisma.contentNarration.updateMany({
      where: {
        id: draftNarration.id,
        status: "PROCESSING",
        sourceHash,
      },
      data: { status: "FAILED", active: false, errorMessage },
    }).catch((dbErr) => console.error("[content-narration-job] Failed to write FAILED status:", dbErr));
  }
}

export async function backfillContentNarrationSourceHashes(contentId: string, sourceHash: string) {
  await prisma.$transaction([
    prisma.supplementaryContent.update({
      where: { id: contentId },
      data: { narrationSourceHash: sourceHash },
    }),
    prisma.contentNarration.updateMany({
      where: { contentId, sourceHash: null },
      data: { sourceHash },
    }),
  ]);
}

export async function queueContentNarrationGeneration(params: {
  contentId: string;
  voiceName: string;
  model?: string | null;
  languageCode?: string | null;
  stylePrompt?: string | null;
  activateAsDefault?: boolean;
  ensureNarrationEnabled?: boolean;
}) {
  const storageProvider = getNarrationStorageProvider();
  const storageConfigured = Boolean(getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();

  const content = await prisma.supplementaryContent.findUnique({
    where: { id: params.contentId },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      author: true,
      type: true,
      narrationSourceHash: true,
    },
  });

  if (!content) {
    throw new Error("Content not found");
  }

  const sourceHash = buildContentNarrationSourceHash(content);
  const missingRequirements = buildContentNarrationGenerationRequirements({
    hasText: hasNarratableContent(content),
    geminiConfigured,
    storageConfigured,
  });

  if (missingRequirements.length > 0) {
    throw new Error(missingRequirements.join(" "));
  }

  if (!content.narrationSourceHash) {
    await backfillContentNarrationSourceHashes(content.id, sourceHash);
  }

  const model = params.model?.trim() || getDefaultGeminiTtsModel();
  const languageCode = params.languageCode?.trim() || "en";
  const voiceName = params.voiceName.trim();
  const voiceLabel = getGeminiVoiceOptionName(voiceName) || voiceName;
  const voiceSlug = buildGeminiNarrationVoiceSlug({ voiceName, model, languageCode });
  const persistedStorageProvider = toPersistedNarrationStorageProvider(storageProvider);
  const stylePrompt = params.stylePrompt?.trim() ? params.stylePrompt.trim() : null;

  const [voice, currentActiveNarration] = await Promise.all([
    prisma.narrationVoice.upsert({
      where: { slug: voiceSlug },
      update: {
        name: voiceLabel,
        provider: buildGeminiVoiceProvider(model),
        language: languageCode,
        description: `Generated with ${model} using Gemini prebuilt voice ${voiceLabel}.`,
        sampleText: getContentNarrationTranscript(content).slice(0, 400) || null,
      },
      create: {
        slug: voiceSlug,
        name: voiceLabel,
        provider: buildGeminiVoiceProvider(model),
        language: languageCode,
        description: `Generated with ${model} using Gemini prebuilt voice ${voiceLabel}.`,
        sampleText: getContentNarrationTranscript(content).slice(0, 400) || null,
      },
    }),
    prisma.contentNarration.findFirst({
      where: { contentId: content.id, active: true, status: "READY" },
      select: { id: true },
    }),
  ]);

  const existingNarration = await prisma.contentNarration.findUnique({
    where: {
      contentId_voiceId: {
        contentId: content.id,
        voiceId: voice.id,
      },
    },
    select: { id: true },
  });

  const draftNarration = existingNarration
    ? await prisma.contentNarration.update({
        where: { id: existingNarration.id },
        data: {
          status: "PROCESSING",
          storageProvider: persistedStorageProvider,
          audioMimeType: "audio/wav",
          durationMs: null,
          readyAt: null,
          errorMessage: null,
          sourceHash,
          stylePrompt,
        },
      })
    : await prisma.contentNarration.create({
        data: {
          contentId: content.id,
          voiceId: voice.id,
          status: "PROCESSING",
          storageProvider: persistedStorageProvider,
          audioMimeType: "audio/wav",
          active: false,
          errorMessage: null,
          sourceHash,
          stylePrompt,
        },
      });

  const shouldActivateAsDefault = Boolean(
    params.activateAsDefault || !currentActiveNarration || currentActiveNarration.id === draftNarration.id
  );
  const audioObjectKey = buildContentNarrationObjectKey(content.id, draftNarration.id);

  void runContentNarrationJob({
    content: {
      ...content,
      narrationSourceHash: sourceHash,
    },
    draftNarration,
    voiceName,
    voiceLabel,
    model,
    languageCode,
    stylePrompt,
    shouldActivateAsDefault,
    audioObjectKey,
    sourceHash,
    ensureNarrationEnabled: Boolean(params.ensureNarrationEnabled),
  });

  return {
    narrationId: draftNarration.id,
    status: draftNarration.status,
    sourceHash,
    shouldActivateAsDefault,
  };
}

export async function scheduleContentNarrationAutoSync(contentId: string) {
  const content = await prisma.supplementaryContent.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      narrations: {
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          status: true,
          active: true,
          stylePrompt: true,
          voice: {
            select: {
              name: true,
              provider: true,
              language: true,
            },
          },
        },
      },
    },
  });

  if (!content) {
    return { queued: 0 };
  }

  const candidates = content.narrations.filter(
    (narration) =>
      narration.active
      || narration.status === "READY"
      || narration.status === "PROCESSING"
      || narration.status === "PENDING"
  );

  const results = await Promise.allSettled(
    candidates.map((narration) =>
      queueContentNarrationGeneration({
        contentId: content.id,
        voiceName: narration.voice.name,
        model: getGeminiModelFromProvider(narration.voice.provider),
        languageCode: narration.voice.language,
        stylePrompt: narration.stylePrompt,
        activateAsDefault: narration.active,
        ensureNarrationEnabled: false,
      })
    )
  );

  const queued = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.filter((result) => result.status === "rejected").length;

  if (failed > 0) {
    console.error(
      `[content-narration-sync] Failed to queue ${failed} voice sync job(s) for content=${content.id}`,
      results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason)
    );
  }

  return { queued, failed };
}
