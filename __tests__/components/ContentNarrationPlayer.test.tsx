import { render, screen, waitFor } from '@testing-library/react';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';

describe('ContentNarrationPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a compact donor badge when narration is reserved for donors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        available: false,
        reason: 'donor-required',
        message: 'Due to the cost of running narration, this feature is reserved for donors only.',
        voices: [],
      }),
    } as Response) as jest.Mock;

    render(<ContentNarrationPlayer contentId="content-1" compact />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/content/content-1/narration', { cache: 'no-store' });
    });

    expect(await screen.findByText('Donor narration')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('keeps the compact player hidden when narration is not generated yet', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        available: false,
        reason: 'not-generated',
        message: 'Narration is not available yet.',
        voices: [],
      }),
    } as Response) as jest.Mock;

    const { container } = render(<ContentNarrationPlayer contentId="content-1" compact />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/content/content-1/narration', { cache: 'no-store' });
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('shows the donor lock message on the full player when access is required', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        available: false,
        reason: 'sign-in-required',
        message: 'Due to the cost of running narration, this feature is reserved for donors only. Sign in to unlock it with your donation.',
        voices: [],
      }),
    } as Response) as jest.Mock;

    render(<ContentNarrationPlayer contentId="content-1" />);

    expect(await screen.findByText(/reserved for donors only/i)).toBeInTheDocument();
  });

  it('renders donor narration audio when a donor-ready voice is returned', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        available: true,
        reason: 'ready',
        message: 'Donor narration for “The Fire Inside” is ready to play.',
        defaultVoiceSlug: 'classic-narrator',
        voices: [
          {
            narrationId: 'narration-1',
            active: true,
            durationMs: 91000,
            audioMimeType: 'audio/mpeg',
            audioUrl: 'https://signed.example/narration/content-1/classic/track.mp3',
            voice: {
              id: 'voice-1',
              name: 'Classic Narrator',
              slug: 'classic-narrator',
              provider: 'manual-seed',
              language: 'en',
            },
          },
        ],
      }),
    } as Response) as jest.Mock;

    const { container } = render(<ContentNarrationPlayer contentId="content-1" />);

    expect(await screen.findByText('Donor narration')).toBeInTheDocument();
    expect(screen.getByText(/Classic Narrator/i)).toBeInTheDocument();
    expect(container.querySelector('audio')?.getAttribute('src')).toBe(
      'https://signed.example/narration/content-1/classic/track.mp3'
    );
  });
});
