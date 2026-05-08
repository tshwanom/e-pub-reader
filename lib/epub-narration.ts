import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { parseStringPromise } from "xml2js";

const BLOCK_TAG_PATTERN = "p|blockquote|li|dd|dt|figcaption|h[1-6]|div";
const MAX_CHUNK_CHARACTERS = 4500;
const MAX_CHUNK_WORDS = 900;
const MAX_CUE_COUNT = 120;

export interface NarrationSourceBlock {
  sequence: number;
  text: string;
  wordCount: number;
  targetHref: string;
  targetElementId: string | null;
  targetCfi: null;
}

export interface NarrationSourceChapter {
  chapterIndex: number;
  title: string;
  spineHref: string;
  transcript: string;
  wordCount: number;
  blocks: NarrationSourceBlock[];
}

export interface NarrationGenerationChunk {
  sequence: number;
  transcript: string;
  blocks: NarrationSourceBlock[];
  wordCount: number;
  characterCount: number;
}

export interface NarrationTimelineCue {
  sequence: number;
  startMs: number;
  endMs: number;
  targetHref: string;
  targetElementId: string | null;
  targetCfi: null;
  excerpt: string;
}

type EpubManifestItem = {
  [key: string]: string;
};

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([([{"“‘])\s+/g, "$1")
    .replace(/\s+([)\]}"”’])/g, "$1")
    .trim();
}

function countWords(value: string) {
  return normalizeText(value).split(" ").filter(Boolean).length;
}

function splitIntoSentences(text: string) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return [] as string[];
  }

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return Array.from(segmenter.segment(normalizedText), (segment) => normalizeText(segment.segment)).filter(Boolean);
  }

  return (normalizedText.match(/[^.!?]+[.!?]+(?:["'”’]+)?|[^.!?]+$/g) || [])
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint: string) => String.fromCharCode(parseInt(codePoint, 16)))
    .replace(/&#(\d+);/g, (_, codePoint: string) => String.fromCharCode(Number(codePoint)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripMarkup(markup: string) {
  return normalizeText(
    decodeHtmlEntities(
      markup
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function extractAttributeValue(attributeMarkup: string, attributeName: string) {
  const match = attributeMarkup.match(new RegExp(`\\b${attributeName}\\s*=\\s*(['"])(.*?)\\1`, "i"));
  return match?.[2]?.trim() || null;
}

function isTextSpineItem(item: { [key: string]: string } | undefined) {
  const mediaType = item?.["media-type"] || item?.mediaType || "";
  const href = item?.href || "";
  return mediaType.includes("html") || /\.(xhtml|html|htm)$/i.test(href);
}

function isFrontMatterHref(href: string) {
  return /(cover|title|toc|nav|copyright|dedication|contents|frontmatter|imprint|about[-_]?author)/i.test(href || "");
}

function isNavigationCandidate(spineHref: string, title: string) {
  return /(toc|nav|contents)/i.test(spineHref || "") || /^contents$/i.test(title || "");
}

function isFrontMatterExcerpt(excerpt: string) {
  return /(first published|copyright|all rights reserved|table of contents|contents\b|dedication|isbn|reproduced, stored or transmitted)/i.test(
    excerpt || ""
  );
}

function inferChapterTitle(chapterMarkup: string, fallbackHref: string) {
  const titleMatch = chapterMarkup.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const headingMatch = chapterMarkup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return stripMarkup(titleMatch?.[1] || headingMatch?.[1] || "") || path.posix.basename(fallbackHref);
}

function collectNarrationBlocks(bodyMarkup: string, spineHref: string) {
  const blockPattern = new RegExp(`<(${BLOCK_TAG_PATTERN})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "gi");

  return [...bodyMarkup.matchAll(blockPattern)]
    .map((match, index) => {
      const attributeMarkup = match[2] || "";
      const text = stripMarkup(match[3] || "");
      const targetElementId = extractAttributeValue(attributeMarkup, "id");
      const ariaHidden = /^true$/i.test(extractAttributeValue(attributeMarkup, "aria-hidden") || "");

      return {
        sequence: index,
        text,
        targetElementId,
        targetHref: targetElementId ? `${spineHref}#${targetElementId}` : spineHref,
        targetCfi: null as null,
        ariaHidden,
      };
    })
    .filter((block) => !block.ariaHidden)
    .filter((block) => block.text.length >= 18)
    .filter((block) => !isFrontMatterExcerpt(block.text));
}

function expandLongBlocks(blocks: NarrationSourceBlock[]) {
  const expandedBlocks: NarrationSourceBlock[] = [];
  let sequence = 0;

  for (const block of blocks) {
    const sentences = splitIntoSentences(block.text);
    const sourceSegments = sentences.length > 0 ? sentences : [block.text];
    let currentSegmentParts: string[] = [];
    let currentWordCount = 0;

    const flush = () => {
      const text = normalizeText(currentSegmentParts.join(" "));

      if (!text) {
        currentSegmentParts = [];
        currentWordCount = 0;
        return;
      }

      expandedBlocks.push({
        sequence: sequence += 1,
        text,
        wordCount: countWords(text),
        targetHref: block.targetHref,
        targetElementId: block.targetElementId,
        targetCfi: null,
      });
      currentSegmentParts = [];
      currentWordCount = 0;
    };

    for (const sentence of sourceSegments) {
      const sentenceWordCount = countWords(sentence);
      const nextWordCount = currentWordCount + sentenceWordCount;

      if (currentSegmentParts.length > 0 && nextWordCount > 95) {
        flush();
      }

      currentSegmentParts.push(sentence);
      currentWordCount += sentenceWordCount;
    }

    flush();
  }

  return expandedBlocks.map((block, index) => ({
    ...block,
    sequence: index,
  }));
}

export async function extractEpubNarrationChapters(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");

  if (!containerXml) {
    throw new Error("EPUB container.xml is missing.");
  }

  const container = await parseStringPromise(containerXml);
  const opfPath = container?.container?.rootfiles?.[0]?.rootfile?.[0]?.$?.["full-path"];

  if (!opfPath) {
    throw new Error("Unable to resolve the EPUB package document (OPF).");
  }

  const opfXml = await zip.file(opfPath)?.async("string");

  if (!opfXml) {
    throw new Error(`EPUB package document not found at ${opfPath}.`);
  }

  const opf = await parseStringPromise(opfXml);
  const pkg = opf?.package;
  const manifestItems = (pkg?.manifest?.[0]?.item || []).map((item: { $: EpubManifestItem }) => item.$);
  const spineRefs = (pkg?.spine?.[0]?.itemref || [])
    .map((item: { $: { idref?: string } }) => item.$?.idref)
    .filter(Boolean);
  const manifestById = new Map<string, EpubManifestItem>(
    manifestItems.map((item: EpubManifestItem) => [item.id, item])
  );
  const opfDir = path.posix.dirname(opfPath);

  const rawChapters = [] as Array<Omit<NarrationSourceChapter, "blocks"> & { blocks: NarrationSourceBlock[] }>;

  for (const [spineIndex, itemId] of spineRefs.entries()) {
    const textSpineItem = manifestById.get(itemId);

    if (!textSpineItem || !isTextSpineItem(textSpineItem)) {
      continue;
    }

    const spineHref = textSpineItem.href;
    const archiveChapterPath = path.posix.normalize(path.posix.join(opfDir, spineHref));
    const chapterMarkup = await zip.file(archiveChapterPath)?.async("string");

    if (!chapterMarkup) {
      continue;
    }

    const bodyMatch = chapterMarkup.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyMarkup = bodyMatch?.[1] || chapterMarkup;
    const collectedBlocks = collectNarrationBlocks(bodyMarkup, spineHref)
      .map((block, index) => ({
        sequence: index,
        text: block.text,
        wordCount: countWords(block.text),
        targetHref: block.targetHref,
        targetElementId: block.targetElementId,
        targetCfi: null,
      } satisfies NarrationSourceBlock));

    if (collectedBlocks.length === 0) {
      continue;
    }

    const expandedBlocks = expandLongBlocks(collectedBlocks);
    const transcript = expandedBlocks.map((block) => block.text).join("\n\n").trim();
    const wordCount = countWords(transcript);
    const title = inferChapterTitle(chapterMarkup, spineHref);

    rawChapters.push({
      chapterIndex: spineIndex,
      title,
      spineHref,
      transcript,
      wordCount,
      blocks: expandedBlocks,
    });
  }

  const navigationPivotIndex = rawChapters.reduce((highestIndex, chapter) => {
    if (!isNavigationCandidate(chapter.spineHref, chapter.title)) {
      return highestIndex;
    }

    return Math.max(highestIndex, chapter.chapterIndex);
  }, -1);

  const postNavigationChapters = navigationPivotIndex >= 0
    ? rawChapters.filter((chapter) => chapter.chapterIndex > navigationPivotIndex)
    : rawChapters;

  const preferredChapters = postNavigationChapters.filter(
    (chapter) => !isFrontMatterHref(chapter.spineHref) && chapter.wordCount >= 40
  );
  const fallbackChapters = rawChapters.filter((chapter) => !isFrontMatterHref(chapter.spineHref) && chapter.wordCount >= 40);
  const chapters = (preferredChapters.length > 0 ? preferredChapters : fallbackChapters.length > 0 ? fallbackChapters : rawChapters)
    .filter((chapter) => chapter.wordCount >= 20)
    .map((chapter, index) => ({
      ...chapter,
      chapterIndex: index,
    }));

  if (chapters.length === 0) {
    throw new Error("Unable to extract readable narration chapters from the EPUB.");
  }

  return chapters;
}

export function buildNarrationGenerationChunks(
  blocks: NarrationSourceBlock[],
  options?: {
    maxCharacters?: number;
    maxWords?: number;
  }
) {
  const maxCharacters = options?.maxCharacters ?? MAX_CHUNK_CHARACTERS;
  const maxWords = options?.maxWords ?? MAX_CHUNK_WORDS;
  const chunks: NarrationGenerationChunk[] = [];
  let currentBlocks: NarrationSourceBlock[] = [];
  let currentWordCount = 0;
  let currentCharacterCount = 0;

  const flush = () => {
    if (currentBlocks.length === 0) {
      return;
    }

    const transcript = currentBlocks.map((block) => block.text).join("\n\n").trim();

    chunks.push({
      sequence: chunks.length,
      transcript,
      blocks: [...currentBlocks],
      wordCount: currentWordCount,
      characterCount: currentCharacterCount,
    });
    currentBlocks = [];
    currentWordCount = 0;
    currentCharacterCount = 0;
  };

  for (const block of blocks) {
    const blockCharacterCount = block.text.length;
    const nextWordCount = currentWordCount + block.wordCount;
    const nextCharacterCount = currentCharacterCount + blockCharacterCount;

    if (
      currentBlocks.length > 0
      && (nextWordCount > maxWords || nextCharacterCount > maxCharacters)
    ) {
      flush();
    }

    currentBlocks.push(block);
    currentWordCount += block.wordCount;
    currentCharacterCount += blockCharacterCount;
  }

  flush();

  return chunks;
}

function condenseBlocksForCueLimit(blocks: NarrationSourceBlock[], maxCueCount: number) {
  if (blocks.length <= maxCueCount) {
    return blocks;
  }

  const groupSize = Math.ceil(blocks.length / maxCueCount);
  const condensedBlocks: NarrationSourceBlock[] = [];

  for (let index = 0; index < blocks.length; index += groupSize) {
    const groupedBlocks = blocks.slice(index, index + groupSize);
    const firstBlock = groupedBlocks[0];
    const text = groupedBlocks.map((block) => block.text).join(" ").trim();

    condensedBlocks.push({
      sequence: condensedBlocks.length,
      text,
      wordCount: countWords(text),
      targetHref: firstBlock.targetHref,
      targetElementId: firstBlock.targetElementId,
      targetCfi: null,
    });
  }

  return condensedBlocks;
}

export function buildNarrationCueTimelineFromBlocks(
  blocks: NarrationSourceBlock[],
  totalDurationMs: number,
  maxCueCount = MAX_CUE_COUNT
) {
  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0 || blocks.length === 0) {
    return [] as NarrationTimelineCue[];
  }

  const cueBlocks = condenseBlocksForCueLimit(blocks, maxCueCount).filter((block) => block.wordCount > 0);

  if (cueBlocks.length === 0) {
    return [];
  }

  const totalWeight = cueBlocks.reduce((sum, block) => sum + Math.max(1, block.wordCount), 0);
  const minimumCueDurationMs = Math.min(
    1000,
    Math.max(450, Math.floor(totalDurationMs / Math.max(cueBlocks.length * 2, 1)))
  );

  let consumedWeight = 0;
  let startMs = 0;

  return cueBlocks.map((block, index) => {
    consumedWeight += Math.max(1, block.wordCount);

    let endMs: number;
    if (index === cueBlocks.length - 1) {
      endMs = totalDurationMs;
    } else {
      const remainingCueCount = cueBlocks.length - index - 1;
      const suggestedEnd = Math.round((consumedWeight / totalWeight) * totalDurationMs);
      const minEnd = startMs + minimumCueDurationMs;
      const maxEnd = totalDurationMs - remainingCueCount * minimumCueDurationMs;
      endMs = Math.min(Math.max(suggestedEnd, minEnd), maxEnd);
    }

    const cue = {
      sequence: index,
      startMs,
      endMs,
      targetHref: block.targetHref,
      targetElementId: block.targetElementId,
      targetCfi: null,
      excerpt: block.text.slice(0, 240),
    } satisfies NarrationTimelineCue;

    startMs = endMs;
    return cue;
  });
}