import { useEffect, useRef } from 'react';
import { useMusic } from '../core/MusicContext';

export function useMediaSession() {
  const { playback, resume, pause, nextTrack, prevTrack } = useMusic();
  const { currentTrack, isPlaying, progress, duration } = playback;
  const posRef = useRef({ progress, duration });
  posRef.current = { progress, duration };

  // Update metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist ?? '',
      album: currentTrack.album ?? '',
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  // Set up action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [resume, pause, nextTrack, prevTrack]);

  // Update position state
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    try {
      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: duration || 0,
          position: Math.min(progress, duration || 0),
          playbackRate: 1,
        });
      }
    } catch { /* not supported */ }
  }, [progress, duration, currentTrack]);
}
