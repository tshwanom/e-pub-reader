import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type RemoteNarrationStorageProvider = "r2";
export type NarrationStorageProvider = RemoteNarrationStorageProvider | "local" | "hybrid";

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

export type HybridNarrationStorageConfig = BaseNarrationStorageConfig & {
  provider: "hybrid";
  localConfig: LocalNarrationStorageConfig;
  r2Config: RemoteNarrationStorageConfig;
};

export type NarrationStorageConfig = RemoteNarrationStorageConfig | LocalNarrationStorageConfig | HybridNarrationStorageConfig;

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

function parseSignedUrlTtlSeconds(value?: string | number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

function parseBooleanEnv(value?: string | boolean) {
  if (typeof value === "boolean") return value;
  if (!value) {
    return false;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
}

function parseNarrationStorageProvider(value?: string): NarrationStorageProvider | null {
  switch (value?.trim().toLowerCase()) {
    case "r2":
      return "r2";
    case "local":
      return "local";
    case "hybrid":
      return "hybrid";
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

function createNarrationStorageConfig(
  provider: RemoteNarrationStorageProvider,
  region: string | undefined,
  endpoint: string | undefined,
  accessKeyId: string | undefined,
  secretAccessKey: string | undefined,
  bucketName: string | undefined,
  forcePathStyle: boolean
): RemoteNarrationStorageConfig | null {
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

export async function getDbSettings() {
  try {
    const settings = await prisma.siteSettings.findFirst();
    if (!settings) return null;
    
    let decryptedSettings: any = {};
    if (settings.storageSettings) {
      const decryptedStr = decrypt(settings.storageSettings);
      if (decryptedStr) {
        decryptedSettings = JSON.parse(decryptedStr);
      }
    }
    
    return {
      storageProvider: settings.storageProvider || "local",
      storageSettings: decryptedSettings
    };
  } catch (error) {
    console.error("Error reading storage settings from database:", error);
    return null;
  }
}

export async function getNarrationStorageProvider(): Promise<NarrationStorageProvider> {
  const dbSettings = await getDbSettings();
  if (dbSettings?.storageProvider) {
    return dbSettings.storageProvider as NarrationStorageProvider;
  }

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

  return "local";
}

export function isRemoteNarrationStorageProvider(
  provider: NarrationStorageProvider
): provider is RemoteNarrationStorageProvider {
  return provider === "r2";
}

export function isRemoteNarrationStorageConfig(
  config: NarrationStorageConfig
): config is RemoteNarrationStorageConfig {
  return config.provider === "r2";
}

export function getNarrationStorageProviderLabel(
  provider: NarrationStorageProvider
) {
  return provider.toUpperCase();
}

export async function getNarrationStorageConfig(
  provider?: NarrationStorageProvider
): Promise<NarrationStorageConfig | null> {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const dbSettings = await getDbSettings();

  // Try db settings first
  if (dbSettings && dbSettings.storageSettings) {
    const config = dbSettings.storageSettings[resolvedProvider];
    if (config) {
      if (resolvedProvider === "hybrid") {
        return {
          provider: "hybrid",
          narrationPrefix: config.narrationPrefix || getNarrationPrefix(),
          signedUrlTtlSeconds: parseSignedUrlTtlSeconds(config.signedUrlTtlSeconds),
          localConfig: {
            provider: "local",
            localBaseDir: config.localConfig?.localBaseDir || DEFAULT_LOCAL_STORAGE_DIR,
            narrationPrefix: config.narrationPrefix || getNarrationPrefix(),
            signedUrlTtlSeconds: parseSignedUrlTtlSeconds(config.signedUrlTtlSeconds),
          },
          r2Config: {
            provider: "r2",
            region: config.r2Config?.region || "auto",
            endpoint: config.r2Config?.endpoint,
            accessKeyId: config.r2Config?.accessKeyId || "",
            secretAccessKey: config.r2Config?.secretAccessKey || "",
            bucketName: config.r2Config?.bucketName || "",
            forcePathStyle: !!config.r2Config?.forcePathStyle,
            narrationPrefix: config.narrationPrefix || getNarrationPrefix(),
            signedUrlTtlSeconds: parseSignedUrlTtlSeconds(config.signedUrlTtlSeconds),
          }
        };
      } else if (resolvedProvider === "local") {
        return {
          provider: "local",
          localBaseDir: config.localBaseDir || DEFAULT_LOCAL_STORAGE_DIR,
          narrationPrefix: config.narrationPrefix || getNarrationPrefix(),
          signedUrlTtlSeconds: parseSignedUrlTtlSeconds(config.signedUrlTtlSeconds),
        };
      } else if (resolvedProvider === "r2") {
        return {
          provider: "r2",
          region: config.region || "auto",
          endpoint: config.endpoint,
          accessKeyId: config.accessKeyId || "",
          secretAccessKey: config.secretAccessKey || "",
          bucketName: config.bucketName || "",
          forcePathStyle: !!config.forcePathStyle,
          narrationPrefix: config.narrationPrefix || getNarrationPrefix(),
          signedUrlTtlSeconds: parseSignedUrlTtlSeconds(config.signedUrlTtlSeconds),
        };
      }
    }
  }

  // Fallback to env-based config
  switch (resolvedProvider) {
    case "local":
      return getLocalNarrationStorageConfig();
    case "r2":
      return getR2NarrationStorageConfig();
    case "hybrid": {
      const localCfg = getLocalNarrationStorageConfig();
      const r2Cfg = getR2NarrationStorageConfig();
      if (!r2Cfg) return null;
      return {
        provider: "hybrid",
        narrationPrefix: getNarrationPrefix(),
        signedUrlTtlSeconds: getSignedUrlTtlSeconds(),
        localConfig: localCfg,
        r2Config: r2Cfg,
      };
    }
    default:
      return null;
  }
}

export async function isNarrationStorageConfigured(
  provider?: NarrationStorageProvider
): Promise<boolean> {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const config = await getNarrationStorageConfig(resolvedProvider);
  if (!config) return false;
  if (config.provider === "hybrid") {
    return !!config.r2Config && !!config.localConfig;
  }
  return true;
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

export async function getNarrationStorageClient(
  provider?: NarrationStorageProvider
): Promise<S3Client> {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const config = await getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error(
      `${resolvedProvider.toUpperCase()} narration storage is not configured.`
    );
  }

  let targetConfig: RemoteNarrationStorageConfig;
  if (config.provider === "hybrid") {
    targetConfig = config.r2Config;
  } else if (isRemoteNarrationStorageConfig(config)) {
    targetConfig = config;
  } else {
    throw new Error("Local narration storage does not use an S3 client.");
  }

  const cacheKey = getNarrationStorageClientCacheKey(targetConfig);

  if (!narrationStorageClientCache || narrationStorageClientCache.cacheKey !== cacheKey) {
    const clientConfig = {
      region: targetConfig.region,
      credentials: {
        accessKeyId: targetConfig.accessKeyId,
        secretAccessKey: targetConfig.secretAccessKey,
      },
      ...(targetConfig.endpoint ? { endpoint: targetConfig.endpoint } : {}),
      ...(targetConfig.forcePathStyle ? { forcePathStyle: true } : {}),
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

export async function extractNarrationBookIdFromObjectKey(
  objectKey: string,
  provider?: NarrationStorageProvider
): Promise<string | null> {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const config = await getNarrationStorageConfig(resolvedProvider);

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

export async function resolveLocalNarrationObjectFilePath(
  objectKey: string,
  provider?: NarrationStorageProvider
): Promise<string> {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const config = await getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error("Local narration storage is not configured.");
  }

  let localBaseDir = "";
  if (config.provider === "local") {
    localBaseDir = config.localBaseDir;
  } else if (config.provider === "hybrid") {
    localBaseDir = config.localConfig.localBaseDir;
  } else {
    throw new Error("R2 narration storage does not use local filepath.");
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);
  const absoluteBaseDir = path.resolve(localBaseDir);
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
  provider?: NarrationStorageProvider
) {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const config = await getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error(
      `${resolvedProvider.toUpperCase()} narration storage is not configured.`
    );
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);

  if (config.provider === "local") {
    const absoluteObjectPath = await resolveLocalNarrationObjectFilePath(normalizedObjectKey, resolvedProvider);

    await fs.mkdir(path.dirname(absoluteObjectPath), { recursive: true });
    await fs.writeFile(absoluteObjectPath, body);
    return;
  }

  if (config.provider === "hybrid") {
    const absoluteObjectPath = await resolveLocalNarrationObjectFilePath(normalizedObjectKey, "local");
    await fs.mkdir(path.dirname(absoluteObjectPath), { recursive: true });
    await fs.writeFile(absoluteObjectPath, body);

    const client = await getNarrationStorageClient("r2");
    await client.send(
      new PutObjectCommand({
        Bucket: config.r2Config.bucketName,
        Key: normalizedObjectKey,
        Body: body,
        ContentType: contentType,
        CacheControl: "private, max-age=300",
      })
    );
    return;
  }

  const client = await getNarrationStorageClient(resolvedProvider);
  await client.send(
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
  provider?: NarrationStorageProvider
): Promise<string> {
  const resolvedProvider = provider ?? (await getNarrationStorageProvider());
  const config = await getNarrationStorageConfig(resolvedProvider);

  if (!config) {
    throw new Error(
      `${resolvedProvider.toUpperCase()} narration storage is not configured.`
    );
  }

  const normalizedObjectKey = normalizeNarrationObjectKey(objectKey);

  if (config.provider === "local") {
    return createLocalNarrationObjectAccessUrl(normalizedObjectKey);
  }

  if (config.provider === "hybrid") {
    try {
      const client = await getNarrationStorageClient("r2");
      return await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.r2Config.bucketName,
          Key: normalizedObjectKey,
        }),
        {
          expiresIn: config.signedUrlTtlSeconds,
        }
      );
    } catch (error) {
      console.error("Hybrid: Failed to create presigned URL from R2, falling back to local:", error);
      return createLocalNarrationObjectAccessUrl(normalizedObjectKey);
    }
  }

  const client = await getNarrationStorageClient(resolvedProvider);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: normalizedObjectKey,
    }),
    {
      expiresIn: config.signedUrlTtlSeconds,
    }
  );
}
