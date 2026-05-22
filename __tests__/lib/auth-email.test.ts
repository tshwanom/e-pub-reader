import {
  buildMagicLoginEmail,
  generateMagicLoginCode,
  MAGIC_LOGIN_CODE_LENGTH,
  MAGIC_LOGIN_MAX_AGE_MINUTES,
  normalizeAuthEmail,
} from '@/lib/auth-email';

describe('auth email helpers', () => {
  it('normalizes email addresses for passwordless login', () => {
    expect(normalizeAuthEmail(' Reader@Example.com ')).toBe('reader@example.com');
    expect(normalizeAuthEmail(undefined)).toBe('');
  });

  it('generates a numeric sign-in code with the expected length', () => {
    const code = generateMagicLoginCode();

    expect(code).toMatch(/^\d+$/);
    expect(code).toHaveLength(MAGIC_LOGIN_CODE_LENGTH);
  });

  it('builds a magic login email that includes both the link and the code', () => {
    const email = buildMagicLoginEmail({
      identifier: 'reader@example.com',
      url: 'https://1manrevolution.com/api/auth/callback/email?token=123456&email=reader%40example.com',
      token: '123456',
    });

    expect(email.subject).toMatch(/sign-in link and code/i);
    expect(email.html).toContain('reader@example.com');
    expect(email.html).toContain('123456');
    expect(email.html).toContain('https://1manrevolution.com/api/auth/callback/email?token=123456&email=reader%40example.com');
    expect(email.html).toContain(String(MAGIC_LOGIN_MAX_AGE_MINUTES));
    expect(email.text).toContain('6-digit code: 123456');
  });
});
