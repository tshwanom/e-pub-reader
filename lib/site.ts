const PUBLIC_SITE_URL_ENV_KEYS = [
  'APP_URL',
  'SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXTAUTH_URL',
] as const;

function toOrigin(value?: string | null) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return null;
  }
}

export function getSiteOrigin() {
  for (const envKey of PUBLIC_SITE_URL_ENV_KEYS) {
    const origin = toOrigin(process.env[envKey]);

    if (origin) {
      return origin;
    }
  }

  return 'https://1manrevolution.com';
}

export function getSiteUrl(pathname = '/') {
  return new URL(pathname, getSiteOrigin());
}

export function getAbsoluteSiteAssetUrl(assetUrl?: string | null, fallbackPath = '/logo.png') {
  const trimmedAssetUrl = assetUrl?.trim();
  const target = trimmedAssetUrl && trimmedAssetUrl.length > 0 ? trimmedAssetUrl : fallbackPath;

  try {
    return new URL(target).toString();
  } catch {
    const normalizedPath = target.startsWith('/') ? target : `/${target}`;
    return new URL(normalizedPath, getSiteOrigin()).toString();
  }
}