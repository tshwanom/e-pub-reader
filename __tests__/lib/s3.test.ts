jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config) => ({ config })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import {
  createPresignedNarrationObjectUrl,
  getS3NarrationConfig,
  isS3NarrationConfigured,
} from '@/lib/s3';

const originalEnv = { ...process.env };
const { S3Client, GetObjectCommand } = jest.requireMock('@aws-sdk/client-s3') as {
  S3Client: jest.Mock;
  GetObjectCommand: jest.Mock;
};
const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner') as {
  getSignedUrl: jest.Mock;
};

describe('S3 narration config helpers', () => {
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
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET_NAME;
    delete process.env.S3_NARRATION_PREFIX;
    delete process.env.S3_SIGNED_URL_TTL_SECONDS;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_REGION;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_FORCE_PATH_STYLE;
    delete process.env.B2_REGION;
    delete process.env.B2_ENDPOINT;
    delete process.env.B2_ACCESS_KEY_ID;
    delete process.env.B2_KEY_ID;
    delete process.env.B2_SECRET_ACCESS_KEY;
    delete process.env.B2_APPLICATION_KEY;
    delete process.env.B2_BUCKET_NAME;
    delete process.env.B2_FORCE_PATH_STYLE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when required S3 settings are missing', () => {
    expect(getS3NarrationConfig()).toBeNull();
    expect(isS3NarrationConfigured()).toBe(false);
  });

  it('returns parsed narration config when all required settings exist', () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.S3_BUCKET_NAME = 'reader-audio';
    process.env.S3_NARRATION_PREFIX = 'donor-narration';
    process.env.S3_SIGNED_URL_TTL_SECONDS = '1800';

    expect(getS3NarrationConfig()).toEqual({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucketName: 'reader-audio',
      narrationPrefix: 'donor-narration',
      signedUrlTtlSeconds: 1800,
    });
    expect(isS3NarrationConfigured()).toBe(true);
  });

  it('falls back to safe defaults for optional narration settings', () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.S3_BUCKET_NAME = 'reader-audio';
    process.env.S3_SIGNED_URL_TTL_SECONDS = 'not-a-number';

    expect(getS3NarrationConfig()).toMatchObject({
      narrationPrefix: 'narration',
      signedUrlTtlSeconds: 900,
    });
  });

  it('creates a presigned object URL for narration assets', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.S3_BUCKET_NAME = 'reader-audio';
    process.env.S3_SIGNED_URL_TTL_SECONDS = '1200';
    getSignedUrl.mockResolvedValueOnce('https://signed.example/audio.mp3');

    await expect(createPresignedNarrationObjectUrl(' chapters/audio.mp3 ')).resolves.toBe('https://signed.example/audio.mp3');

    expect(S3Client).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'reader-audio',
      Key: 'chapters/audio.mp3',
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 1200 }
    );
  });
});
