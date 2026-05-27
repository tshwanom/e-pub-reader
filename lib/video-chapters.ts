export type VideoChapter = {
  id: string;
  timestamp: string;
  label: string;
  seconds: number;
};

const TIMESTAMP_LINE_PATTERN = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?(?:\s*[-–—|•]\s*|\s+)(.+)$/;

export function parseVideoTimestampToSeconds(timestamp: string) {
  const segments = timestamp.split(':').map((segment) => Number(segment));

  if (segments.some((segment) => !Number.isFinite(segment))) {
    return null;
  }

  if (segments.length === 2) {
    const [minutes, seconds] = segments;
    return minutes * 60 + seconds;
  }

  if (segments.length === 3) {
    const [hours, minutes, seconds] = segments;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

export function extractVideoChapters(text?: string | null) {
  if (!text) {
    return [] as VideoChapter[];
  }

  const seenTimestamps = new Set<string>();

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(TIMESTAMP_LINE_PATTERN);

      if (!match) {
        return null;
      }

      const [, timestamp, rawLabel] = match;
      const seconds = parseVideoTimestampToSeconds(timestamp);
      const label = rawLabel.trim();

      if (seconds == null || !label) {
        return null;
      }

      if (seenTimestamps.has(timestamp)) {
        return null;
      }

      seenTimestamps.add(timestamp);

      return {
        id: `chapter-${timestamp.replace(/[^0-9]/g, '-')}`,
        timestamp,
        label,
        seconds,
      } satisfies VideoChapter;
    })
    .filter((chapter): chapter is VideoChapter => Boolean(chapter));
}