require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const JSZip = require('jszip');
const { parseStringPromise } = require('xml2js');
const { PrismaClient } = require('@prisma/client');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { buildSampleNarrationCueTimeline } = require('../lib/narration-sample');

const DEFAULT_BOOK_TITLE = 'The Captured Soul';
const DEFAULT_VOICE_SLUG = 'classic-narrator';
const DEFAULT_SAMPLE_DURATION_SECONDS = 6;
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_STORAGE_PREFIX = 'narration';
const PRIVATE_BOOK_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'uploads');
const LEGACY_PUBLIC_BOOK_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

process.env.PRISMA_CLIENT_ENGINE_TYPE = process.env.PRISMA_CLIENT_ENGINE_TYPE || 'binary';
process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);

function createPrismaClient() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim().toLowerCase();
  const usesAccelerateProtocol = databaseUrl.startsWith('prisma://')
    || databaseUrl.startsWith('prisma+postgres://');

  if (usesAccelerateProtocol) {
    return new PrismaClient();
  }

  return new PrismaClient({
    __internal: {
      configOverride: (config) => ({
        ...config,
        copyEngine: true,
      }),
    },
  });
}

const prisma = createPrismaClient();

function normalizeDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return databaseUrl;
  }

  try {
    const parsed = new URL(databaseUrl);

    if ((parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') && !parsed.port) {
      parsed.port = '5432';
      return parsed.toString();
    }
  } catch {
    return databaseUrl;
  }

  return databaseUrl;
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    bookTitle: DEFAULT_BOOK_TITLE,
    bookSlug: null,
    bookId: null,
    voiceSlug: DEFAULT_VOICE_SLUG,
    durationSeconds: DEFAULT_SAMPLE_DURATION_SECONDS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--book-title':
        args.bookTitle = nextValue;
        index += 1;
        break;
      case '--book-slug':
        args.bookSlug = nextValue;
        index += 1;
        break;
      case '--book-id':
        args.bookId = nextValue;
        index += 1;
        break;
      case '--voice':
        args.voiceSlug = nextValue;
        index += 1;
        break;
      case '--duration-seconds':
        args.durationSeconds = Number(nextValue);
        index += 1;
        break;
      default:
        break;
    }
  }

  if (!Number.isFinite(args.durationSeconds) || args.durationSeconds <= 0) {
    throw new Error('`--duration-seconds` must be a positive number.');
  }

  return args;
}

function trimEnv(value) {
  return value?.trim() || '';
}

function parseBooleanEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function deriveB2RegionFromEndpoint(endpoint) {
  if (!endpoint) {
    return '';
  }

  try {
    const hostname = new URL(endpoint).hostname;
    return hostname.match(/^s3\.([^.]+)\.backblazeb2\.com$/i)?.[1] || '';
  } catch {
    return '';
  }
}

function getNarrationStorageProvider() {
  const explicitProvider = trimEnv(process.env.NARRATION_STORAGE_PROVIDER).toLowerCase();

  if (explicitProvider === 's3' || explicitProvider === 'r2' || explicitProvider === 'b2' || explicitProvider === 'local') {
    return explicitProvider;
  }

  if (
    trimEnv(process.env.R2_ACCOUNT_ID)
    || trimEnv(process.env.R2_ACCESS_KEY_ID)
    || trimEnv(process.env.R2_BUCKET_NAME)
  ) {
    return 'r2';
  }

  if (
    trimEnv(process.env.B2_ENDPOINT)
    || trimEnv(process.env.B2_KEY_ID)
    || trimEnv(process.env.B2_BUCKET_NAME)
  ) {
    return 'b2';
  }

  return 's3';
}

function toPersistedNarrationStorageProvider(provider) {
  switch (String(provider || '').trim().toLowerCase()) {
    case 'local':
      return 'LOCAL';
    case 'r2':
      return 'R2';
    case 'b2':
      return 'B2';
    case 's3':
    default:
      return 'S3';
  }
}

