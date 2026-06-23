const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config) => ({
    config,
    send: mockS3Send,
  })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    siteSettings: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { prisma } from '@/lib/prisma';

import {
  createPresignedNarrationObjectUrl,
  deleteNarrationFolder,
  getNarrationStorageConfig,
  getNarrationStorageProvider,
  isNarrationStorageConfigured,
  resolveLocalNarrationObjectFilePath,
  writeNarrationObject,
} from '@/lib/narration-storage';

const originalEnv = { ...process.env };
const { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = jest.requireMock('@aws-sdk/client-s3') as {
  S3Client: jest.Mock;
  GetObjectCommand: jest.Mock;
  ListObjectsV2Command: jest.Mock;
  DeleteObjectsCommand: jest.Mock;
};
const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
  getSignedUrl: jest.Mock;
};

describe('narration storage adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    delete process.env.NARRATION_STORAGE_PROVIDER;
    delete process.env.NARRATION_STORAGE_REGION;
    delete process.env.NARRATION_STORAGE_ENDPOINT;
    delete process.env.NARRATION_STORAGE_ACCESS_KEY_ID;
    delete process.env.NARRATION_STORAGE_SECRET_ACCESS_KEY;
    delete process.env.NARRATION_STORAGE_BUCKET_NAME;
    delete process.env.NARRATION_STORAGE_FORCE_PATH_STYLE;
    delete process.env.NARRATION_STORAGE_PREFIX;
    delete process.env.NARRATION_STORAGE_SIGNED_URL_TTL_SECONDS;
    delete process.env.NARRATION_STORAGE_LOCAL_DIR;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_REGION;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_FORCE_PATH_STYLE;
    delete process.env.NARRATION_STORAGE_PUBLIC_DOMAIN;
    delete process.env.R2_PUBLIC_DOMAIN;
    
    (prisma.siteSettings.findFirst as jest.Mock).mockResolvedValue(null);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to local provider when env is empty and no DB settings exist', async () => {
    await expect(getNarrationStorageProvider()).resolves.toBe('local');
    const config = await getNarrationStorageConfig();
    expect(config).toMatchObject({
      provider: 'local',
      localBaseDir: expect.any(String),
      narrationPrefix: 'narration',
      signedUrlTtlSeconds: 900,
    });
    await expect(isNarrationStorageConfigured()).resolves.toBe(true);
  });

  it('builds an R2 config from provider-specific env vars', async () => {
    process.env.NARRATION_STORAGE_PROVIDER = 'r2';
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'r2-key';
    process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
    process.env.R2_BUCKET_NAME = 'reader-audio';
    process.env.NARRATION_STORAGE_PREFIX = 'donor-narration';
    process.env.NARRATION_STORAGE_SIGNED_URL_TTL_SECONDS = '1800';

    await expect(getNarrationStorageProvider()).resolves.toBe('r2');
    const config = await getNarrationStorageConfig();
    expect(config).toEqual({
      provider: 'r2',
      region: 'auto',
      endpoint: 'https://account-123.r2.cloudflarestorage.com',
      accessKeyId: 'r2-key',
      secretAccessKey: 'r2-secret',
      bucketName: 'reader-audio',
      narrationPrefix: 'donor-narration',
      signedUrlTtlSeconds: 1800,
      forcePathStyle: false,
    });
  });

  it('builds a local config and returns protected local asset URLs', async () => {
    process.env.NARRATION_STORAGE_PROVIDER = 'local';
    process.env.NARRATION_STORAGE_LOCAL_DIR = 'storage';

    await expect(getNarrationStorageProvider()).resolves.toBe('local');
    const config = await getNarrationStorageConfig();
    expect(config).toEqual({
      provider: 'local',
      localBaseDir: 'storage',
      narrationPrefix: 'narration',
      signedUrlTtlSeconds: 900,
    });
    await expect(
      createPresignedNarrationObjectUrl(' narration/book-123/voice/chapter-001.wav ')
    ).resolves.toBe(
      '/api/narration/object?provider=local&key=narration%2Fbook-123%2Fvoice%2Fchapter-001.wav'
    );
  });

  it('creates a presigned object URL with provider-specific endpoint settings', async () => {
    process.env.NARRATION_STORAGE_PROVIDER = 'r2';
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'r2-key';
    process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
    process.env.R2_BUCKET_NAME = 'reader-audio';
    process.env.R2_FORCE_PATH_STYLE = 'true';
    getSignedUrl.mockResolvedValueOnce('https://signed.example/audio.mp3');

    await expect(createPresignedNarrationObjectUrl(' chapters/audio.mp3 ')).resolves.toBe('https://signed.example/audio.mp3');

    expect(S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: 'https://account-123.r2.cloudflarestorage.com',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'r2-key',
        secretAccessKey: 'r2-secret',
      },
    });
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'reader-audio',
      Key: 'chapters/audio.mp3',
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 900 }
    );
  });

  it('builds an R2 config with publicDomain from env vars', async () => {
    process.env.NARRATION_STORAGE_PROVIDER = 'r2';
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'r2-key';
    process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
    process.env.R2_BUCKET_NAME = 'reader-audio';
    process.env.R2_PUBLIC_DOMAIN = 'data.1manrevolution.com';

    const config = await getNarrationStorageConfig();
    expect(config).toMatchObject({
      provider: 'r2',
      publicDomain: 'data.1manrevolution.com',
    });
  });

  it('generates direct custom domain URLs instead of presigned URLs when publicDomain is set', async () => {
    process.env.NARRATION_STORAGE_PROVIDER = 'r2';
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'r2-key';
    process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
    process.env.R2_BUCKET_NAME = 'reader-audio';
    process.env.R2_PUBLIC_DOMAIN = 'data.1manrevolution.com';

    await expect(createPresignedNarrationObjectUrl(' chapters/audio.mp3 ')).resolves.toBe(
      'https://data.1manrevolution.com/chapters/audio.mp3'
    );

    // Verify it works with protocol prefix already in environment variable
    process.env.R2_PUBLIC_DOMAIN = 'https://custom.cdn.com/';
    await expect(createPresignedNarrationObjectUrl(' chapters/audio.mp3 ')).resolves.toBe(
      'https://custom.cdn.com/chapters/audio.mp3'
    );
  });

  it('supports hybrid provider and fallback to local', async () => {
    process.env.NARRATION_STORAGE_PROVIDER = 'hybrid';
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'r2-key';
    process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
    process.env.R2_BUCKET_NAME = 'reader-audio';
    process.env.NARRATION_STORAGE_LOCAL_DIR = 'storage';

    await expect(getNarrationStorageProvider()).resolves.toBe('hybrid');
    const config = await getNarrationStorageConfig();
    expect(config).toMatchObject({
      provider: 'hybrid',
      localConfig: {
        provider: 'local',
        localBaseDir: 'storage',
      },
      r2Config: {
        provider: 'r2',
        bucketName: 'reader-audio',
      },
    });

    // Test presigned URL generation (primary R2)
    getSignedUrl.mockResolvedValueOnce('https://signed.example/hybrid.mp3');
    await expect(createPresignedNarrationObjectUrl(' chapters/audio.mp3 ')).resolves.toBe('https://signed.example/hybrid.mp3');

    // Test presigned URL generation fallback to local on R2 error
    getSignedUrl.mockRejectedValueOnce(new Error('R2 Network Error'));
    await expect(createPresignedNarrationObjectUrl(' chapters/audio.mp3 ')).resolves.toBe(
      '/api/narration/object?provider=local&key=chapters%2Faudio.mp3'
    );
  });

  it('writes narration objects to the configured local filesystem root', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-storage-'));

    try {
      process.env.NARRATION_STORAGE_PROVIDER = 'local';
      process.env.NARRATION_STORAGE_LOCAL_DIR = tempRoot;

      await writeNarrationObject(
        'narration/book-123/voice/chapters/000.wav',
        Buffer.from('hello local narration', 'utf8'),
        'audio/wav'
      );

      const storedPath = await resolveLocalNarrationObjectFilePath(
        'narration/book-123/voice/chapters/000.wav',
        'local'
      );

      await expect(fs.readFile(storedPath, 'utf8')).resolves.toBe('hello local narration');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  describe('deleteNarrationFolder', () => {
    it('deletes a local narration folder recursively', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-delete-'));
      try {
        process.env.NARRATION_STORAGE_PROVIDER = 'local';
        process.env.NARRATION_STORAGE_LOCAL_DIR = tempRoot;

        const bookFolder = path.join(tempRoot, 'narration', 'book-123');
        await fs.mkdir(bookFolder, { recursive: true });
        await fs.writeFile(path.join(bookFolder, 'manifest.json'), '{}');

        await expect(fs.access(bookFolder)).resolves.toBeUndefined();

        await deleteNarrationFolder('book-123');

        await expect(fs.access(bookFolder)).rejects.toThrow();
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('deletes a remote narration folder recursively by listing and deleting objects', async () => {
      process.env.NARRATION_STORAGE_PROVIDER = 'r2';
      process.env.R2_ACCOUNT_ID = 'account-123';
      process.env.R2_ACCESS_KEY_ID = 'r2-key';
      process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
      process.env.R2_BUCKET_NAME = 'reader-audio';

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: 'narration/book-123/manifest.json' },
          { Key: 'narration/book-123/chapters/000.wav' },
        ],
        NextContinuationToken: undefined,
      }).mockResolvedValueOnce({
        Deleted: [
          { Key: 'narration/book-123/manifest.json' },
          { Key: 'narration/book-123/chapters/000.wav' },
        ],
      });

      await deleteNarrationFolder('book-123');

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: 'reader-audio',
        Prefix: 'narration/book-123/',
        ContinuationToken: undefined,
      });

      expect(DeleteObjectsCommand).toHaveBeenCalledWith({
        Bucket: 'reader-audio',
        Delete: {
          Objects: [
            { Key: 'narration/book-123/manifest.json' },
            { Key: 'narration/book-123/chapters/000.wav' },
          ],
        },
      });
    });

    it('deletes from both local and remote storage in hybrid mode', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-hybrid-'));
      try {
        process.env.NARRATION_STORAGE_PROVIDER = 'hybrid';
        process.env.NARRATION_STORAGE_LOCAL_DIR = tempRoot;
        process.env.R2_ACCOUNT_ID = 'account-123';
        process.env.R2_ACCESS_KEY_ID = 'r2-key';
        process.env.R2_SECRET_ACCESS_KEY = 'r2-secret';
        process.env.R2_BUCKET_NAME = 'reader-audio';

        const bookFolder = path.join(tempRoot, 'narration', 'book-123');
        await fs.mkdir(bookFolder, { recursive: true });
        await fs.writeFile(path.join(bookFolder, 'manifest.json'), '{}');

        mockS3Send.mockResolvedValueOnce({
          Contents: [{ Key: 'narration/book-123/manifest.json' }],
        }).mockResolvedValueOnce({});

        await deleteNarrationFolder('book-123');

        await expect(fs.access(bookFolder)).rejects.toThrow();

        expect(ListObjectsV2Command).toHaveBeenCalledWith({
          Bucket: 'reader-audio',
          Prefix: 'narration/book-123/',
          ContinuationToken: undefined,
        });
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
