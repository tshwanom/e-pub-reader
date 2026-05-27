'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import _ReactPlayer from 'react-player';
const ReactPlayer = _ReactPlayer as any;
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react';
import { getVimeoVideoId, getYouTubeVideoId, normalizeVideoUrl } from '@/lib/video-source';

interface OMRVideoPlayerProps {
  url: string;
  title?: string;
  className?: string;
  posterUrl?: string | null;
}

function getPlaybackErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'We could not load this video inside the library player yet.';
}

export default function OMRVideoPlayer({ url, title, className = '', posterUrl = null }: OMRVideoPlayerProps) {
  const [hasWindow, setHasWindow] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [didStartPlayback, setDidStartPlayback] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanUrl = useMemo(() => normalizeVideoUrl(url), [url]);
  const youTubeVideoId = useMemo(() => getYouTubeVideoId(cleanUrl), [cleanUrl]);
  const vimeoVideoId = useMemo(() => getVimeoVideoId(cleanUrl), [cleanUrl]);
  const isEmbeddedProvider = Boolean(youTubeVideoId || vimeoVideoId);
  const shouldUseCustomControls = !isEmbeddedProvider;
  const effectiveMuted = muted || autoplayMuted;
  const hostedEmbedUrl = useMemo(() => {
    if (youTubeVideoId) {
      const params = new URLSearchParams({
        autoplay: '0',
        controls: '1',
        rel: '0',
        modestbranding: '1',
        playsinline: '1',
      });

      return `https://www.youtube-nocookie.com/embed/${youTubeVideoId}?${params.toString()}`;
    }

    if (vimeoVideoId) {
      const params = new URLSearchParams({
        autoplay: '0',
        byline: '0',
        portrait: '0',
        title: '0',
        dnt: '1',
      });

      return `https://player.vimeo.com/video/${vimeoVideoId}?${params.toString()}`;
    }

    return null;
  }, [youTubeVideoId, vimeoVideoId]);

  useEffect(() => {
    setPlaying(false);
    setPlayed(0);
    setDuration(0);
    setAutoplayMuted(false);
    setIsReady(false);
    setIsBuffering(false);
    setShowControls(true);
    setDidStartPlayback(false);
    setHasEnded(false);
    setPlaybackError(null);
  }, [cleanUrl]);

  useEffect(() => {
    setHasWindow(true);
    
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const handlePlayPause = () => {
    if (playbackError) {
      return;
    }

    const nextPlaying = !playing;

    if (nextPlaying) {
      if (isEmbeddedProvider && !didStartPlayback && !muted) {
        setAutoplayMuted(true);
      }

      setDidStartPlayback(true);
      setHasEnded(false);
    }

    setPlaying(nextPlaying);
  };

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const mediaElement = event.currentTarget;
    const nextDuration = Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0;
    const currentTime = Number.isFinite(mediaElement.currentTime) ? mediaElement.currentTime : 0;

    if (nextDuration > 0) {
      setDuration(nextDuration);
      setPlayed(currentTime / nextDuration);
      return;
    }

    setPlayed(0);
  };

  const handleDurationChange = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const nextDuration = event.currentTarget.duration;
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseFloat(e.target.value);

    setAutoplayMuted(false);
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };

  const handleToggleMuted = () => {
    if (autoplayMuted) {
      setAutoplayMuted(false);
      setMuted(false);
      return;
    }

    setMuted(!muted);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlayed(parseFloat(e.target.value));
  };

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    if (playerRef.current) {
      playerRef.current.seekTo(parseFloat((e.target as HTMLInputElement).value));
      setPlaying(true);
      setDidStartPlayback(true);
      setHasEnded(false);
    }
  };

  const handleToggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh) {
      return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const handleMouseLeave = () => {
    if (playing) {
      setShowControls(false);
    }
  };

  if (!hasWindow) {
    return (
      <div className={`relative flex items-center justify-center bg-black ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-landing-accent" />
      </div>
    );
  }

  if (hostedEmbedUrl) {
    return (
      <div
        ref={playerContainerRef}
        className={`group relative isolate flex items-center justify-center overflow-hidden rounded-[24px] bg-black ${className}`}
      >
        <iframe
          src={hostedEmbedUrl}
          title={title || 'Embedded video player'}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  const shouldShowPosterOverlay = shouldUseCustomControls && (!didStartPlayback || hasEnded);
  const shouldShowPausedPlayOverlay = shouldUseCustomControls && isReady && !playing && !shouldShowPosterOverlay && !playbackError;
  const shouldShowLoadingOverlay = shouldUseCustomControls && didStartPlayback && (!isReady || isBuffering) && !playbackError;
  const shouldShowControlsBar = shouldUseCustomControls && !playbackError && !shouldShowPosterOverlay && (showControls || !playing);

  return (
    <div 
      ref={playerContainerRef}
      className={`group relative isolate flex items-center justify-center overflow-hidden rounded-[24px] bg-black ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        if (shouldUseCustomControls && (isReady || shouldShowPosterOverlay) && !playbackError) {
          handlePlayPause();
        }
      }}
    >
      <div
        className={`${isEmbeddedProvider ? 'pointer-events-auto' : 'pointer-events-none'} absolute inset-0 z-0 transition-opacity duration-300 ${
          shouldShowPosterOverlay || playbackError ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <ReactPlayer
          ref={playerRef}
          src={cleanUrl}
          width="100%"
          height="100%"
          playing={shouldUseCustomControls ? playing : false}
          volume={volume}
          muted={shouldUseCustomControls ? effectiveMuted : muted}
          playsInline
          controls={false}
          onReady={() => {
            setIsReady(true);
            setPlaybackError(null);
          }}
          onPlay={() => {
            setPlaying(true);
            setDidStartPlayback(true);
            setHasEnded(false);
            setPlaybackError(null);
            setIsBuffering(false);
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onEnded={() => {
            setPlaying(false);
            setHasEnded(true);
          }}
          onError={(error: unknown) => {
            console.error('Video playback error:', error);
            setPlaybackError(getPlaybackErrorMessage(error));
            setPlaying(false);
            setIsBuffering(false);
          }}
          config={{
            youtube: {
              controls: 0,
              rel: 0,
              modestbranding: 1,
              iv_load_policy: 3,
              fs: 0,
              playsinline: 1,
            },
            vimeo: {
              controls: false,
              byline: false,
              portrait: false,
              title: false,
              dnt: true,
              watch_full_video: false,
              vimeo_logo: false,
            }
          } as any}
          style={{ pointerEvents: isEmbeddedProvider ? 'auto' : 'none' }}
        />
      </div>

      {shouldShowLoadingOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px]">
          <Loader2 className="h-10 w-10 animate-spin text-landing-accent" />
        </div>
      )}

      {((shouldShowPosterOverlay && shouldUseCustomControls) || playbackError) && (
        <div className="absolute inset-0 z-10 overflow-hidden">
          {posterUrl ? (
            <img src={posterUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.45),rgba(15,23,42,0.95)_65%)]" />
          )}

          <div className="absolute inset-0 bg-slate-950/40" />

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
            {playbackError ? (
              <>
                <p className="max-w-sm text-sm font-medium leading-6 text-white/90">
                  {playbackError}
                </p>
                <p className="text-xs uppercase tracking-[0.16em] text-white/60">
                  This source needs a stream-ready video URL for inline playback.
                </p>
              </>
            ) : (
              <button
                aria-label={hasEnded ? 'Replay video' : 'Play video'}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/14 text-white shadow-[0_16px_40px_-18px_rgba(15,23,42,0.95)] backdrop-blur-md transition-transform hover:scale-105"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayPause();
                }}
              >
                <Play className="ml-1 h-8 w-8" fill="currentColor" />
              </button>
            )}
          </div>
        </div>
      )}

      {shouldShowPausedPlayOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/30">
          <button 
            className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-landing-accent text-white shadow-[0_16px_40px_-18px_rgba(61,115,122,0.95)] transition-transform hover:scale-105"
            onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
          >
            <Play className="ml-1 h-8 w-8" fill="currentColor" />
          </button>
        </div>
      )}

      {shouldUseCustomControls ? (
        <div 
          className={`absolute inset-x-3 bottom-3 z-20 flex flex-col rounded-2xl border border-white/10 bg-slate-950/68 p-3 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.95)] backdrop-blur-xl transition-opacity duration-300 ${shouldShowControlsBar ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="group/progress flex h-4 cursor-pointer items-center">
            <input
              type="range"
              min={0}
              max={0.999999}
              step="any"
              value={played}
              onMouseDown={() => setPlaying(false)}
              onChange={handleSeekChange}
              onMouseUp={handleSeekMouseUp}
              className="w-full cursor-pointer accent-landing-accent"
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={handlePlayPause}
                className="text-white transition-colors hover:text-landing-accent"
              >
                {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6" fill="currentColor" />}
              </button>
              
              <div className="group/volume flex items-center gap-2">
                <button 
                  onClick={handleToggleMuted}
                  className="text-white transition-colors hover:text-landing-accent"
                >
                  {effectiveMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step="any"
                  value={effectiveMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 opacity-0 transition-all group-hover/volume:w-20 group-hover/volume:opacity-100 accent-landing-accent"
                />
              </div>
              
              <div className="text-sm font-medium text-white/90">
                {formatTime(played * duration)} / {formatTime(duration)}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleToggleFullscreen}
                className="text-white transition-colors hover:text-landing-accent"
              >
                <Maximize className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
