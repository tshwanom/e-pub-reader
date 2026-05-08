function normalizeNarrationSampleText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([([{"“‘])\s+/g, '$1')
    .replace(/\s+([)\]}"”’])/g, '$1')
    .trim();
}

function splitTextIntoNarrationSentences(text) {
  const normalizedText = normalizeNarrationSampleText(text);

  if (!normalizedText) {
    return [];
  }

  let sentences = [];

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    sentences = Array.from(segmenter.segment(normalizedText), (segment) => normalizeNarrationSampleText(segment.segment));
  }

  if (sentences.length === 0) {
    sentences = (normalizedText.match(/[^.!?]+[.!?]+(?:["'”’]+)?|[^.!?]+$/g) || [])
      .map((segment) => normalizeNarrationSampleText(segment));
  }

  return [...new Set(sentences.filter(Boolean))];
}

function countNarrationWords(text) {
  return normalizeNarrationSampleText(text).split(' ').filter(Boolean).length;
}

function selectNarrationCueSentences(sentences, maxCueCount) {
  if (sentences.length <= maxCueCount) {
    return sentences;
  }

  return sentences.slice(0, maxCueCount);
}

function buildSampleNarrationCueTimeline({
  text,
  targetHref,
  targetElementId = null,
  targetCfi = null,
  durationMs,
  maxCueCount = 5,
}) {
  const normalizedText = normalizeNarrationSampleText(text);

  if (!normalizedText || !targetHref || !Number.isFinite(durationMs) || durationMs <= 0) {
    return [];
  }

  const sentences = splitTextIntoNarrationSentences(normalizedText);
  const cueTexts = selectNarrationCueSentences(
    sentences.length > 0 ? sentences : [normalizedText],
    Math.max(1, maxCueCount)
  );

  const weights = cueTexts.map((cueText) => Math.max(1, countNarrationWords(cueText)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const minimumCueDurationMs = Math.min(
    1000,
    Math.max(450, Math.floor(durationMs / Math.max(cueTexts.length * 2, 1)))
  );

  let consumedWeight = 0;
  let startMs = 0;

  return cueTexts.map((cueText, index) => {
    consumedWeight += weights[index];

    let endMs;
    if (index === cueTexts.length - 1) {
      endMs = durationMs;
    } else {
      const remainingCueCount = cueTexts.length - index - 1;
      const suggestedEnd = Math.round((consumedWeight / totalWeight) * durationMs);
      const minEnd = startMs + minimumCueDurationMs;
      const maxEnd = durationMs - remainingCueCount * minimumCueDurationMs;
      endMs = Math.min(Math.max(suggestedEnd, minEnd), maxEnd);
    }

    const cue = {
      sequence: index,
      startMs,
      endMs,
      targetHref,
      targetElementId,
      targetCfi,
      excerpt: cueText,
    };

    startMs = endMs;
    return cue;
  });
}

module.exports = {
  normalizeNarrationSampleText,
  splitTextIntoNarrationSentences,
  buildSampleNarrationCueTimeline,
};
