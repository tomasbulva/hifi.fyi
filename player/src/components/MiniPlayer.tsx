import { useNavigate } from 'react-router-dom';
import { useMusic } from '../core/MusicContext';
import { CachedCover } from './CachedCover';
import { formatTime } from '../core/format';
import { LOSSLESS_FORMATS } from '../core/quality';
import CastButton from '../features/cast/CastButton';

export default function MiniPlayer() {
  const {
    playback, resume, pause, nextTrack, prevTrack,
    getCoverUrl, toggleShuffle, toggleRepeat,
    seek, setVolume, starredIds, toggleStar,
  } = useMusic();
  const navigate = useNavigate();

  const { currentTrack, isPlaying, progress, duration, shuffle, repeat, volume } = playback;

  if (!currentTrack) return null;

  const coverUrl = getCoverUrl(currentTrack.coverArt || (currentTrack as any).albumId);
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const suffix = (currentTrack.suffix ?? '').toLowerCase();
  const lossless = LOSSLESS_FORMATS.includes(suffix);
  const isHiRes = lossless && (currentTrack.bitRate ?? 0) >= 2304;
  const isStarred = starredIds.has(currentTrack.id);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div
        className="mx-2 mb-2 md:mx-0 md:mb-0 rounded-2xl md:rounded-none flex items-center gap-4 px-4 py-2 md:px-8 md:py-3"
        style={{ background: '#2A2A2A' }}
      >
        {/* Left: cover art + track info */}
        <div className="flex items-center gap-3 min-w-0" style={{ flex: '1 1 240px' }}>
          <div
            className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer"
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
          <div className="min-w-0 hidden sm:block cursor-pointer" onClick={() => navigate('/player')}>
            <div className="truncate text-sm font-semibold" style={{ color: '#E5E2E1' }}>{currentTrack.title}</div>
            <div className="truncate text-xs" style={{ color: '#CBC3D7' }}>{currentTrack.artist}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); toggleStar(currentTrack.id); }}
            className="bg-transparent border-none cursor-pointer hover:opacity-80 p-1 hidden sm:block"
            title={isStarred ? 'Unfavorite' : 'Favorite'}
          >
            <span className="material-symbols-outlined text-lg"
              style={{ color: isStarred ? '#D0BCFF' : '#CBC3D7', fontVariationSettings: isStarred ? "'FILL' 1" : "'FILL' 0" }}>
              favorite
            </span>
          </button>
        </div>

        {/* Center: controls + progress bar */}
        <div className="flex flex-col items-center gap-1" style={{ flex: '0 0 auto' }}>
          {/* Controls row */}
          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
            <button
              onClick={toggleShuffle}
              className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
              title="Shuffle"
            >
              <span className="material-symbols-outlined text-sm"
                style={{ color: shuffle ? '#D0BCFF' : '#CBC3D7' }}>
                shuffle
              </span>
            </button>

            <button
              onClick={prevTrack}
              className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
              title="Previous"
            >
              <span className="material-symbols-outlined text-lg" style={{ color: '#E5E2E1' }}>skip_previous</span>
            </button>

            <button
              onClick={() => isPlaying ? pause() : resume()}
              className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer hover:scale-105 transition-transform"
              style={{ background: '#D0BCFF' }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              <span className="material-symbols-outlined text-lg"
                style={{ color: '#1A0A2E', fontVariationSettings: "'FILL' 1" }}>
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            <button
              onClick={nextTrack}
              className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
              title="Next"
            >
              <span className="material-symbols-outlined text-lg" style={{ color: '#E5E2E1' }}>skip_next</span>
            </button>

            <button
              onClick={toggleRepeat}
              className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
              title="Repeat"
            >
              <span className="material-symbols-outlined text-sm"
                style={{ color: repeat !== 'off' ? '#D0BCFF' : '#CBC3D7' }}>
                {repeat === 'one' ? 'repeat_one' : 'repeat'}
              </span>
            </button>
          </div>

          {/* Progress bar row */}
          <div className="hidden md:flex items-center gap-2 w-full">
            <span className="text-[10px] font-mono tabular-nums" style={{ color: '#CBC3D7' }}>{formatTime(progress)}</span>
            <div
              className="h-1 rounded-full flex-1 overflow-hidden cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.08)' }}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seek(pct * duration);
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progressPct, 100)}%`, background: '#D0BCFF' }}
              />
            </div>
            <span className="text-[10px] font-mono tabular-nums" style={{ color: '#CBC3D7' }}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: quality + icons */}
        <div className="hidden md:flex items-center gap-3" style={{ flex: '1 1 240px', justifyContent: 'flex-end' }}>
          {/* Quality badge */}
          {suffix && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase"
              style={{
                background: isHiRes ? 'rgba(68, 226, 205, 0.12)' : 'rgba(255,255,255,0.04)',
                color: isHiRes ? '#44E2CD' : '#CBC3D7',
                border: `1px solid ${isHiRes ? 'rgba(68,226,205,0.25)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              {isHiRes ? 'HI-RES' : suffix.toUpperCase()}
            </span>
          )}

          {/* Queue button */}
          <button
            onClick={(e) => { e.stopPropagation(); navigate('/player'); }}
            className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
            title="Show Queue"
          >
            <span className="material-symbols-outlined text-sm" style={{ color: '#CBC3D7' }}>queue_music</span>
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
              className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
            >
              <span className="material-symbols-outlined text-sm" style={{ color: '#CBC3D7' }}>
                {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
              </span>
            </button>
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              className="w-16 h-1 appearance-none rounded-full cursor-pointer"
              style={{
                background: `linear-gradient(to right, #D0BCFF ${volume * 100}%, rgba(255,255,255,0.08) ${volume * 100}%)`,
                accentColor: '#D0BCFF',
              }}
            />
          </div>

          {/* Cast button */}
          <CastButton />
        </div>
      </div>
    </div>
  );
}