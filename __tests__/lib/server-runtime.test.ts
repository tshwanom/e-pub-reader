import { isFalseyEnvValue, shouldRunPrismaMigrations } from '@/server-runtime';

describe('server runtime migration bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAutoRun = process.env.AUTO_RUN_PRISMA_MIGRATIONS;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalAutoRun === undefined) {
      delete process.env.AUTO_RUN_PRISMA_MIGRATIONS;
    } else {
      process.env.AUTO_RUN_PRISMA_MIGRATIONS = originalAutoRun;
    }
  });

  it('recognizes explicit false-like environment values', () => {
    expect(isFalseyEnvValue('false')).toBe(true);
    expect(isFalseyEnvValue('0')).toBe(true);
    expect(isFalseyEnvValue('off')).toBe(true);
    expect(isFalseyEnvValue('yes')).toBe(false);
  });

  it('runs migrations by default in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTO_RUN_PRISMA_MIGRATIONS;

    expect(shouldRunPrismaMigrations()).toBe(true);
  });

  it('does not run migrations outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTO_RUN_PRISMA_MIGRATIONS;

    expect(shouldRunPrismaMigrations()).toBe(false);
  });

  it('allows production startups to skip automatic migrations explicitly', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTO_RUN_PRISMA_MIGRATIONS = 'false';

    expect(shouldRunPrismaMigrations()).toBe(false);
  });
});