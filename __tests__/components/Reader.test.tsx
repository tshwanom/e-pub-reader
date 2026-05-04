'use client';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reader from '@/components/Reader';

// ---------------------------------------------------------------------------
// Mock epubjs — the library is browser-only and uses XHR internally.
// We replace it with a minimal stub that mimics the API the Reader uses.
// ---------------------------------------------------------------------------
const mockDisplay = jest.fn().mockResolvedValue(undefined);
const mockPrev = jest.fn();
const mockNext = jest.fn();
const mockDestroy = jest.fn();
const mockThemesSelect = jest.fn();
const mockThemesFontSize = jest.fn();
const mockThemesRegister = jest.fn();
const mockOn = jest.fn();
const mockAnnotationsHighlight = jest.fn();

const mockRendition = {
  display: mockDisplay,
  prev: mockPrev,
  next: mockNext,
  destroy: mockDestroy,
  themes: {
    select: mockThemesSelect,
    fontSize: mockThemesFontSize,
    register: mockThemesRegister,
  },
  on: mockOn,
  annotations: { highlight: mockAnnotationsHighlight },
};

const mockRenderTo = jest.fn().mockReturnValue(mockRendition);
const mockBookNavigation = { toc: [] };

jest.mock('epubjs', () =>
  jest.fn(() => ({
    renderTo: mockRenderTo,
    navigation: mockBookNavigation,
  }))
);

// Mock global fetch for the epub file and API calls
const epubArrayBuffer = new ArrayBuffer(8);

global.fetch = jest.fn((url: string) => {
  if (typeof url === 'string' && url.includes('/file')) {
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(epubArrayBuffer),
    } as Response);
  }
  if (typeof url === 'string' && url.includes('highlights')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);
  }
  return Promise.resolve({ ok: false } as Response);
}) as jest.Mock;

// ---------------------------------------------------------------------------

const DEFAULT_PROPS = {
  url: '/api/books/test-book-id/file',
  bookId: 'test-book-id',
  initialLocation: null,
};

describe('Reader component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/file')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(epubArrayBuffer),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    }) as jest.Mock;
    mockDisplay.mockResolvedValue(undefined);
  });

  it('renders navigation controls', () => {
    render(<Reader {...DEFAULT_PROPS} />);
    expect(screen.getByText('← Previous')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
    expect(screen.getByText('Contents')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders font-size controls', () => {
    render(<Reader {...DEFAULT_PROPS} />);
    expect(screen.getByTitle('Decrease font size')).toBeInTheDocument();
    expect(screen.getByTitle('Increase font size')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders theme toggle buttons', () => {
    render(<Reader {...DEFAULT_PROPS} />);
    expect(screen.getByTitle('Light')).toBeInTheDocument();
    expect(screen.getByTitle('Dark')).toBeInTheDocument();
    expect(screen.getByTitle('Sepia')).toBeInTheDocument();
  });

  it('Previous/Next buttons start disabled until epub loads', () => {
    render(<Reader {...DEFAULT_PROPS} />);
    expect(screen.getByText('← Previous')).toBeDisabled();
    expect(screen.getByText('Next →')).toBeDisabled();
  });

  it('enables navigation after epub is ready', async () => {
    render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('← Previous')).not.toBeDisabled();
    });
    expect(screen.getByText('Next →')).not.toBeDisabled();
  });

  it('fetches the epub file as ArrayBuffer (not as a directory)', async () => {
    render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/books/test-book-id/file'));
    // Ensure it did NOT attempt to fetch META-INF/container.xml
    const calls = (global.fetch as jest.Mock).mock.calls.map(c => c[0] as string);
    expect(calls.some(u => u.includes('META-INF'))).toBe(false);
  });

  it('calls renderTo with paginated flow', async () => {
    render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockRenderTo).toHaveBeenCalled());
    const options = mockRenderTo.mock.calls[0][1];
    expect(options.flow).toBe('paginated');
  });

  it('displays book at initialLocation when provided', async () => {
    const location = 'epubcfi(/6/4!/4/2/2/1:0)';
    render(<Reader {...DEFAULT_PROPS} initialLocation={location} />);
    await waitFor(() => expect(mockDisplay).toHaveBeenCalledWith(location));
  });

  it('displays book at beginning when no initialLocation', async () => {
    render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockDisplay).toHaveBeenCalledWith());
  });

  it('shows TOC sidebar when Contents button is clicked', async () => {
    const user = userEvent.setup();
    render(<Reader {...DEFAULT_PROPS} />);
    await user.click(screen.getByText('Contents'));
    expect(screen.getByText('Table of Contents')).toBeVisible();
  });

  it('changes theme when a theme button is clicked', async () => {
    const user = userEvent.setup();
    render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockThemesSelect).toHaveBeenCalled());
    mockThemesSelect.mockClear();
    await user.click(screen.getByTitle('Dark'));
    expect(mockThemesSelect).toHaveBeenCalledWith('dark');
  });

  it('changes font size when A+ is clicked', async () => {
    const user = userEvent.setup();
    render(<Reader {...DEFAULT_PROPS} />);
    await user.click(screen.getByTitle('Increase font size'));
    expect(screen.getByText('110%')).toBeInTheDocument();
  });

  it('decreases font size when A- is clicked', async () => {
    const user = userEvent.setup();
    render(<Reader {...DEFAULT_PROPS} />);
    await user.click(screen.getByTitle('Decrease font size'));
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('does not fetch epub when fetch returns error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 } as Response) as jest.Mock;
    // Should not throw — just log to console
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    consoleError.mockRestore();
  });

  it('calls rendition.destroy on unmount', async () => {
    const { unmount } = render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockDisplay).toHaveBeenCalled());
    unmount();
    expect(mockDestroy).toHaveBeenCalled();
  });
});
