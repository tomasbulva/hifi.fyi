import { useNavigate, useLocation } from 'react-router-dom';
import { useMusic } from '../core/MusicContext';
import { CachedCover } from './CachedCover';
import CastButton from '../features/cast/CastButton';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { playback, resume, pause, nextTrack, getCoverUrl } = useMusic();
  const { currentTrack, isPlaying } = playback;

  const items = [
    { path: '/player', label: 'Play', icon: 'play_circle' },
    { path: '/library', label: 'Browse', icon: 'explore' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  function isActive(path: string) {
    if (path === '/library') return location.pathname.startsWith('/library');
    return location.pathname === path;
  }

  const coverUrl = currentTrack ? getCoverUrl(currentTrack.coverArt || (currentTrack as any).albumId) : null;
  // On the big player view the strip is redundant — tabs only.
  const showPlayerStrip = !!currentTrack && location.pathname !== '/player';

  return (
    <nav className="md:hidden fixed bottom-0 w-full z-50 flex flex-col bg-surface/80 backdrop-blur-2xl rounded-t-xl border-t border-white/15 shadow-[0_-8px_32px_rgba(0,0,0,0.5)]">
      {/* Mini player strip — same surface as the tabs, divider between */}
      {showPlayerStrip && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
          <div
            className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer"
            onClick={() => navigate('/player')}
          >
            {coverUrl ? (
              <CachedCover url={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(208,188,255,0.1)' }}>
                <span className="material-symbols-outlined text-lg" style={{ color: '#D0BCFF' }}>music_note</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate('/player')}>
            <div className="truncate text-sm font-semibold" style={{ color: '#E5E2E1' }}>{currentTrack.title}</div>
            <div className="truncate text-xs" style={{ color: '#CBC3D7' }}>{currentTrack.artist}</div>
          </div>
          <CastButton />
          <button
            onClick={() => isPlaying ? pause() : resume()}
            className="bg-transparent border-none cursor-pointer p-1"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-outlined text-2xl" style={{ color: '#E5E2E1' }}>
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button onClick={nextTrack} className="bg-transparent border-none cursor-pointer p-1" title="Next">
            <span className="material-symbols-outlined text-xl" style={{ color: '#E5E2E1' }}>skip_next</span>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex justify-around items-center px-4 py-3">
        {items.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 rounded-xl transition-colors border-none cursor-pointer ${
                active
                  ? 'text-primary bg-primary/10'
                  : 'text-on-surface-variant hover:bg-white/5'
              }`}
              style={{ background: active ? 'rgba(208,188,255,0.1)' : 'transparent' }}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <span className="text-label-sm">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
