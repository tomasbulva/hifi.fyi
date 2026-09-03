import { useEffect } from 'react';
import { useMusic } from '../core/MusicContext';
import { track as trackEvent } from '../core/analytics';

export function useKeyboardShortcuts() {
  const { playback, resume, pause, nextTrack, prevTrack, toggleShuffle, toggleRepeat, setVolume, view, setView } = useMusic();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          trackEvent('keyboard', { action: playback.isPlaying ? 'pause' : 'resume' });
          if (playback.isPlaying) pause(); else resume();
          break;
        case 'ArrowRight':
          if (e.shiftKey) { e.preventDefault(); nextTrack(); }
          break;
        case 'ArrowLeft':
          if (e.shiftKey) { e.preventDefault(); prevTrack(); }
          break;
        case 'KeyS':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); toggleShuffle(); }
          break;
        case 'KeyR':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); toggleRepeat(); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(Math.min(1, playback.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(Math.max(0, playback.volume - 0.05));
          break;
        case 'Digit1':
          setView('player');
          break;
        case 'Digit2':
          setView('library');
          break;
        case 'Digit3':
          setView('visualization');
          break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback, resume, pause, nextTrack, prevTrack, toggleShuffle, toggleRepeat, setVolume, view, setView]);
}
