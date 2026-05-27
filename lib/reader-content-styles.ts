const READER_CONTENT_STYLE_ID = 'omr-reader-content-style';
const READER_FULL_BLEED_COVER_ATTRIBUTE = 'data-omr-full-bleed-cover';
const READER_MEDIA_SELECTOR = 'img, svg';

function setImportantStyle(node: Element | null, property: string, value: string) {
  const style = (node as (Element & { style?: { setProperty?: (property: string, value: string, priority?: string) => void } }) | null)?.style;

  if (!node || typeof style?.setProperty !== 'function') {
    return;
  }

  style.setProperty(property, value, 'important');
}

function getMeaningfulTextLength(doc: Document) {
  return String(doc.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .length;
}

function ensureReaderContentStyleSheet(doc: Document) {
  if (!doc.head || doc.getElementById(READER_CONTENT_STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = READER_CONTENT_STYLE_ID;
  style.textContent = `
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      min-height: 100% !important;
    }

    body {
      box-sizing: border-box !important;
    }

    body[${READER_FULL_BLEED_COVER_ATTRIBUTE}="true"] {
      overflow: hidden !important;
      background: transparent !important;
    }

    body[${READER_FULL_BLEED_COVER_ATTRIBUTE}="true"] img,
    body[${READER_FULL_BLEED_COVER_ATTRIBUTE}="true"] svg {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: cover !important;
      margin: 0 !important;
    }
  `;

  doc.head.appendChild(style);
}

function getPrimaryMediaElement(doc: Document) {
  return doc.body?.querySelector(READER_MEDIA_SELECTOR) ?? null;
}

export function isProbablyFullBleedCoverDocument(doc?: Document | null) {
  if (!doc?.body) {
    return false;
  }

  const mediaElements = doc.body.querySelectorAll(READER_MEDIA_SELECTOR);

  if (mediaElements.length === 0) {
    return false;
  }

  const interactiveElements = doc.body.querySelectorAll('a, button, input, textarea, select, video, audio');
  const readingElements = doc.body.querySelectorAll('p, li, blockquote, article, section, ol, ul, table');
  const meaningfulTextLength = getMeaningfulTextLength(doc);

  return interactiveElements.length === 0
    && readingElements.length === 0
    && meaningfulTextLength <= 80;
}

export function applyReaderContentStyles(doc?: Document | null) {
  if (!doc?.body) {
    return;
  }

  ensureReaderContentStyleSheet(doc);

  setImportantStyle(doc.documentElement, 'margin', '0');
  setImportantStyle(doc.documentElement, 'padding', '0');
  setImportantStyle(doc.documentElement, 'width', '100%');
  setImportantStyle(doc.documentElement, 'height', '100%');
  setImportantStyle(doc.body, 'margin', '0');
  setImportantStyle(doc.body, 'padding', '0');
  setImportantStyle(doc.body, 'width', '100%');
  setImportantStyle(doc.body, 'height', '100%');
  setImportantStyle(doc.body, 'max-width', 'none');

  doc.body.removeAttribute(READER_FULL_BLEED_COVER_ATTRIBUTE);

  if (!isProbablyFullBleedCoverDocument(doc)) {
    return;
  }

  const primaryMediaElement = getPrimaryMediaElement(doc);

  if (!primaryMediaElement) {
    return;
  }

  doc.body.setAttribute(READER_FULL_BLEED_COVER_ATTRIBUTE, 'true');
  setImportantStyle(doc.body, 'overflow', 'hidden');
  setImportantStyle(doc.body, 'background', 'transparent');

  let currentNode: Element | null = primaryMediaElement;

  while (currentNode && currentNode !== doc.body) {
    setImportantStyle(currentNode, 'width', '100%');
    setImportantStyle(currentNode, 'height', '100%');
    setImportantStyle(currentNode, 'max-width', 'none');
    setImportantStyle(currentNode, 'max-height', 'none');
    setImportantStyle(currentNode, 'margin', '0');
    setImportantStyle(currentNode, 'padding', '0');
    setImportantStyle(currentNode, 'display', 'block');
    currentNode = currentNode.parentElement;
  }

  setImportantStyle(primaryMediaElement, 'width', '100%');
  setImportantStyle(primaryMediaElement, 'height', '100%');
  setImportantStyle(primaryMediaElement, 'max-width', 'none');
  setImportantStyle(primaryMediaElement, 'max-height', 'none');
  setImportantStyle(primaryMediaElement, 'display', 'block');
  setImportantStyle(primaryMediaElement, 'object-fit', 'cover');
}