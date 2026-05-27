import { extractVideoChapters, parseVideoTimestampToSeconds } from '@/lib/video-chapters';

describe('video chapter helpers', () => {
  it('parses mm:ss and hh:mm:ss timestamps into seconds', () => {
    expect(parseVideoTimestampToSeconds('02:15')).toBe(135);
    expect(parseVideoTimestampToSeconds('1:02:15')).toBe(3735);
  });

  it('extracts timestamped chapter lines from long-form text', () => {
    expect(
      extractVideoChapters([
        '00:00 Opening overview',
        '02:15 - The first turning point',
        'Not a timestamped line',
        '[10:05] Final reflection',
      ].join('\n'))
    ).toEqual([
      { id: 'chapter-00-00', timestamp: '00:00', label: 'Opening overview', seconds: 0 },
      { id: 'chapter-02-15', timestamp: '02:15', label: 'The first turning point', seconds: 135 },
      { id: 'chapter-10-05', timestamp: '10:05', label: 'Final reflection', seconds: 605 },
    ]);
  });
});