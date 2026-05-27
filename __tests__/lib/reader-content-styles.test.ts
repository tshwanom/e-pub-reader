import {
  applyReaderContentStyles,
  isProbablyFullBleedCoverDocument,
} from '@/lib/reader-content-styles';

describe('reader content styles', () => {
  it('marks image-only pages as full-bleed covers', () => {
    const doc = document.implementation.createHTMLDocument('cover');
    doc.body.innerHTML = '<div style="padding: 24px;"><img src="/cover.jpg" alt="Cover" /></div>';

    expect(isProbablyFullBleedCoverDocument(doc)).toBe(true);

    applyReaderContentStyles(doc);

    const image = doc.querySelector('img') as HTMLImageElement | null;

    expect(doc.body.getAttribute('data-omr-full-bleed-cover')).toBe('true');
    expect(image).not.toBeNull();
    expect(image?.style.getPropertyValue('object-fit')).toBe('cover');
    expect(image?.style.getPropertyPriority('object-fit')).toBe('important');
  });

  it('keeps text-heavy reading pages out of full-bleed cover mode', () => {
    const doc = document.implementation.createHTMLDocument('chapter');
    doc.body.innerHTML = `
      <article>
        <h1>Chapter One</h1>
        <p>This chapter contains enough real reading text that it should not be treated like a cover page.</p>
      </article>
    `;

    expect(isProbablyFullBleedCoverDocument(doc)).toBe(false);

    applyReaderContentStyles(doc);

    expect(doc.body.hasAttribute('data-omr-full-bleed-cover')).toBe(false);
    expect(doc.head.querySelector('#omr-reader-content-style')).not.toBeNull();
  });

  it('still applies styles when the document uses a different global element constructor', () => {
    const doc = document.implementation.createHTMLDocument('iframe-cover');
    doc.body.innerHTML = '<div><img src="/cover.jpg" alt="Iframe cover" /></div>';

    const originalHTMLElement = (global as typeof globalThis & { HTMLElement: typeof HTMLElement }).HTMLElement;
    const originalSVGElement = (global as typeof globalThis & { SVGElement: typeof SVGElement }).SVGElement;

    (global as typeof globalThis & { HTMLElement: typeof HTMLElement }).HTMLElement = class FakeHTMLElement extends originalHTMLElement {};
    (global as typeof globalThis & { SVGElement: typeof SVGElement }).SVGElement = class FakeSVGElement extends originalSVGElement {};

    try {
      applyReaderContentStyles(doc);
    } finally {
      (global as typeof globalThis & { HTMLElement: typeof HTMLElement }).HTMLElement = originalHTMLElement;
      (global as typeof globalThis & { SVGElement: typeof SVGElement }).SVGElement = originalSVGElement;
    }

    const image = doc.querySelector('img') as HTMLImageElement | null;

    expect(doc.body.getAttribute('data-omr-full-bleed-cover')).toBe('true');
    expect(image?.style.getPropertyValue('object-fit')).toBe('cover');
    expect(image?.style.getPropertyPriority('object-fit')).toBe('important');
  });
});
