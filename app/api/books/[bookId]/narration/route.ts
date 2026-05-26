import { getDonorFeatureAccessState } from "@/lib/book-access";
import { authOptions } from "@/lib/auth";
import { ensureBookNarrationBackgroundProcessing } from "@/lib/book-narration-jobs";
import {
  buildNarrationManifest,
  createNarrationFeatureResponse,
  type NarrationFeatureVoiceOption,
  parseNarrationUpsertPayload,
  signNarrationManifestAssets,
  toNarrationObjectStorageProvider,
  toPersistedNarrationStorageProvider,
} from "@/lib/narration";
import {
  createPresignedNarrationObjectUrl,
  getNarrationStorageProvider,
  getNarrationStorageProviderLabel,
  isNarrationStorageConfigured,
} from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { bookId } = await params;
  const activeStorageProvider = getNarrationStorageProvider();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      status: true,
      donorOnly: true,
      donorAccessLevel: true,
      audiobook: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const bookHasLegacyAudiobook = Boolean(book.audiobook);

  const featureAccess = await getDonorFeatureAccessState(book, session?.user);

  if (!featureAccess.hasBookAccess) {
    return NextResponse.json(
      createNarrationFeatureResponse({
        available: false,
        reason: "book-access-required",
        message: featureAccess.isPublished
          ? featureAccess.requiresRecurringDonation
            ? 'This title is reserved for recurring supporters. Start or keep an active monthly donation before narrated mode can be checked for this account.'
            : 'Open the book first before narrated mode can be checked for this account.'
          : "Book not found.",
        storageProvider: activeStorageProvider,
        manifest: null,
        manifestUrl: null,
        bookHasLegacyAudiobook,
      }),
      { status: featureAccess.isPublished ? 403 : 404 }
    );
  }

  if (!featureAccess.hasAccess) {
    return NextResponse.json(
      createNarrationFeatureResponse({
        available: false,
        reason: featureAccess.isSignedIn ? "donor-required" : "sign-in-required",
        message: featureAccess.isSignedIn
          ? "Due to the cost of running narration, this feature is reserved for donors only. Make one completed donation to unlock it on your account."
          : "Due to the cost of running narration, this feature is reserved for donors only. Sign in to unlock it with your donation.",
        storageProvider: activeStorageProvider,
        manifest: null,
        manifestUrl: null,
        bookHasLegacyAudiobook,
      }),
      { status: 403 }
    );
  }

  try {
    const narrations = await prisma.bookNarration.findMany({
      where: { bookId: book.id },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        status: true,
        active: true,
        storageProvider: true,
        manifestObjectKey: true,
        totalDurationMs: true,
        updatedAt: true,
        errorMessage: true,
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

    const primaryNarration = narrations[0] ?? null;
    const primaryStorageProvider = primaryNarration
      ? toNarrationObjectStorageProvider(primaryNarration.storageProvider)
      : activeStorageProvider;

    if (narrations.some((narration) => narration.status === "PENDING" || narration.status === "PROCESSING")) {
      ensureBookNarrationBackgroundProcessing(book.id);
    }

    if (primaryNarration && !isNarrationStorageConfigured(primaryStorageProvider)) {
      return NextResponse.json(
        createNarrationFeatureResponse({
          available: false,
          reason: "storage-not-configured",
          message: `Donor narration access is wired up, but ${getNarrationStorageProviderLabel(primaryStorageProvider)} narration storage is not configured yet.`,
          storageProvider: primaryStorageProvider,
          manifest: null,
          manifestUrl: null,
          bookHasLegacyAudiobook,
        }),
        { status: 503 }
      );
    }

    if (narrations.length === 0) {
      return NextResponse.json(
        createNarrationFeatureResponse({
          available: false,
          reason: "not-generated",
          message: `Donor narration is enabled for “${book.title}”, but the narrated assets have not been generated yet.`,
          storageProvider: activeStorageProvider,
          manifest: null,
          manifestUrl: null,
          bookHasLegacyAudiobook,
        })
      );
    }

    const readyVoices = await Promise.all(
      narrations
        .filter((narration) => narration.status === "READY")
        .map(async (narration) => {
          const narrationStorageProvider = toNarrationObjectStorageProvider(narration.storageProvider);

          if (!isNarrationStorageConfigured(narrationStorageProvider)) {
            return null;
          }

          const readyChapters = narration.chapters.filter((chapter) => chapter.status === "READY");

          if (readyChapters.length === 0) {
            return null;
          }

          const manifest = buildNarrationManifest(book.id, {
            id: narration.id,
            totalDurationMs: narration.totalDurationMs,
            manifestObjectKey: narration.manifestObjectKey,
            updatedAt: narration.updatedAt,
            voice: narration.voice,
            chapters: readyChapters,
          }, narrationStorageProvider);

          const signedNarration = await signNarrationManifestAssets(
            manifest,
            (objectKey) => createPresignedNarrationObjectUrl(objectKey, narrationStorageProvider)
          );

          return {
            narrationId: narration.id,
            active: narration.active,
            totalDurationMs: narration.totalDurationMs,
            chapterCount: signedNarration.manifest.chapterCount,
            manifest: signedNarration.manifest,
            manifestUrl: signedNarration.manifestUrl,
            voice: signedNarration.manifest.voice,
          };
        })
    );

    const availableVoices = readyVoices.filter(
      (voice): voice is NarrationFeatureVoiceOption => Boolean(voice)
    );

    if (availableVoices.length > 0) {
      const defaultVoice = availableVoices.find((voice) => voice.active) ?? availableVoices[0];

      if (!defaultVoice) {
        throw new Error("No default narration voice could be resolved.");
      }

      return NextResponse.json(
        createNarrationFeatureResponse({
          available: true,
          reason: "ready",
          message: availableVoices.length > 1
            ? `Donor narration for “${book.title}” is ready in ${availableVoices.length} voices.`
            : `Donor narration for “${book.title}” is ready to stream.`,
          storageProvider: defaultVoice.manifest.storage.provider,
          defaultVoiceSlug: defaultVoice.voice.slug,
          voices: availableVoices,
          manifest: defaultVoice.manifest,
          manifestUrl: defaultVoice.manifestUrl,
          bookHasLegacyAudiobook,
        })
      );
    }

    const reason = primaryNarration.status === "FAILED"
      ? "failed"
      : primaryNarration.status === "PROCESSING" || primaryNarration.status === "PENDING"
        ? "processing"
        : primaryNarration.status === "ARCHIVED"
          ? "not-generated"
          : "catalog-unavailable";

    const message = primaryNarration.status === "FAILED"
      ? primaryNarration.errorMessage || `Narration generation for “${book.title}” failed and needs to be retried.`
      : primaryNarration.status === "PROCESSING"
        ? `Narration for “${book.title}” is currently being generated.`
        : primaryNarration.status === "PENDING"
          ? `Narration for “${book.title}” has been queued and will appear here once generation starts.`
          : primaryNarration.status === "ARCHIVED"
            ? `A previous narration version for “${book.title}” has been archived, and no active donor narration is published right now.`
            : `Narration metadata exists for “${book.title}”, but the ready manifest is not available yet.`;

    return NextResponse.json(
      createNarrationFeatureResponse({
        available: false,
        reason,
        message,
        storageProvider: primaryStorageProvider,
        manifest: null,
        manifestUrl: null,
        bookHasLegacyAudiobook,
      }),
      { status: primaryNarration.status === "FAILED" ? 503 : 200 }
    );
  } catch (error) {
    console.error("Narration lookup error:", error);

    return NextResponse.json(
      createNarrationFeatureResponse({
        available: false,
        reason: "catalog-unavailable",
        message: "Narration metadata is unavailable right now. If you just pulled this update, run the Prisma schema sync before checking donor narration again.",
        storageProvider: activeStorageProvider,
        manifest: null,
        manifestUrl: null,
        bookHasLegacyAudiobook,
      }),
      { status: 503 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);
  const activeStorageProvider = getNarrationStorageProvider();

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    const payload = parseNarrationUpsertPayload(await req.json());
    const persistedStorageProvider = payload.narration.storageProvider
      ?? toPersistedNarrationStorageProvider(activeStorageProvider);

    const result = await prisma.$transaction(async (tx) => {
      const voice = await tx.narrationVoice.upsert({
        where: { slug: payload.voice.slug },
        update: {
          name: payload.voice.name,
          provider: payload.voice.provider,
          language: payload.voice.language,
          description: payload.voice.description,
          sampleText: payload.voice.sampleText,
        },
        create: {
          slug: payload.voice.slug,
          name: payload.voice.name,
          provider: payload.voice.provider,
          language: payload.voice.language,
          description: payload.voice.description,
          sampleText: payload.voice.sampleText,
        },
      });

      if (payload.narration.active) {
        await tx.bookNarration.updateMany({
          where: {
            bookId,
            NOT: { voiceId: voice.id },
          },
          data: { active: false },
        });
      }

      const narration = await tx.bookNarration.upsert({
        where: {
          bookId_voiceId: {
            bookId,
            voiceId: voice.id,
          },
        },
        update: {
          status: payload.narration.status,
          storageProvider: persistedStorageProvider,
          manifestObjectKey: payload.narration.manifestObjectKey,
          audioMimeType: payload.narration.audioMimeType,
          totalDurationMs: payload.narration.totalDurationMs,
          totalChapters: payload.chapters.length,
          active: payload.narration.active,
          readyAt: payload.narration.readyAt,
          errorMessage: payload.narration.errorMessage,
        },
        create: {
          bookId,
          voiceId: voice.id,
          status: payload.narration.status,
          storageProvider: persistedStorageProvider,
          manifestObjectKey: payload.narration.manifestObjectKey,
          audioMimeType: payload.narration.audioMimeType,
          totalDurationMs: payload.narration.totalDurationMs,
          totalChapters: payload.chapters.length,
          active: payload.narration.active,
          readyAt: payload.narration.readyAt,
          errorMessage: payload.narration.errorMessage,
        },
      });

      if (payload.replaceExistingChapters) {
        await tx.narrationChapter.deleteMany({
          where: { narrationId: narration.id },
        });
      }

      if (payload.chapters.length > 0) {
        for (const chapter of payload.chapters) {
          await tx.narrationChapter.create({
            data: {
              narrationId: narration.id,
              chapterIndex: chapter.chapterIndex,
              title: chapter.title,
              spineHref: chapter.spineHref,
              status: chapter.status,
              audioObjectKey: chapter.audioObjectKey,
              audioMimeType: chapter.audioMimeType,
              durationMs: chapter.durationMs,
              cues: chapter.cues.length > 0
                ? {
                    create: chapter.cues.map((cue) => ({
                      sequence: cue.sequence,
                      startMs: cue.startMs,
                      endMs: cue.endMs,
                      targetHref: cue.targetHref,
                      targetElementId: cue.targetElementId,
                      targetCfi: cue.targetCfi,
                      excerpt: cue.excerpt,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      return tx.bookNarration.findUniqueOrThrow({
        where: { id: narration.id },
        select: {
          id: true,
          status: true,
          active: true,
          storageProvider: true,
          totalDurationMs: true,
          manifestObjectKey: true,
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
    });

    const resultStorageProvider = toNarrationObjectStorageProvider(result.storageProvider);

    const manifest = result.status === "READY"
      ? buildNarrationManifest(book.id, {
          id: result.id,
          totalDurationMs: result.totalDurationMs,
          manifestObjectKey: result.manifestObjectKey,
          updatedAt: result.updatedAt,
          voice: result.voice,
          chapters: result.chapters.filter((chapter) => chapter.status === "READY"),
        }, resultStorageProvider)
      : null;

    return NextResponse.json({
      message: `Narration metadata saved for “${book.title}”.`,
      narrationId: result.id,
      status: result.status,
      active: result.active,
      storageProvider: resultStorageProvider,
      voice: result.voice,
      chapterCount: result.chapters.length,
      manifest,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid narration payload",
          issues: error.flatten(),
        },
        { status: 400 }
      );
    }

    console.error("Narration upsert error:", error);

    return NextResponse.json(
      {
        error: "Failed to save narration metadata",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
