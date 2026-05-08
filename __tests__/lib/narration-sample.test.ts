const {
  splitTextIntoNarrationSentences,
  buildSampleNarrationCueTimeline,
} = require('../../lib/narration-sample');

describe('narration sample helpers', () => {
  it('splits narrative text into multiple sentence cues', () => {
    expect(
      splitTextIntoNarrationSentences(
        'The pages before you unmask a reality so pervasive that it remains nearly invisible. This is not merely a book. It is a revelation.'
      )
    ).toEqual([
      'The pages before you unmask a reality so pervasive that it remains nearly invisible.',
      'This is not merely a book.',
      'It is a revelation.',
    ]);
  });

  it('builds sequential sentence-level cue timings across the sample duration', () => {
    const cues = buildSampleNarrationCueTimeline({
      text: 'The pages before you unmask a reality so pervasive that it remains nearly invisible. This is not merely a book. It is a revelation. A narrative about a prison with no walls.',
      targetHref: '5_foreword.xhtml',
      targetElementId: null,
      targetCfi: null,
      durationMs: 6000,
      maxCueCount: 4,
    });

    expect(cues).toHaveLength(4);
    expect(cues[0]).toMatchObject({
      sequence: 0,
      startMs: 0,
      targetHref: '5_foreword.xhtml',
      targetElementId: null,
      targetCfi: null,
    });
    expect(cues.at(-1)?.endMs).toBe(6000);
    expect(cues.map((cue: any) => cue.sequence)).toEqual([0, 1, 2, 3]);
    expect(
      cues.every(
        (cue: any, index: number) => cue.endMs > cue.startMs && (index === 0 || cue.startMs === cues[index - 1].endMs)
      )
    ).toBe(true);
    expect(cues.map((cue: any) => cue.excerpt)).toEqual([
      'The pages before you unmask a reality so pervasive that it remains nearly invisible.',
      'This is not merely a book.',
      'It is a revelation.',
      'A narrative about a prison with no walls.',
    ]);
  });
});
