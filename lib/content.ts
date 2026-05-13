import { Prisma } from "@prisma/client";

export const CONTENT_TYPES = ["ARTICLE", "VIDEO", "POEM", "QUOTE"] as const;
export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

const CONTENT_FEATURE_ERROR_CODES = new Set(["P2021", "P2022"]);
const CONTENT_FEATURE_ERROR_PATTERN = /(supplementary[_\s]?content|supplementarycontents|content[_\s]?narration|narration[_\s]?source[_\s]?hash)/i;

export const CONTENT_FEATURE_UNAVAILABLE_MESSAGE = "Platform content is temporarily unavailable until the latest database migrations are applied.";

export type ContentTypeValue = (typeof CONTENT_TYPES)[number];
export type ContentStatusValue = (typeof CONTENT_STATUSES)[number];

export type ContentNarrationSource = {
  id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  author?: string | null;
  type: ContentTypeValue | string;
};

export type ContentNarrationTranscriptSource = Pick<
  ContentNarrationSource,
  "title" | "summary" | "content" | "author" | "type"
>;

export function isContentFeatureUnavailableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return CONTENT_FEATURE_ERROR_CODES.has(error.code) && CONTENT_FEATURE_ERROR_PATTERN.test(error.message);
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientValidationError) {
    return CONTENT_FEATURE_ERROR_PATTERN.test(error.message);
  }

  return error instanceof Error ? CONTENT_FEATURE_ERROR_PATTERN.test(error.message) : false;
}

export async function withContentFeatureFallback<T>(operation: () => Promise<T>, fallback: T, context: string) {
  try {
    return await operation();
  } catch (error) {
    if (isContentFeatureUnavailableError(error)) {
      console.warn(
        `[content-feature] ${context} is unavailable. Falling back to a safe default until database migrations are applied.`,
        error
      );
      return fallback;
    }

    throw error;
  }
}

export function slugifyContentTitle(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);
}

export function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") {
    return value == null ? null : String(value);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(value: string) {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function splitContentIntoBlocks(text: string, targetHref: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const paragraphBlocks = normalized
    .split(/\n{2,}/)
    .map((paragraph) => normalizeText(paragraph))
    .filter((paragraph) => paragraph.length >= 2);

  const sourceBlocks = paragraphBlocks.length > 0 ? paragraphBlocks : [normalized];

  return sourceBlocks.map((block, index) => ({
    sequence: index,
    text: block,
    wordCount: countWords(block),
    targetHref,
    targetElementId: `content-block-${index}`,
    targetCfi: null,
  }));
}

export function getContentNarrationTranscript(content: ContentNarrationTranscriptSource) {
  const parts = [
    content.title,
    content.author ? `By ${content.author}` : null,
    content.summary,
    content.content,
  ]
    .map((part) => normalizeNullableText(part))
    .filter(Boolean) as string[];

  return normalizeText(parts.join("\n\n"));
}

export function buildContentNarrationBlocks(content: ContentNarrationSource) {
  const targetHref = `content:${content.id}`;
  return splitContentIntoBlocks(getContentNarrationTranscript(content), targetHref);
}

export function hasNarratableContent(content: ContentNarrationTranscriptSource) {
  return countWords(getContentNarrationTranscript(content)) >= 3;
}

export function getContentTypeLabel(type: string) {
  switch (type) {
    case "ARTICLE":
      return "Article";
    case "VIDEO":
      return "Video";
    case "POEM":
      return "Poem";
    case "QUOTE":
      return "Quote";
    default:
      return "Content";
  }
}
