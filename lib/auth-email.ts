import { randomInt } from 'crypto';

export const MAGIC_LOGIN_CODE_LENGTH = 6;
export const MAGIC_LOGIN_MAX_AGE_MINUTES = 15;

function assertResendConfigured() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) {
    throw new Error('Resend API key is not configured. Add RESEND_API_KEY to continue.');
  }

  if (!from) {
    throw new Error('Resend sender email is not configured. Add RESEND_FROM_EMAIL to continue.');
  }

  return {
    apiKey,
    from,
  };
}

export function normalizeAuthEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail || '';
}

export function generateMagicLoginCode() {
  return randomInt(0, 10 ** MAGIC_LOGIN_CODE_LENGTH)
    .toString()
    .padStart(MAGIC_LOGIN_CODE_LENGTH, '0');
}

export function buildMagicLoginEmail({
  identifier,
  url,
  token,
}: {
  identifier: string;
  url: string;
  token: string;
}) {
  const safeEmail = normalizeAuthEmail(identifier);
  const host = new URL(url).host;
  const subject = 'Your One Man Revolution sign-in link and code';
  const html = [
    '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f7;padding:24px;color:#111827;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d8e0e4;border-radius:20px;padding:32px;box-shadow:0 8px 30px rgba(17,24,39,0.06);">',
    '<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#3D737A;">Passwordless sign-in</p>',
    '<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#111827;">Sign in to One Man Revolution</h1>',
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#5f6b76;">We found a sign-in request for <strong style="color:#111827;">${safeEmail}</strong>. Open the magic link below, or type the 6-digit code on the login screen. Once you sign in with the same email you used to support the mission, your access benefits will follow you home.</p>`,
    `<div style="margin:24px 0;"><a href="${url}" style="display:inline-block;border-radius:14px;background:#3D737A;color:#ffffff;text-decoration:none;padding:14px 22px;font-weight:700;">Sign in instantly</a></div>`,
    '<div style="margin:24px 0;padding:18px 20px;border-radius:16px;background:#edf2f4;border:1px solid #d8e0e4;">',
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#5f6b76;">Your 6-digit code</p>',
    `<p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.22em;color:#111827;">${token}</p>`,
    '</div>',
    `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#5f6b76;">This link and code expire in ${MAGIC_LOGIN_MAX_AGE_MINUTES} minutes. If you did not ask to sign in to ${host}, you can safely ignore this email.</p>`,
    '</div>',
    '</div>',
  ].join('');
  const text = [
    'Sign in to your One Man Revolution account.',
    '',
    `Magic link: ${url}`,
    `6-digit code: ${token}`,
    '',
    `This link and code expire in ${MAGIC_LOGIN_MAX_AGE_MINUTES} minutes.`,
    `If you did not request this sign-in for ${safeEmail}, you can ignore this email.`,
  ].join('\n');

  return {
    subject,
    html,
    text,
  };
}

export async function sendMagicLoginEmail({
  identifier,
  url,
  token,
}: {
  identifier: string;
  url: string;
  token: string;
}) {
  const { apiKey, from } = assertResendConfigured();
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const email = buildMagicLoginEmail({ identifier, url, token });

  const { error } = await resend.emails.send({
    from,
    to: normalizeAuthEmail(identifier),
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send the sign-in email via Resend.');
  }
}