function getNarrationStorageConfig() {
  const provider = getNarrationStorageProvider();
  const prefix = trimEnv(process.env.NARRATION_STORAGE_PREFIX)
    || trimEnv(process.env.S3_NARRATION_PREFIX)
    || DEFAULT_STORAGE_PREFIX;
  const localBaseDir = trimEnv(process.env.NARRATION_STORAGE_LOCAL_DIR)
    || path.join(process.cwd(), 'storage');
  const genericRegion = trimEnv(process.env.NARRATION_STORAGE_REGION);
  const genericEndpoint = trimEnv(process.env.NARRATION_STORAGE_ENDPOINT);
  const genericAccessKeyId = trimEnv(process.env.NARRATION_STORAGE_ACCESS_KEY_ID);
  const genericSecretAccessKey = trimEnv(process.env.NARRATION_STORAGE_SECRET_ACCESS_KEY);
  const genericBucketName = trimEnv(process.env.NARRATION_STORAGE_BUCKET_NAME);
  const genericForcePathStyle = parseBooleanEnv(process.env.NARRATION_STORAGE_FORCE_PATH_STYLE);
  const missing = [];

  let region = '';
  let endpoint = '';
  let accessKeyId = '';
  let secretAccessKey = '';
  let bucketName = '';
  let forcePathStyle = genericForcePathStyle;

  if (provider === 'local') {
    return {
      provider,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucketName,
      prefix,
      localBaseDir,
      forcePathStyle,
      missing,
    };
  }

  if (provider === 'r2') {
    const accountId = trimEnv(process.env.R2_ACCOUNT_ID);
    region = genericRegion || trimEnv(process.env.R2_REGION) || 'auto';
    endpoint = genericEndpoint
      || trimEnv(process.env.R2_ENDPOINT)
      || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
    accessKeyId = genericAccessKeyId || trimEnv(process.env.R2_ACCESS_KEY_ID);
    secretAccessKey = genericSecretAccessKey || trimEnv(process.env.R2_SECRET_ACCESS_KEY);
    bucketName = genericBucketName || trimEnv(process.env.R2_BUCKET_NAME);
    forcePathStyle = genericForcePathStyle || parseBooleanEnv(process.env.R2_FORCE_PATH_STYLE);

    if (!endpoint) missing.push('R2_ACCOUNT_ID or NARRATION_STORAGE_ENDPOINT');
    if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
    if (!bucketName) missing.push('R2_BUCKET_NAME');
  } else if (provider === 'b2') {
    endpoint = genericEndpoint || trimEnv(process.env.B2_ENDPOINT);
    region = genericRegion || trimEnv(process.env.B2_REGION) || deriveB2RegionFromEndpoint(endpoint);

    if (!endpoint && region) {
      endpoint = `https://s3.${region}.backblazeb2.com`;
    }

    accessKeyId = genericAccessKeyId || trimEnv(process.env.B2_ACCESS_KEY_ID) || trimEnv(process.env.B2_KEY_ID);
    secretAccessKey = genericSecretAccessKey || trimEnv(process.env.B2_SECRET_ACCESS_KEY) || trimEnv(process.env.B2_APPLICATION_KEY);
    bucketName = genericBucketName || trimEnv(process.env.B2_BUCKET_NAME);
    forcePathStyle = genericForcePathStyle || parseBooleanEnv(process.env.B2_FORCE_PATH_STYLE);

    if (!region) missing.push('B2_REGION or B2_ENDPOINT');
    if (!accessKeyId) missing.push('B2_ACCESS_KEY_ID or B2_KEY_ID');
    if (!secretAccessKey) missing.push('B2_SECRET_ACCESS_KEY or B2_APPLICATION_KEY');
    if (!bucketName) missing.push('B2_BUCKET_NAME');
  } else {
    region = genericRegion || trimEnv(process.env.AWS_REGION);
    endpoint = genericEndpoint;
    accessKeyId = genericAccessKeyId || trimEnv(process.env.AWS_ACCESS_KEY_ID);
    secretAccessKey = genericSecretAccessKey || trimEnv(process.env.AWS_SECRET_ACCESS_KEY);
    bucketName = genericBucketName || trimEnv(process.env.S3_BUCKET_NAME);
    forcePathStyle = genericForcePathStyle || parseBooleanEnv(process.env.AWS_S3_FORCE_PATH_STYLE);

    if (!region) missing.push('AWS_REGION');
    if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
    if (!bucketName) missing.push('S3_BUCKET_NAME');
  }

  return {
    provider,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName,
    prefix,
    forcePathStyle,
    missing,
  };
}

