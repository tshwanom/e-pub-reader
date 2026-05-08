import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type RemoteNarrationStorageProvider = "s3" | "r2" | "b2";
export type NarrationStorageProvider = RemoteNarrationStorageProvider | "local";

type BaseNarrationStorageConfig = {
  provider: NarrationStorageProvider;
  narrationPrefix: string;
  signedUrlTtlSeconds: number;
};

export type RemoteNarrationStorageConfig = BaseNarrationStorageConfig & {
  provider: RemoteNarrationStorageProvider;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  forcePathStyle: boolean;
};

export type LocalNarrationStorageConfig = BaseNarrationStorageConfig & {
  provider: "local";
  localBaseDir: string;
};

export type NarrationStorageConfig = RemoteNarrationStorageConfig | LocalNarrationStorageConfig;

const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
const DEFAULT_NARRATION_PREFIX = "narration";
const DEFAULT_LOCAL_STORAGE_DIR = path.join(process.cwd(), "storage");

let narrationStorageClientCache: {
  cacheKey: string;
  client: S3Client;
} | null = null;

function cleanEnvValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseSignedUrlTtlSeconds(value?: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

function parseBooleanEnv(value?: string) {
  if (!value) {
    return false;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
}

function parseNarrationStorageProvider(value?: string): NarrationStorageProvider | null {
  switch (value?.trim().toLowerCase()) {
    case "s3":
      return "s3";
    case "r2":
      return "r2";
    case "b2":
      return "b2";
    case "local":
      return "local";
    default:
      return null;
  }
}

function getNarrationPrefix() {
  return cleanEnvValue(process.env.NARRATION_STORAGE_PREFIX)
    ?? cleanEnvValue(process.env.S3_NARRATION_PREFIX)
    ?? DEFAULT_NARRATION_PREFIX;
}

function getSignedUrlTtlSeconds() {
  return parseSignedUrlTtlSeconds(
    cleanEnvValue(process.env.NARRATION_STORAGE_SIGNED_URL_TTL_SECONDS)
      ?? cleanEnvValue(process.env.S3_SIGNED_URL_TTL_SECONDS)
  );
}

function deriveB2RegionFromEndpoint(endpoint?: string) {
  if (!endpoint) {
    return undefined;
  }

  try {
    const { hostname } = new URL(endpoint);
    const match = hostname.match(/^s3\.([^.]+)\.backblazeb2\.com$/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function createNarrationStorageConfig(
  provider: RemoteNarrationStorageProvider,
  region: string | undefined,
  endpoint: string | undefined,
  accessKeyId: string | undefined,
  secretAccessKey: string | undefined,
  bucketName: string | undefined,
  forcePathStyle: boolean
): NarrationStorageConfig | null {
  if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return {
    provider,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName,
    narrationPrefix: getNarrationPrefix(),
    signedUrlTtlSeconds: getSignedUrlTtlSeconds(),
    forcePathStyle,
  };
}

function getLocalNarrationStorageConfig(): LocalNarrationStorageConfig {
  return {
    provider: "local",
    localBaseDir: cleanEnvValue(process.env.NARRATION_STORAGE_LOCAL_DIR) ?? DEFAULT_LOCAL_STORAGE_DIR,
    narrationPrefix: getNarrationPrefix(),
    signedUrlTtlSeconds: getSignedUrlTtlSeconds(),
  };
}

function getS3NarrationStorageConfig() {
  return createNarrationStorageConfig(
    "s3",
    cleanEnvValue(process.env.NARRATION_STORAGE_REGION)
      ?? cleanEnvValue(process.env.AWS_REGION),
    cleanEnvValue(process.env.NARRATION_STORAGE_ENDPOINT),
    cleanEnvValue(process.env.NARRATION_STORAGE_ACCESS_KEY_ID)
      ?? cleanEnvValue(process.env.AWS_ACCESS_KEY_ID),
    cleanEnvValue(process.env.NARRATION_STORAGE_SECRET_ACCESS_KEY)
      ?? cleanEnvValue(process.env.AWS_SECRET_ACCESS_KEY),
    cleanEnvValue(process.env.NARRATION_STORAGE_BUCKET_NAME)
      ?? cleanEnvValue(process.env.S3_BUCKET_NAME),
    parseBooleanEnv(
      cleanEnvValue(process.env.NARRATION_STORAGE_FORCE_PATH_STYLE)
        ?? cleanEnvValue(process.env.AWS_S3_FORCE_PATH_STYLE)
    )
  );
}

function getR2NarrationStorageConfig() {
  const accountId = cleanEnvValue(process.env.R2_ACCOUNT_ID);

  return createNarrationStorageConfig(
    "r2",
    cleanEnvValue(process.env.NARRATION_STORAGE_REGION)
      ?? cleanEnvValue(process.env.R2_REGION)
      ?? "auto",
    cleanEnvValue(process.env.NARRATION_STORAGE_ENDPOINT)
      ?? cleanEnvValue(process.env.R2_ENDPOINT)
      ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined),
    cleanEnvValue(process.env.NARRATION_STORAGE_ACCESS_KEY_ID)
      ?? cleanEnvValue(process.env.R2_ACCESS_KEY_ID),
    cleanEnvValue(process.env.NARRATION_STORAGE_SECRET_ACCESS_KEY)
      ?? cleanEnvValue(process.env.R2_SECRET_ACCESS_KEY),
    cleanEnvValue(process.env.NARRATION_STORAGE_BUCKET_NAME)
      ?? cleanEnvValue(process.env.R2_BUCKET_NAME),
    parseBooleanEnv(
      cleanEnvValue(process.env.NARRATION_STORAGE_FORCE_PATH_STYLE)
        ?? cleanEnvValue(process.env.R2_FORCE_PATH_STYLE)
    )
  );
}

function getB2NarrationStorageConfig() {
  const explicitEndpoint = cleanEnvValue(process.env.NARRATION_STORAGE_ENDPOINT)
    ?? cleanEnvValue(process.env.B2_ENDPOINT);
  const region = cleanEnvValue(process.env.NARRATION_STORAGE_REGION)
    ?? cleanEnvValue(process.env.B2_REGION)
    ?? deriveB2RegionFromEndpoint(explicitEndpoint);
  const endpoint = explicitEndpoint ?? (region ? `https://s3.${region}.backblazeb2.com` : undefined);

  return createNarrationStorageConfig(
    "b2",
    region,
    endpoint,
    cleanEnvValue(process.env.NARRATION_STORAGE_ACCESS_KEY_ID)
      ?? cleanEnvValue(process.env.B2_ACCESS_KEY_ID)
      ?? cleanEnvValue(process.env.B2_KEY_ID),
    cleanEnvValue(process.env.NARRATION_STORAGE_SECRET_ACCESS_KEY)
      ?? cleanEnvValue(process.env.B2_SECRET_ACCESS_KEY)
      ?? cleanEnvValue(process.env.B2_APPLICATION_KEY),
    cleanEnvValue(process.env.NARRATION_STORAGE_BUCKET_NAME)
      ?? cleanEnvValue(process.env.B2_BUCKET_NAME),
    parseBooleanEnv(
      cleanEnvValue(process.env.NARRATION_STORAGE_FORCE_PATH_STYLE)
        ?? cleanEnvValue(process.env.B2_FORCE_PATH_STYLE)
    )
  );
}

export function getNarrationStorageProvider(): NarrationStorageProvider {
  const explicitProvider = parseNarrationStorageProvider(
    cleanEnvValue(process.env.NARRATION_STORAGE_PROVIDER)
  );

  if (explicitProvider) {
    return explicitProvider;
  }

  if (
    cleanEnvValue(process.env.R2_ACCOUNT_ID)
    || cleanEnvValue(process.env.R2_ACCESS_KEY_ID)
    || cleanEnvValue(process.env.R2_BUCKET_NAME)
  ) {
    return "r2";
  }

  if (
    cleanEnvValue(process.env.B2_ENDPOINT)
    || cleanEnvValue(process.env.B2_ACCESS_KEY_ID)
    || cleanEnvValue(process.env.B2_KEY_ID)
    || cleanEnvValue(process.env.B2_APPLICATION_KEY)
    || cleanEnvValue(process.env.B2_BUCKET_NAME)
  ) {
    return "b2";
  }

  return "s3";
}

export function isRemoteNarrationStorageProvider(
  provider: NarrationStorageProvider
): provider is RemoteNarrationStorageProvider {
  return provider !== "local";
}

export function isRemoteNarrationStorageConfig(
  config: NarrationStorageConfig
): config is RemoteNarrationStorageConfig {
  return config.provider !== "local";
}

export function getNarrationStorageProviderLabel(
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  return provider.toUpperCase();
}

function resolveNarrationStorageProvider(
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  return provider;
}

export function getNarrationStorageConfig(
  provider: NarrationStorageProvider = getNarrationStorageProvider()
): NarrationStorageConfig | null {
  switch (resolveNarrationStorageProvider(provider)) {
    case "local":
      return getLocalNarrationStorageConfig();
    case "r2":
      return getR2NarrationStorageConfig();
    case "b2":
      return getB2NarrationStorageConfig();
    case "s3":
    default:
      return getS3NarrationStorageConfig();
  }
}

export function isNarrationStorageConfigured(
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  return getNarrationStorageConfig(provider) !== null;
}

function getNarrationStorageClientCacheKey(config: RemoteNarrationStorageConfig) {
  return [
    config.provider,
    config.region,
    config.endpoint ?? "",
    config.accessKeyId,
    config.secretAccessKey,
    config.bucketName,
    config.forcePathStyle ? "path" : "virtual-hosted",
  ].join(":");
}

export function getNarrationStorageClient(
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  const resolvedProvider = resolveNarrationStorageProvider(provider);
  const config = getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error(
      `${getNarrationStorageProviderLabel(resolvedProvider)} narration storage is not configured.`
    );
  }

  if (!isRemoteNarrationStorageConfig(config)) {
    throw new Error("Local narration storage does not use an S3 client.");
  }

  const cacheKey = getNarrationStorageClientCacheKey(config);

  if (!narrationStorageClientCache || narrationStorageClientCache.cacheKey !== cacheKey) {
    const clientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
    };

    narrationStorageClientCache = {
      cacheKey,
      client: new S3Client(clientConfig),
    };
  }

  return narrationStorageClientCache.client;
}

export function normalizeNarrationObjectKey(objectKey: string) {
  const normalizedObjectKey = objectKey
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  if (normalizedObjectKey.length === 0) {
    throw new Error("Cannot use an empty narration object key.");
  }

  if (normalizedObjectKey.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Narration object keys cannot contain relative path segments.");
  }

  return normalizedObjectKey.join("/");
}

function getNarrationPrefixSegments(config: NarrationStorageConfig) {
  return config.narrationPrefix
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function createLocalNarrationObjectAccessUrl(objectKey: string) {
  return `/api/narration/object?provider=local&key=${encodeURIComponent(objectKey)}`;
}

export function extractNarrationBookIdFromObjectKey(
  objectKey: string,
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  const config = getNarrationStorageConfig(provider);

  if (!config) {
    return null;
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);
  const objectSegments = normalizedObjectKey.split("/");
  const prefixSegments = getNarrationPrefixSegments(config);

  const matchesPrefix = prefixSegments.every((segment, index) => objectSegments[index] === segment);

  if (!matchesPrefix) {
    return null;
  }

  return objectSegments[prefixSegments.length] ?? null;
}

export function resolveLocalNarrationObjectFilePath(
  objectKey: string,
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  const resolvedProvider = resolveNarrationStorageProvider(provider);
  const config = getNarrationStorageConfig(resolvedProvider);

  if (!config || config.provider !== "local") {
    throw new Error("Local narration storage is not configured.");
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);
  const absoluteBaseDir = path.resolve(config.localBaseDir);
  const absoluteObjectPath = path.resolve(absoluteBaseDir, normalizedObjectKey);
  const relativeObjectPath = path.relative(absoluteBaseDir, absoluteObjectPath);

  if (relativeObjectPath.startsWith("..") || path.isAbsolute(relativeObjectPath)) {
    throw new Error("Narration object path escapes the configured local storage directory.");
  }

  return absoluteObjectPath;
}

export async function writeNarrationObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  const resolvedProvider = resolveNarrationStorageProvider(provider);
  const config = getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error(
      `${getNarrationStorageProviderLabel(resolvedProvider)} narration storage is not configured.`
    );
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);

  if (config.provider === "local") {
    const absoluteObjectPath = resolveLocalNarrationObjectFilePath(normalizedObjectKey, resolvedProvider);

    await fs.mkdir(path.dirname(absoluteObjectPath), { recursive: true });
    await fs.writeFile(absoluteObjectPath, body);
    return;
  }

  await getNarrationStorageClient(resolvedProvider).send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: normalizedObjectKey,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, max-age=300",
    })
  );
}

export async function createPresignedNarrationObjectUrl(
  objectKey: string,
  provider: NarrationStorageProvider = getNarrationStorageProvider()
) {
  const resolvedProvider = resolveNarrationStorageProvider(provider);
  const config = getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error(
      `${getNarrationStorageProviderLabel(resolvedProvider)} narration storage is not configured.`
    );
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);

  if (config.provider === "local") {
    return createLocalNarrationObjectAccessUrl(normalizedObjectKey);
  }

  return getSignedUrl(
    getNarrationStorageClient(resolvedProvider),
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: normalizedObjectKey,
    }),
    {
      expiresIn: config.signedUrlTtlSeconds,
    }
  );
}
