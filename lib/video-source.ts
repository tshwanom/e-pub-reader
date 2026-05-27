const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

const VIMEO_HOSTS = new Set([
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
]);

export type CleanPlayerVideoSourceIssue = {
  provider: 'youtube' | 'vimeo';
  message: string;
};

export function getHostedVideoProvider(url?: string | null) {
  if (getYouTubeVideoId(url)) {
    return 'youtube' as const;
  }

  if (getVimeoVideoId(url)) {
    return 'vimeo' as const;
  }

  return null;
}

export function normalizeVideoUrl(url: string) {
  const trimmedUrl = url.trim();

  try {
    const parsedUrl = new URL(trimmedUrl);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    if ((hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') && parsedUrl.pathname.startsWith('/embed/')) {
      const videoId = parsedUrl.pathname.split('/embed/')[1]?.split('/')[0];
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : trimmedUrl;
    }

    if ((hostname === 'youtube.com' || hostname === 'm.youtube.com') && (parsedUrl.pathname.startsWith('/shorts/') || parsedUrl.pathname.startsWith('/live/'))) {
      const videoId = parsedUrl.pathname.split('/').filter(Boolean)[1];
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : trimmedUrl;
    }

    if (hostname === 'youtu.be') {
      const videoId = parsedUrl.pathname.replace(/^\//, '').split('/')[0];
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : trimmedUrl;
    }

    if (hostname === 'player.vimeo.com' && parsedUrl.pathname.startsWith('/video/')) {
      const videoId = parsedUrl.pathname.split('/video/')[1]?.split('/')[0];
      return videoId ? `https://vimeo.com/${videoId}` : trimmedUrl;
    }
  } catch {
    return trimmedUrl;
  }

  return trimmedUrl;
}

export function getYouTubeVideoId(url?: string | null) {
  if (!url) {
    return null;
  }

  const normalizedUrl = normalizeVideoUrl(url);

  try {
    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!Array.from(YOUTUBE_HOSTS).some((host) => hostname === host || hostname === `www.${host}`)) {
      return null;
    }

    if (hostname === 'youtu.be') {
      return parsedUrl.pathname.replace(/^\//, '').split('/')[0] || null;
    }

    return parsedUrl.searchParams.get('v');
  } catch {
    return null;
  }
}

export function getVimeoVideoId(url?: string | null) {
  if (!url) {
    return null;
  }

  const normalizedUrl = normalizeVideoUrl(url);

  try {
    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!Array.from(VIMEO_HOSTS).some((host) => hostname === host || hostname === `www.${host}`)) {
      return null;
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    const numericSegment = [...segments].reverse().find((segment) => /^\d+$/.test(segment));
    return numericSegment || null;
  } catch {
    return null;
  }
}

export function getCleanPlayerVideoSourceIssue(url?: string | null): CleanPlayerVideoSourceIssue | null {
  const provider = getHostedVideoProvider(url);

  if (provider === 'youtube') {
    return {
      provider: 'youtube',
      message: 'YouTube URLs are not supported in the clean in-library player. Upload the video directly or paste a direct stream/file URL instead.',
    };
  }

  if (provider === 'vimeo') {
    return {
      provider: 'vimeo',
      message: 'Vimeo URLs are not supported in the clean in-library player. Upload the video directly or paste a direct stream/file URL instead.',
    };
  }

  return null;
}

export function isCleanPlayerVideoSourceSupported(url?: string | null) {
  return getCleanPlayerVideoSourceIssue(url) === null;
}

export async function getVideoThumbnailUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  const normalizedUrl = normalizeVideoUrl(url);
  const youTubeVideoId = getYouTubeVideoId(normalizedUrl);

  if (youTubeVideoId) {
    return `https://i.ytimg.com/vi/${youTubeVideoId}/hqdefault.jpg`;
  }

  const vimeoVideoId = getVimeoVideoId(normalizedUrl);

  if (!vimeoVideoId) {
    return null;
  }

  try {
    const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalizedUrl)}`, {
      cache: 'force-cache',
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as { thumbnail_url?: string | null };
    return payload.thumbnail_url || null;
  } catch {
    return null;
  }
}

export async function resolveVideoCoverUrl({
  type,
  url,
  coverUrl,
}: {
  type: string;
  url?: string | null;
  coverUrl?: string | null;
}) {
  if (coverUrl?.trim()) {
    return coverUrl.trim();
  }

  if (type !== 'VIDEO') {
    return coverUrl || null;
  }

  return getVideoThumbnailUrl(url);
}

export function getVideoWatchPath(video: { id: string; slug?: string | null }) {
  const identifier = video.slug?.trim() || video.id;
  return `/videos/${identifier}`;
}