function createStorageClient(config) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: Boolean(config.forcePathStyle),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getBookUploadFilename(fileUrl) {
  const filename = String(fileUrl || '').split('/').filter(Boolean).pop();

  if (!filename) {
    throw new Error('Book file URL is missing a filename.');
  }

  return filename;
}

async function resolveStoredBookFilePath(fileUrl) {
  const filename = getBookUploadFilename(fileUrl);
  const privatePath = path.join(PRIVATE_BOOK_UPLOAD_DIR, filename);

  if (await pathExists(privatePath)) {
    return privatePath;
  }

  const legacyPublicPath = path.join(LEGACY_PUBLIC_BOOK_UPLOAD_DIR, filename);
  if (await pathExists(legacyPublicPath)) {
    return legacyPublicPath;
  }

  throw new Error(`Stored book file not found for ${filename}.`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, maxAttempts = 3, delayMs = 1500) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === maxAttempts;

      if (!isLastAttempt) {
        console.warn(`${label} attempt ${attempt} failed: ${message}. Retrying...`);
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

async function findTargetBook(options) {
  const select = {
    id: true,
    title: true,
    slug: true,
    donorOnly: true,
    epubFile: {
      select: {
        fileUrl: true,
        mimeType: true,
      },
    },
  };

  return withRetry('Book lookup', async () => {
    if (options.bookId) {
      return prisma.book.findUnique({ where: { id: options.bookId }, select });
    }

    if (options.bookSlug) {
      return prisma.book.findUnique({ where: { slug: options.bookSlug }, select });
    }

    return prisma.book.findFirst({
      where: { title: options.bookTitle },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'asc' }],
      select,
    });
  });
}

function isTextSpineItem(item) {
  const mediaType = item?.['media-type'] || item?.mediaType || '';
  const href = item?.href || '';

  return mediaType.includes('html') || /\.(xhtml|html|htm)$/i.test(href);
}

