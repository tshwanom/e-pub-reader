import { S3Client } from "@aws-sdk/client-s3";
import {
  createPresignedNarrationObjectUrl,
  getNarrationStorageClient,
  getNarrationStorageConfig,
} from "./narration-storage";

export type S3NarrationConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  narrationPrefix: string;
  signedUrlTtlSeconds: number;
};

export function getS3NarrationConfig(): S3NarrationConfig | null {
  const config = getNarrationStorageConfig();

  if (!config || config.provider !== "s3") {
    return null;
  }

  return {
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucketName: config.bucketName,
    narrationPrefix: config.narrationPrefix,
    signedUrlTtlSeconds: config.signedUrlTtlSeconds,
  };
}

export function isS3NarrationConfigured() {
  return getS3NarrationConfig() !== null;
}

export function getS3NarrationClient() {
  const config = getS3NarrationConfig();

  if (!config) {
    throw new Error("S3 narration storage is not configured.");
  }

  return getNarrationStorageClient() as S3Client;
}

export { createPresignedNarrationObjectUrl };
