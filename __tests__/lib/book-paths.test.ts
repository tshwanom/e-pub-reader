import {
  getBookPath,
  getBookReadPath,
  getBookRouteIdentifier,
  slugifyBookTitle,
} from '@/lib/book-paths';

describe('book path helpers', () => {
  it('prefers a slug over the database id for public book routes', () => {
    const book = {
      id: 'cmpf49lyq0000kht8aq104cwc',
      slug: 'your-born-to-live-not-to-act',
    };

    expect(getBookRouteIdentifier(book)).toBe('your-born-to-live-not-to-act');
    expect(getBookPath(book)).toBe('/books/your-born-to-live-not-to-act');
    expect(getBookReadPath(book)).toBe('/read/your-born-to-live-not-to-act');
  });

  it('falls back to the id when a slug is missing or blank', () => {
    expect(getBookPath({ id: 'book-123', slug: null })).toBe('/books/book-123');
    expect(getBookReadPath({ id: 'book-123', slug: '   ' })).toBe('/read/book-123');
  });

  it('creates clean SEO-friendly slugs from book titles', () => {
    expect(slugifyBookTitle('Your Born To Live, Not To Act!')).toBe('your-born-to-live-not-to-act');
    expect(slugifyBookTitle('')).toBe('book');
  });
});