function isFrontMatterHref(href) {
  return /(cover|title|toc|nav|copyright|dedication|contents|frontmatter|imprint|about[-_]?author)/i.test(href || '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => String.fromCharCode(parseInt(codePoint, 16)))
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCharCode(Number(codePoint)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function isFrontMatterExcerpt(excerpt) {
  return /(first published|copyright|all rights reserved|table of contents|contents\b|dedication|isbn|reproduced, stored or transmitted)/i.test(excerpt || '');
}

function stripMarkup(markup) {
  return decodeHtmlEntities(
    markup
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function inferChapterTitle(chapterMarkup, fallbackHref) {
  const titleMatch = chapterMarkup.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const headingMatch = chapterMarkup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const title = stripMarkup(titleMatch?.[1] || headingMatch?.[1] || '');
  return title || path.posix.basename(fallbackHref);
}

const NARRATION_CUE_BLOCK_TAG_PATTERN = 'p|blockquote|li|dd|dt|figcaption|h[1-6]|div';
const NARRATION_CUE_BLOCK_TAG_SCORES = {
  p: 110,
  blockquote: 95,
  li: 82,
  dd: 76,
  dt: 70,
  figcaption: 64,
  h2: 40,
  h3: 34,
  h4: 30,
  h5: 26,
  h6: 24,
  h1: 20,
  div: 10,
};

function extractAttributeValue(attributeMarkup, attributeName) {
  const match = attributeMarkup.match(new RegExp(`\\b${attributeName}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match?.[2]?.trim() || null;
}

function collectNarrationCueBlocks(bodyMarkup) {
  const blockPattern = new RegExp(
    `<(${NARRATION_CUE_BLOCK_TAG_PATTERN})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'gi'
  );

  return [...bodyMarkup.matchAll(blockPattern)]
    .map((match, index) => {
      const tagName = String(match[1] || '').toLowerCase();
      const attributeMarkup = match[2] || '';
      const text = stripMarkup(match[3] || '');
      const elementId = extractAttributeValue(attributeMarkup, 'id');

      return {
        index,
        startOffset: match.index ?? index,
        tagName,
        text,
        elementId,
        ariaHidden: /^true$/i.test(extractAttributeValue(attributeMarkup, 'aria-hidden') || ''),
      };
    })
    .filter((block) => !block.ariaHidden)
    .filter((block) => block.text.length > 0);
}

function scoreNarrationCueBlock(block) {
  if (!block || !block.text) {
    return Number.NEGATIVE_INFINITY;
  }

  const normalizedText = block.text.trim();

  if (normalizedText.length < 18) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = NARRATION_CUE_BLOCK_TAG_SCORES[block.tagName] || 0;

  if (block.elementId) {
    score += 12;
  }

  if (!isFrontMatterExcerpt(normalizedText)) {
    score += 140;
  } else {
    score -= 240;
  }

  if (/^(contents|table of contents|copyright|dedication)$/i.test(normalizedText)) {
    score -= 300;
  }

  if (/^(foreword|prologue|epilogue|chapter\s+\d+)$/i.test(normalizedText)) {
    score -= 90;
  }

  if (normalizedText.length >= 60) {
    score += 28;
  }

  if (normalizedText.length >= 120) {
    score += 14;
  }

  if (block.tagName === 'div' && normalizedText.length > 260) {
    score -= 70;
  }

  return score;
}

function inferNarrationCueTarget(bodyMarkup, spineHref) {
  const blocks = collectNarrationCueBlocks(bodyMarkup);
  const rankedBlocks = [...blocks].sort((left, right) => {
    const scoreDifference = scoreNarrationCueBlock(right) - scoreNarrationCueBlock(left);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return left.startOffset - right.startOffset;
  });

  const preferredBlock = rankedBlocks.find((block) => Number.isFinite(scoreNarrationCueBlock(block)))
    || blocks.find((block) => !isFrontMatterExcerpt(block.text))
    || blocks[0]
    || null;

  const excerpt = preferredBlock?.text?.slice(0, 180)
    || stripMarkup(bodyMarkup).slice(0, 180)
    || `Sample donor narration cue for ${spineHref}.`;

  return {
    targetElementId: preferredBlock?.elementId || null,
    targetHref: preferredBlock?.elementId ? `${spineHref}#${preferredBlock.elementId}` : spineHref,
    excerpt,
    cueSourceText: preferredBlock?.text || excerpt,
  };
}

function prefersContentCandidate(candidate) {
  return !isFrontMatterHref(candidate.spineHref) && !isFrontMatterExcerpt(candidate.excerpt);
}

function isNavigationCandidate(candidate) {
  return /(toc|nav|contents)/i.test(candidate?.spineHref || '')
    || /^contents$/i.test(candidate?.chapterTitle || '');
}

async function inspectEpubForNarrationTarget(filePath) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const containerEntry = zip.file('META-INF/container.xml');

  if (!containerEntry) {
    throw new Error('EPUB container.xml is missing.');
  }

  const containerXml = await containerEntry.async('string');
  const container = await parseStringPromise(containerXml);
  const opfPath = container?.container?.rootfiles?.[0]?.rootfile?.[0]?.$?.['full-path'];

  if (!opfPath) {
    throw new Error('Unable to resolve the EPUB package document (OPF).');
  }

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) {
    throw new Error(`EPUB package document not found at ${opfPath}.`);
  }

  const opfXml = await opfEntry.async('string');
  const opf = await parseStringPromise(opfXml);
  const pkg = opf?.package;
  const manifestItems = (pkg?.manifest?.[0]?.item || []).map((item) => item.$);
  const spineRefs = (pkg?.spine?.[0]?.itemref || []).map((item) => item.$?.idref).filter(Boolean);
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));

  const textSpineItems = spineRefs
    .map((id) => manifestById.get(id))
    .filter((item) => item && isTextSpineItem(item));

  if (textSpineItems.length === 0) {
    throw new Error('Unable to find a readable text chapter in the EPUB spine.');
  }
  const opfDir = path.posix.dirname(opfPath);

  const inspectedCandidates = [];

  for (const [spineIndex, textSpineItem] of textSpineItems.entries()) {
    const spineHref = textSpineItem.href;
    const archiveChapterPath = path.posix.normalize(path.posix.join(opfDir, spineHref));
    const chapterEntry = zip.file(archiveChapterPath);

    if (!chapterEntry) {
      continue;
    }

    const chapterMarkup = await chapterEntry.async('string');
    const bodyMatch = chapterMarkup.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyMarkup = bodyMatch?.[1] || chapterMarkup;
    const narrationCueTarget = inferNarrationCueTarget(bodyMarkup, spineHref);

    inspectedCandidates.push({
      spineIndex,
      chapterTitle: inferChapterTitle(chapterMarkup, spineHref),
      spineHref,
      targetElementId: narrationCueTarget.targetElementId,
      targetHref: narrationCueTarget.targetHref,
      excerpt: narrationCueTarget.excerpt,
      cueSourceText: narrationCueTarget.cueSourceText,
      archiveChapterPath,
      packagePath: opfPath,
    });
  }

  const navigationPivotIndex = inspectedCandidates.reduce((highestIndex, candidate) => {
    if (!isNavigationCandidate(candidate)) {
      return highestIndex;
    }

    return Math.max(highestIndex, candidate.spineIndex);
  }, -1);

  const postNavigationCandidates = navigationPivotIndex >= 0
    ? inspectedCandidates.filter((candidate) => candidate.spineIndex > navigationPivotIndex)
    : [];
  const preferredCandidatePool = postNavigationCandidates.length > 0
    ? postNavigationCandidates
    : inspectedCandidates;

  const preferredCandidate = preferredCandidatePool.find(
    (candidate) => prefersContentCandidate(candidate) && Boolean(candidate.targetElementId)
  ) || preferredCandidatePool.find(
    (candidate) => !isFrontMatterExcerpt(candidate.excerpt) && Boolean(candidate.targetElementId)
  ) || preferredCandidatePool.find(
    (candidate) => !isFrontMatterHref(candidate.spineHref) && Boolean(candidate.targetElementId)
  ) || preferredCandidatePool.find(
    (candidate) => prefersContentCandidate(candidate)
  ) || preferredCandidatePool.find(
    (candidate) => !isFrontMatterExcerpt(candidate.excerpt)
  ) || preferredCandidatePool.find(
    (candidate) => !isFrontMatterHref(candidate.spineHref)
  ) || inspectedCandidates.find(
    (candidate) => prefersContentCandidate(candidate)
  ) || inspectedCandidates.find(
    (candidate) => !isFrontMatterExcerpt(candidate.excerpt)
  ) || inspectedCandidates.find(
    (candidate) => !isFrontMatterHref(candidate.spineHref)
  ) || inspectedCandidates[0];

  if (!preferredCandidate) {
    throw new Error('Unable to inspect a readable text chapter inside the EPUB.');
  }

  return preferredCandidate;
}

function writeAscii(buffer, offset, value) {
  buffer.write(value, offset, value.length, 'ascii');
}

function createSampleNarrationWav(durationSeconds) {
  const sampleRate = DEFAULT_SAMPLE_RATE;
  const totalSamples = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  writeAscii(buffer, 0, 'RIFF');
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeAscii(buffer, 8, 'WAVE');
  writeAscii(buffer, 12, 'fmt ');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  writeAscii(buffer, 36, 'data');
  buffer.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const pulseWindowSeconds = 0.82;
    const pulsePosition = time % pulseWindowSeconds;
    const isAudiblePulse = pulsePosition < 0.56;
    const frequency = Math.floor(time / pulseWindowSeconds) % 2 === 0 ? 392 : 523.25;
    const fadeIn = Math.min(pulsePosition / 0.04, 1);
    const fadeOut = Math.min((0.56 - pulsePosition) / 0.08, 1);
    const envelope = isAudiblePulse ? Math.max(0, Math.min(fadeIn, fadeOut)) : 0;
    const sampleValue = isAudiblePulse
      ? Math.sin(2 * Math.PI * frequency * time) * 0.18 * envelope
      : 0;

    buffer.writeInt16LE(Math.max(-1, Math.min(1, sampleValue)) * 32767, 44 + sampleIndex * 2);
  }

  return {
    buffer,
    durationMs: Math.round((totalSamples / sampleRate) * 1000),
    mimeType: 'audio/wav',
  };
}

function buildObjectKeys(config, book, voiceSlug) {
  const baseKey = `${config.prefix}/${book.id}/${voiceSlug}/sample`;

  return {
    manifestObjectKey: `${baseKey}/manifest.json`,
    chapterAudioObjectKey: `${baseKey}/chapters/0.wav`,
  };
}

async function uploadObject({ client, bucketName, key, body, contentType }) {
  if (!client) {
    const localBaseDir = trimEnv(process.env.NARRATION_STORAGE_LOCAL_DIR)
      || path.join(process.cwd(), 'storage');
    const objectPath = path.join(localBaseDir, key);

    await fs.mkdir(path.dirname(objectPath), { recursive: true });
    await fs.writeFile(objectPath, body);
    return;
  }

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'private, max-age=300',
  }));
}

