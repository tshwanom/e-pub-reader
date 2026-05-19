import { isFalseyEnvValue, shouldRunPrismaMigrations } from '@/server-runtime';

const mutableEnv = process.env as Record<string, string | undefined>;

function setEnvValue(key: 'NODE_ENV' | 'AUTO_RUN_PRISMA_MIGRATIONS', value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(mutableEnv, key);
    return;
  }

  mutableEnv[key] = value;
}

describe('server runtime migration bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAutoRun = process.env.AUTO_RUN_PRISMA_MIGRATIONS;

  afterEach(() => {
    setEnvValue('NODE_ENV', originalNodeEnv);
    setEnvValue('AUTO_RUN_PRISMA_MIGRATIONS', originalAutoRun);
  });

  it('recognizes explicit false-like environment values', () => {
    expect(isFalseyEnvValue('false')).toBe(true);
    expect(isFalseyEnvValue('0')).toBe(true);
    expect(isFalseyEnvValue('off')).toBe(true);
    expect(isFalseyEnvValue('yes')).toBe(false);
  });

  it('runs migrations by default in production', () => {
    setEnvValue('NODE_ENV', 'production');
    setEnvValue('AUTO_RUN_PRISMA_MIGRATIONS', undefined);

    expect(shouldRunPrismaMigrations()).toBe(true);
  });

  it('does not run migrations outside production', () => {
    setEnvValue('NODE_ENV', 'development');
    setEnvValue('AUTO_RUN_PRISMA_MIGRATIONS', undefined);

    expect(shouldRunPrismaMigrations()).toBe(false);
  });

  it('allows production startups to skip automatic migrations explicitly', () => {
    setEnvValue('NODE_ENV', 'production');
    setEnvValue('AUTO_RUN_PRISMA_MIGRATIONS', 'false');

    expect(shouldRunPrismaMigrations()).toBe(false);
  });
});