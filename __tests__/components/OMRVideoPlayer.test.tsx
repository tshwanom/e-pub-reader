import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import OMRVideoPlayer from '@/components/OMRVideoPlayer';

const mockReactPlayer = jest.fn((props: Record<string, unknown>) => (
  <div
    data-testid="mock-react-player"
    data-src={typeof props.src === 'string' ? props.src : ''}
    data-url={typeof props.url === 'string' ? props.url : ''}
  />
));

jest.mock('react-player', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockReactPlayer(props),
}));

describe('OMRVideoPlayer', () => {
  beforeEach(() => {
    mockReactPlayer.mockClear();
  });

  it('normalizes YouTube URLs into a stable embed iframe source', async () => {
    render(
      <OMRVideoPlayer
        url="https://www.youtube.com/embed/mU0HKpYVppE?si=test"
        title="Test video"
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Test video')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Test video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/mU0HKpYVppE?autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1'
    );
  });

  it('keeps direct-file playback on the custom overlay controls', async () => {
    render(
      <OMRVideoPlayer
        url="https://cdn.example.com/videos/test-video.mp4"
        title="Test video"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /play video/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /play video/i }));

    await waitFor(() => {
      const lastCall = mockReactPlayer.mock.calls[mockReactPlayer.mock.calls.length - 1]?.[0] as Record<string, unknown> | undefined;

      expect(lastCall?.playing).toBe(true);
      expect(lastCall?.controls).toBe(false);
    });
  });

  it('renders hosted-provider videos as direct embed iframes instead of the custom play overlay', async () => {
    render(
      <OMRVideoPlayer
        url="https://vimeo.com/123456789"
        title="Vimeo test"
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Vimeo test')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /play video/i })).not.toBeInTheDocument();
    expect(screen.getByTitle('Vimeo test')).toHaveAttribute(
      'src',
      'https://player.vimeo.com/video/123456789?autoplay=0&byline=0&portrait=0&title=0&dnt=1'
    );
    expect(screen.queryByTestId('mock-react-player')).not.toBeInTheDocument();
  });
});