async function upsertReadyNarration({ book, voiceSlug, manifestObjectKey, chapterAudioObjectKey, chapterInfo, chapterCues, audioInfo, storageConfig }) {
  return withRetry('Narration upsert', async () => {
    return prisma.$transaction(async (tx) => {
      const persistedStorageProvider = toPersistedNarrationStorageProvider(storageConfig.provider);

      const voice = await tx.narrationVoice.upsert({
        where: { slug: voiceSlug },
        update: {},
        create: {
          slug: voiceSlug,
          name: voiceSlug === DEFAULT_VOICE_SLUG ? 'Classic Narrator' : 'Sample Narrator',
          provider: 'sample-generator',
          language: 'en',
          description: 'Reusable generated QA narration voice for donor playback testing.',
          sampleText: 'Generated sample narration audio for validating the donor player.',
        },
      });

      await tx.bookNarration.updateMany({
        where: {
          bookId: book.id,
          NOT: { voiceId: voice.id },
        },
        data: { active: false },
      });

      const narration = await tx.bookNarration.upsert({
        where: {
          bookId_voiceId: {
            bookId: book.id,
            voiceId: voice.id,
          },
        },
        update: {
          status: 'READY',
          storageProvider: persistedStorageProvider,
          manifestObjectKey,
          audioMimeType: audioInfo.mimeType,
          totalDurationMs: audioInfo.durationMs,
          totalChapters: 1,
          active: true,
          readyAt: new Date(),
          errorMessage: null,
        },
        create: {
          bookId: book.id,
          voiceId: voice.id,
          status: 'READY',
          storageProvider: persistedStorageProvider,
          manifestObjectKey,
          audioMimeType: audioInfo.mimeType,
          totalDurationMs: audioInfo.durationMs,
          totalChapters: 1,
          active: true,
          readyAt: new Date(),
          errorMessage: null,
        },
      });

      await tx.narrationChapter.deleteMany({
        where: { narrationId: narration.id },
      });

      const chapter = await tx.narrationChapter.create({
        data: {
          narrationId: narration.id,
          chapterIndex: 0,
          title: chapterInfo.chapterTitle,
          spineHref: chapterInfo.spineHref,
          status: 'READY',
          audioObjectKey: chapterAudioObjectKey,
          audioMimeType: audioInfo.mimeType,
          durationMs: audioInfo.durationMs,
          cues: {
            create: chapterCues.map((cue) => ({
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
        include: {
          cues: {
            orderBy: { sequence: 'asc' },
          },
        },
      });

      return {
        narration,
        voice,
        chapter,
      };
    });
  });
}

function buildManifest({ book, narration, voice, chapter, manifestObjectKey, audioInfo, storageConfig }) {
  return {
    version: 1,
    bookId: book.id,
    narrationId: narration.id,
    generatedAt: new Date(narration.updatedAt || Date.now()).toISOString(),
    totalDurationMs: audioInfo.durationMs,
    chapterCount: 1,
    storage: {
      provider: storageConfig.provider,
      manifestObjectKey,
    },
    voice: {
      id: voice.id,
      name: voice.name,
      slug: voice.slug,
      provider: voice.provider,
      language: voice.language,
    },
    chapters: [
      {
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
      },
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const storageConfig = getNarrationStorageConfig();

  const book = await findTargetBook(options);
  if (!book) {
    throw new Error('Target book not found. Provide --book-id, --book-slug, or --book-title.');
  }

  if (!book.epubFile?.fileUrl) {
    throw new Error(`Book “${book.title}” does not have an EPUB file to inspect.`);
  }

  const resolvedBookFilePath = await resolveStoredBookFilePath(book.epubFile.fileUrl);
  const chapterInfo = await inspectEpubForNarrationTarget(resolvedBookFilePath);
  const audioInfo = createSampleNarrationWav(options.durationSeconds);
  const chapterCues = buildSampleNarrationCueTimeline({
    text: chapterInfo.cueSourceText || chapterInfo.excerpt,
    targetHref: chapterInfo.targetHref,
    targetElementId: chapterInfo.targetElementId,
    targetCfi: null,
    durationMs: audioInfo.durationMs,
  });
  const objectKeys = buildObjectKeys(storageConfig, book, options.voiceSlug);

  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      book: {
        id: book.id,
        title: book.title,
        slug: book.slug,
        donorOnly: book.donorOnly,
        fileUrl: book.epubFile.fileUrl,
        resolvedBookFilePath,
      },
      chapter: chapterInfo,
      cues: chapterCues,
      audio: {
        durationMs: audioInfo.durationMs,
        mimeType: audioInfo.mimeType,
        byteLength: audioInfo.buffer.length,
      },
      storage: {
        provider: storageConfig.provider,
        configured: storageConfig.missing.length === 0,
        missing: storageConfig.missing,
        prefix: storageConfig.prefix,
        endpoint: storageConfig.endpoint || null,
        objectKeys,
      },
    }, null, 2));
    return;
  }

  if (storageConfig.missing.length > 0) {
    throw new Error(`Missing required ${storageConfig.provider.toUpperCase()} narration environment variables: ${storageConfig.missing.join(', ')}`);
  }

  const storageClient = storageConfig.provider === 'local'
    ? null
    : createStorageClient(storageConfig);

  await uploadObject({
    client: storageClient,
    bucketName: storageConfig.bucketName,
    key: objectKeys.chapterAudioObjectKey,
    body: audioInfo.buffer,
    contentType: audioInfo.mimeType,
  });

  const { narration, voice, chapter } = await upsertReadyNarration({
    book,
    voiceSlug: options.voiceSlug,
    manifestObjectKey: objectKeys.manifestObjectKey,
    chapterAudioObjectKey: objectKeys.chapterAudioObjectKey,
    chapterInfo,
    chapterCues,
    audioInfo,
    storageConfig,
  });

  const manifest = buildManifest({
    book,
    narration,
    voice,
    chapter,
    manifestObjectKey: objectKeys.manifestObjectKey,
    audioInfo,
    storageConfig,
  });

  await uploadObject({
    client: storageClient,
    bucketName: storageConfig.bucketName,
    key: objectKeys.manifestObjectKey,
    body: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  console.log(JSON.stringify({
    mode: 'live',
    book: {
      id: book.id,
      title: book.title,
      slug: book.slug,
    },
    narration: {
      id: narration.id,
      status: narration.status,
      active: narration.active,
      manifestObjectKey: objectKeys.manifestObjectKey,
    },
    chapter: {
      id: chapter.id,
      title: chapter.title,
      spineHref: chapter.spineHref,
      audioObjectKey: chapter.audioObjectKey,
      cueCount: chapter.cues.length,
    },
    audio: {
      durationMs: audioInfo.durationMs,
      mimeType: audioInfo.mimeType,
      bucketName: storageConfig.bucketName,
      provider: storageConfig.provider,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
