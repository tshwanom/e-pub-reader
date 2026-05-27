import {
  getCleanPlayerVideoSourceIssue,
  getHostedVideoProvider,
  getVideoThumbnailUrl,
  getVideoWatchPath,
  getVimeoVideoId,
  getYouTubeVideoId,
  isCleanPlayerVideoSourceSupported,
  normalizeVideoUrl,
} from '@/lib/video-source';

describe('video-source helpers', () => {
  it('normalizes YouTube embed URLs into watch URLs', () => {
    expect(normalizeVideoUrl('https://www.youtube.com/embed/mU0HKpYVppE?si=test')).toBe(
      'https://www.youtube.com/watch?v=mU0HKpYVppE'
    );
  });

  it('extracts YouTube ids from watch and short URLs', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=mU0HKpYVppE')).toBe('mU0HKpYVppE');
    expect(getYouTubeVideoId('https://youtu.be/mU0HKpYVppE')).toBe('mU0HKpYVppE');
  });

  it('extracts Vimeo ids from direct and player URLs', () => {
    expect(getVimeoVideoId('https://vimeo.com/123456789')).toBe('123456789');
    expect(getVimeoVideoId('https://player.vimeo.com/video/123456789')).toBe('123456789');
  });

  it('derives a YouTube thumbnail URL without remote fetches', async () => {
    await expect(getVideoThumbnailUrl('https://www.youtube.com/watch?v=mU0HKpYVppE')).resolves.toBe(
      'https://i.ytimg.com/vi/mU0HKpYVppE/hqdefault.jpg'
    );
  });

  it('builds a watch path from slug or id', () => {
    expect(getVideoWatchPath({ id: 'video-123', slug: 'truth-in-motion' })).toBe('/videos/truth-in-motion');
    expect(getVideoWatchPath({ id: 'video-123', slug: null })).toBe('/videos/video-123');
  });

  it('flags YouTube and Vimeo URLs as incompatible with the clean player', () => {
    expect(getCleanPlayerVideoSourceIssue('https://www.youtube.com/watch?v=mU0HKpYVppE')).toMatchObject({
      provider: 'youtube',
    });
    expect(getCleanPlayerVideoSourceIssue('https://vimeo.com/123456789')).toMatchObject({
      provider: 'vimeo',
    });
  });

  it('detects hosted providers without treating direct file URLs as provider embeds', () => {
    expect(getHostedVideoProvider('https://www.youtube.com/watch?v=mU0HKpYVppE')).toBe('youtube');
    expect(getHostedVideoProvider('https://vimeo.com/123456789')).toBe('vimeo');
    expect(getHostedVideoProvider('https://cdn.example.com/videos/truth-in-motion.mp4')).toBeNull();
  });

  it('allows direct file or upload URLs for the clean player', () => {
    expect(isCleanPlayerVideoSourceSupported('https://cdn.example.com/videos/truth-in-motion.mp4')).toBe(true);
    expect(isCleanPlayerVideoSourceSupported('https://utfs.io/f/clean-player-video')).toBe(true);
  });
});
