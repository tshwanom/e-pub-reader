import { isContentFeatureUnavailableError, withContentFeatureFallback } from '@/lib/content';

describe('content feature fallback helpers', () => {
  it('recognizes missing supplementary content schema errors', () => {
    expect(
      isContentFeatureUnavailableError(
        new Error('The table `public.SupplementaryContent` does not exist in the current database.')
      )
    ).toBe(true);

    expect(
      isContentFeatureUnavailableError(
        new Error('The column `narrationSourceHash` does not exist in the current database.')
      )
    ).toBe(true);
  });

  it('ignores unrelated runtime errors', () => {
    expect(isContentFeatureUnavailableError(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(false);
  });

  it('returns the fallback value for unavailable content schema errors', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      withContentFeatureFallback(
        async () => {
          throw new Error('The table `public.SupplementaryContent` does not exist in the current database.');
        },
        ['fallback'],
        'content feature fallback test'
      )
    ).resolves.toEqual(['fallback']);

    warnSpy.mockRestore();
  });

  it('rethrows unrelated errors', async () => {
    const originalError = new Error('connect ECONNREFUSED 127.0.0.1:5432');

    await expect(
      withContentFeatureFallback(
        async () => {
          throw originalError;
        },
        [],
        'content feature fallback test'
      )
    ).rejects.toBe(originalError);
  });
});