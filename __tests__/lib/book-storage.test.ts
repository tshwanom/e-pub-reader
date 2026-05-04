import { getBookUploadFilename } from '@/lib/book-storage';

// resolveStoredBookFilePath uses fs - we test it with mocked fs
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));

const mockFs = jest.requireMock('fs/promises') as {
  access: jest.MockedFunction<typeof import('fs/promises').access>;
};

describe('getBookUploadFilename', () => {
  it('extracts filename from a simple path', () => {
    expect(getBookUploadFilename('/uploads/my-book.epub')).toBe('my-book.epub');
  });

  it('handles filenames with double underscores', () => {
    expect(getBookUploadFilename('/uploads/1777890542405-the-captured-soul__1_.epub')).toBe(
      '1777890542405-the-captured-soul__1_.epub'
    );
  });

  it('handles deep nested paths', () => {
    expect(getBookUploadFilename('/a/b/c/book.epub')).toBe('book.epub');
  });

  it('throws when fileUrl has no path segments', () => {
    expect(() => getBookUploadFilename('')).toThrow('Book file URL is missing a filename');
  });
});

describe('resolveStoredBookFilePath', () => {
  const { resolveStoredBookFilePath } = jest.requireActual('@/lib/book-storage') as typeof import('@/lib/book-storage');

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns private path when the file exists in storage/uploads', async () => {
    mockFs.access.mockResolvedValueOnce(undefined); // private path exists
    const result = await resolveStoredBookFilePath('/uploads/book.epub');
    expect(result).toContain('storage');
    expect(result).toContain('book.epub');
  });

  it('falls back to public/uploads when private path is missing', async () => {
    mockFs.access
      .mockRejectedValueOnce(new Error('ENOENT')) // private path missing
      .mockResolvedValueOnce(undefined);           // public path exists
    const result = await resolveStoredBookFilePath('/uploads/book.epub');
    expect(result).toContain('public');
    expect(result).toContain('book.epub');
  });

  it('throws when file is not found in either location', async () => {
    mockFs.access
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockRejectedValueOnce(new Error('ENOENT'));
    await expect(resolveStoredBookFilePath('/uploads/missing.epub')).rejects.toThrow(
      'Stored book file not found'
    );
  });
});
