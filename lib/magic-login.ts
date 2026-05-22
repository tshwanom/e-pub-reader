import { normalizeAuthEmail } from '@/lib/auth-email';

export function buildMagicLoginCallbackUrl({
  email,
  token,
  callbackUrl,
}: {
  email: string;
  token: string;
  callbackUrl: string;
}) {
  return `/api/auth/callback/email?${new URLSearchParams({
    email: normalizeAuthEmail(email),
    token: token.trim(),
    callbackUrl,
  }).toString()}`;
}

export function redirectToMagicLoginCallback(url: string) {
  window.location.assign(url);
}