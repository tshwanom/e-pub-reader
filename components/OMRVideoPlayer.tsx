'use client';

import React, { useState, useRef, useEffect } from 'react';
import _ReactPlayer from 'react-player';
const ReactPlayer = _ReactPlayer as any;
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react';

interface OMRVideoPlayerProps {
  url: string;
  title?: string;
  className?: string;
}

export default function OMRVideoPlayer({ url, title, className = '' }: OMRVideoPlayerProps) {
  const [hasWindow, setHasWindow] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    setPlaying(!playing);
  };

  const handleProgress = (state: any) => {
    setPlayed(state.played);
  };

  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
    setMuted(parseFloat(e.target.value) === 0);
  };

  const handleToggleMuted = () => {
    setMuted(!muted);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlayed(parseFloat(e.target.value));
  };

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    if (playerRef.current) {
      playerRef.current.seekTo(parseFloat((e.target as HTMLInputElement).value));
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

  // Clean up url if it contains extra params for standard iframe
  let cleanUrl = url;
  if (cleanUrl.includes('youtube.com/embed/')) {
    cleanUrl = cleanUrl.replace('youtube.com/embed/', 'youtube.com/watch?v=');
  }

  return (
    <div 
      ref={playerContainerRef}
      className={`group relative flex items-center justify-center bg-black overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => { if (isReady) handlePlayPause(); }}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <ReactPlayer
          ref={playerRef}
          url={cleanUrl}
          width="100%"
          height="100%"
          playing={playing}
          volume={volume}
          muted={muted}
          controls={false}
          onReady={() => setIsReady(true)}
          onProgress={handleProgress}
          onDuration={handleDuration}
          onBuffer={() => setIsBuffering(true)}
          onBufferEnd={() => setIsBuffering(false)}
          onEnded={() => setPlaying(false)}
          config={{
            youtube: {
              playerVars: {
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                disablekb: 1,
                iv_load_policy: 3,
                fs: 0,
              }
            },
            vimeo: {
              playerOptions: {
                byline: false,
                portrait: false,
                title: false,
                dnt: true
              }
            }
          } as any}
          style={{ pointerEvents: 'none' }}
        />
      </div>

      {/* Loading overlay */}
      {(!isReady || isBuffering) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <Loader2 className="h-10 w-10 animate-spin text-landing-accent" />
        </div>
      )}

      {/* Big Play Button Overlay */}
      {isReady && !playing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/40">
          <button 
            className="flex h-16 w-16 items-center justify-center rounded-full bg-landing-accent text-white shadow-lg transition-transform hover:scale-105"
            onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
          >
            <Play className="ml-1 h-8 w-8" fill="currentColor" />
          </button>
        </div>
      )}

      {/* Custom Controls Bar */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 transition-opacity duration-300 ${
          showControls || !playing ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Bar */}
        <div className="group/progress flex h-4 cursor-pointer items-center">
          <input
            type="range"
            min={0}
            max={0.999999}
            step="any"
            value={played}
            onMouseDown={() => setPlaying(false)}
            onChange={handleSeekChange}
            onMouseUp={(e) => {
              handleSeekMouseUp(e);
              setPlaying(true);
            }}
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
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step="any"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 opacity-0 transition-all group-hover/volume:w-20 group-hover/volume:opacity-100 accent-landing-accent"
              />
            </div>
            
            <div className="text-sm font-medium text-white/90">
              {formatTime(played * duration)} / {formatTime(duration)}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {title && (
              <div className="hidden text-sm font-medium text-white/70 md:block max-w-[200px] truncate">
                {title}
              </div>
            )}
            <button 
              onClick={handleToggleFullscreen}
              className="text-white transition-colors hover:text-landing-accent"
            >
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
