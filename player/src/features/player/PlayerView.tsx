import { useMusic } from '../../core/MusicContext';
import { useCompanion } from '../../core/CompanionContext';
import { reportError } from '../../core/errorReport';
import { useState, useEffect } from 'react';
import CastButton from '../cast/CastButton';
import { CachedCover } from '../../components/CachedCover';
import { PlayingBars } from '../../components/shared';
import { DraggableProgressBar } from './DraggableProgressBar';
import { AlbumBackdrop } from '../../components/AlbumBackdrop';
import QualityBadge, { SongQualityBadge } from './QualityBadge';
import VisualizationView, { type VizMode } from '../visualization/VisualizationView';
import { formatTime } from '../../core/format';
import { setRating } from '../../core/api';
import type { SongRating } from '../../core/companionClient';
function StarRating({ rating, onRate }: { rating: number; onRate?: (r: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 justify-center">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={() => onRate?.(i === rating ? 0 : i)}
          title={i === rating ? 'Clear rating' : `Rate ${i} star${i > 1 ? 's' : ''}`}
          className="bg-transparent border-none cursor-pointer p-0 hover:scale-110 transition-transform"
        >
          <span className="material-symbols-outlined text-base"
            style={{ fontVariationSettings: i <= rating ? "'FILL' 1" : "'FILL' 0", color: i <= rating ? '#D0BCFF' : '#CBC3D7' }}>
            star
          </span>
        </button>
      ))}
    </div>
  );
}

function SavePlaylistButton() {
  const { saveQueueAsPlaylist } = useMusic();
  const [saving, setSaving] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState('');

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await saveQueueAsPlaylist(name.trim());
    setSaving(false);
    setShowInput(false);
    setName('');
  }

  if (showInput) {
    return (
      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Playlist name"
          autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="w-36 rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#E5E2E1', border: '1px solid rgba(255,255,255,0.1)' }} />
        <button onClick={handleSave} disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-bold border-none cursor-pointer"
          style={{ background: '#D0BCFF', color: '#1A0A2E' }}>
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => setShowInput(false)}
          className="cursor-pointer border-none bg-transparent p-1" style={{ color: '#CBC3D7' }}>
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setShowInput(true)}
      className="text-xs font-bold uppercase px-4 py-2 rounded-lg cursor-pointer bg-transparent border hover:opacity-80"
      style={{ color: '#D0BCFF', borderColor: 'rgba(208,188,255,0.2)' }}>
      Save as Playlist
    </button>
  );
}

export default function PlayerView() {
  const {
    playback, queue,
    resume, pause, nextTrack, prevTrack,
    toggleShuffle, toggleRepeat, setVolume, seek,
    removeFromQueue, playFromQueue, clearQueue, getCoverUrl,
    toggleStar, isStarred,
  } = useMusic();
  const { hotTrackIds, getRating } = useCompanion();
  const [showViz, setShowViz] = useState(false);
  const [vizMode, setVizMode] = useState<VizMode>('bars');
  const vizModes: VizMode[] = ['bars', 'waveform', 'particles'];

  const { currentTrack, isPlaying, progress, duration, shuffle, repeat, volume } = playback;
  const coverUrl = currentTrack ? getCoverUrl(currentTrack.coverArt || (currentTrack as any).albumId) : '';
  const starred = currentTrack ? isStarred(currentTrack.id) : false;

  const currentIdx = queue.findIndex(item => item.song.id === currentTrack?.id);

  const [songRatingData, setSongRatingData] = useState<SongRating | null>(null);
  useEffect(() => {
    if (!currentTrack) { setSongRatingData(null); setRatingOverride(null); return; }
    setRatingOverride(null);
    let cancelled = false;
    getRating(currentTrack.id).then(data => { if (!cancelled) setSongRatingData(data); });
    return () => { cancelled = true; };
  }, [currentTrack?.id, getRating]);

  const songRating = songRatingData?.rating ?? 0;
  const isHot = currentTrack ? hotTrackIds.has(currentTrack.id) : false;

  const [heartError, setHeartError] = useState(false);
  // Optimistic rating override — set while the Subsonic setRating call is in flight,
  // kept as the displayed value on success, reverted on failure.
  const [ratingOverride, setRatingOverride] = useState<number | null>(null);
  const [rateError, setRateError] = useState(false);

  async function handleRate(r: number) {
    if (!currentTrack) return;
    const prev = ratingOverride ?? songRating;
    setRatingOverride(r);
    setRateError(false);
    try {
      await setRating(currentTrack.id, r);
    } catch (e) {
      setRatingOverride(prev);
      setRateError(true);
      reportError(e, { source: 'player.setRating', songId: currentTrack.id });
    }
  }
  async function handleHeartClick() {
    if (!currentTrack) return;
    setHeartError(false);
    try { await toggleStar(currentTrack.id); } catch (e) { reportError(e, { source: 'player.toggleStar', songId: currentTrack.id }); setHeartError(true); }
  }

  function renderQueueItems() {
    return (
      <div className="space-y-0.5">
        {/* Played items (above play head) — dimmed */}
        {queue.map((item, idx) => {
          if (currentIdx >= 0 && idx >= currentIdx) return null;
          const itemCoverUrl = getCoverUrl(item.song.coverArt);
          return (
            <div key={item.song.id}
              className="flex items-center gap-4 px-4 py-2.5 rounded-xl cursor-pointer transition-all group"
              style={{ opacity: 0.35 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => playFromQueue(idx)}>
              <div className="relative w-6 h-5 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-mono absolute group-hover:opacity-0 transition-opacity" style={{ color: '#494454' }}>{idx + 1}</span>
                <span className="material-symbols-outlined text-sm absolute opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#D0BCFF' }}>play_arrow</span>
              </div>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(208,188,255,0.05)' }}>
                {itemCoverUrl ? <CachedCover url={itemCoverUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-xs" style={{ color: '#D0BCFF' }}>music_note</span></div>}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{item.song.title}</h4>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs truncate" style={{ color: '#CBC3D7' }}>{item.song.artist}</span>
                  {item.song.album && <>
                    <span className="text-xs flex-shrink-0" style={{ color: '#494454' }}>·</span>
                    <span className="text-xs truncate italic" style={{ color: '#CBC3D7' }}>{item.song.album}</span>
                  </>}
                  <SongQualityBadge song={item.song} />
                </div>
              </div>
              <span className="text-xs font-mono flex-shrink-0" style={{ color: '#CBC3D7' }}>
                {item.song.duration ? formatTime(item.song.duration) : '—'}
              </span>
              <button className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer flex-shrink-0"
                style={{ color: '#CBC3D7' }}
                onClick={e => { e.stopPropagation(); removeFromQueue(idx); }}>
                close
              </button>
            </div>
          );
        })}

        {/* Playing Now + Next Up — side-by-side bento cards */}
        {currentIdx >= 0 && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 my-2">
            {/* Playing Now */}
            {(() => {
              const item = queue[currentIdx];
              const itemCoverUrl = getCoverUrl(item.song.coverArt);
              return (
                <div className={`${currentIdx + 1 < queue.length ? 'md:col-span-7' : 'md:col-span-12'} rounded-2xl p-5 flex items-center gap-5 cursor-pointer hover:opacity-90 transition-opacity`}
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                  onClick={() => isPlaying ? pause() : resume()}>
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(208,188,255,0.05)' }}>
                    {itemCoverUrl ? <CachedCover url={itemCoverUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-2xl" style={{ color: '#D0BCFF' }}>music_note</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest block mb-1" style={{ color: '#D0BCFF' }}>Playing Now</span>
                      {repeat === 'one' && (
                        <span className="material-symbols-outlined text-sm" style={{ color: '#D0BCFF' }}>repeat_one</span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold truncate" style={{ color: '#E5E2E1' }}>{item.song.title}</h3>
                    <p className="text-xs truncate" style={{ color: '#CBC3D7' }}>{item.song.artist ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <PlayingBars animated={isPlaying} />
                    <span className="text-xs font-mono" style={{ color: '#CBC3D7' }}>{item.song.duration ? formatTime(item.song.duration) : '—'}</span>
                  </div>
                </div>
              );
            })()}

            {/* Next Up */}
            {currentIdx + 1 < queue.length && (() => {
              const nextItem = queue[currentIdx + 1];
              const nextCoverUrl = getCoverUrl(nextItem.song.coverArt);
              return (
                <div className="md:col-span-5 rounded-2xl p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition-transform relative overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                  onClick={() => playFromQueue(currentIdx + 1)}>
                  <div className="absolute top-0 right-0 w-24 h-24 opacity-10 blur-2xl -mr-8 -mt-8" style={{ background: '#D0BCFF' }} />
                  <span className="text-[9px] font-bold uppercase tracking-widest relative" style={{ color: '#CBC3D7' }}>Next Up</span>
                  <div className="flex items-center gap-3 mt-2 relative">
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(208,188,255,0.05)' }}>
                      {nextCoverUrl ? <CachedCover url={nextCoverUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-sm" style={{ color: '#D0BCFF' }}>music_note</span></div>}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate" style={{ color: '#E5E2E1' }}>{nextItem.song.title}</h3>
                      <p className="text-xs truncate" style={{ color: '#CBC3D7' }}>{nextItem.song.artist ?? '—'}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between relative">
                    <span className="text-xs font-mono" style={{ color: '#CBC3D7' }}>{nextItem.song.duration ? formatTime(nextItem.song.duration) : '—'}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Upcoming items (after next up) — full opacity */}
        {queue.map((item, idx) => {
          const afterNext = currentIdx >= 0 ? currentIdx + 1 : -1;
          if (idx <= afterNext) return null;
          const itemCoverUrl = getCoverUrl(item.song.coverArt);
          return (
            <div key={item.song.id}
              className="flex items-center gap-4 px-4 py-2.5 rounded-xl cursor-pointer transition-all group"
              style={{ background: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => playFromQueue(idx)}>
              <div className="relative w-6 h-5 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs font-mono absolute group-hover:opacity-0 transition-opacity" style={{ color: '#CBC3D7' }}>{idx + 1}</span>
                <span className="material-symbols-outlined text-sm absolute opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#D0BCFF' }}>play_arrow</span>
              </div>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgba(208,188,255,0.05)' }}>
                {itemCoverUrl ? <CachedCover url={itemCoverUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-xs" style={{ color: '#D0BCFF' }}>music_note</span></div>}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{item.song.title}</h4>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs truncate" style={{ color: '#CBC3D7' }}>{item.song.artist}</span>
                  {item.song.album && <>
                    <span className="text-xs flex-shrink-0" style={{ color: '#494454' }}>·</span>
                    <span className="text-xs truncate italic" style={{ color: '#CBC3D7' }}>{item.song.album}</span>
                  </>}
                  <SongQualityBadge song={item.song} />
                </div>
              </div>
              <span className="text-xs font-mono flex-shrink-0" style={{ color: '#CBC3D7' }}>
                {item.song.duration ? formatTime(item.song.duration) : '—'}
              </span>
              <button className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer flex-shrink-0"
                style={{ color: '#CBC3D7' }}
                onClick={e => { e.stopPropagation(); removeFromQueue(idx); }}>
                close
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function renderQueueHeader() {
    return (
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold" style={{ color: '#E5E2E1' }}>Queue</h2>
        <div className="flex gap-3">
          <SavePlaylistButton />
          <button onClick={clearQueue}
            className="text-xs font-bold uppercase px-4 py-2 rounded-lg cursor-pointer bg-transparent border-none hover:opacity-80"
            style={{ color: '#CBC3D7' }}>
            Clear All
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 pt-8 md:pt-16 pb-32 lg:flex lg:gap-8">
      {coverUrl && <AlbumBackdrop coverUrl={coverUrl} />}

      {/* Left/Main column — player controls */}
      <div className="flex flex-col items-center lg:flex-1 lg:max-w-2xl">
        {/* Album Art */}
        <div className="relative group flex-shrink-0 cursor-pointer mb-6 md:mb-10 animate-scale-in" onClick={() => setShowViz(v => !v)}>
          <div className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-3xl overflow-hidden" style={{ boxShadow: '0 0 60px rgba(208,188,255,0.08)' }}>
            {showViz ? (
              <VisualizationView mode={vizMode} onModeChange={setVizMode} />
            ) : coverUrl ? (
              <CachedCover url={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(208,188,255,0.05)' }}>
                <span className="material-symbols-outlined text-7xl" style={{ color: '#D0BCFF' }}>music_note</span>
              </div>
            )}
            {!showViz && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl" style={{ color: '#E5E2E1', fontVariationSettings: "'FILL' 1" }}>graphic_eq</span>
              </div>
            )}
          </div>
          {showViz && (
            <div className="absolute inset-y-0 -left-14 flex items-center">
              <button onClick={e => { e.stopPropagation(); setVizMode(vizModes[(vizModes.indexOf(vizMode) - 1 + 3) % 3]); }}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-transparent border-none cursor-pointer" style={{ color: '#CBC3D7' }}>
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
            </div>
          )}
          {showViz && (
            <div className="absolute inset-y-0 -right-14 flex items-center">
              <button onClick={e => { e.stopPropagation(); setVizMode(vizModes[(vizModes.indexOf(vizMode) + 1) % 3]); }}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-transparent border-none cursor-pointer" style={{ color: '#CBC3D7' }}>
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="text-center flex flex-col items-center max-w-lg animate-fade-in w-full px-4">
          <div className="flex items-center gap-3 justify-center">
            <h1 className="text-xl md:text-2xl md:text-3xl font-extrabold tracking-tight truncate" style={{ color: '#E5E2E1' }}>
              {currentTrack?.title ?? 'Not playing'}
            </h1>
            {currentTrack && (
              <button onClick={handleHeartClick} className="bg-transparent border-none cursor-pointer hover:scale-110 transition-transform p-0">
                <span className="material-symbols-outlined text-xl" style={{ color: starred ? '#D0BCFF' : '#CBC3D7', fontVariationSettings: starred ? "'FILL' 1" : "'FILL' 0" }}>
                  favorite
                </span>
              </button>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: '#44E2CD' }}>
            {currentTrack?.artist ?? ''}
            {currentTrack?.album ? ` · ${currentTrack.album}` : ''}
          </p>

          {/* Quality + Rating row */}
          <div className="mt-3 flex flex-col items-center gap-2">
            {currentTrack && <QualityBadge />}
            <div className="flex items-center gap-1.5 justify-center">
              {isHot && <span className="material-symbols-outlined text-base" style={{ color: '#D0BCFF', fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>}
              <StarRating rating={ratingOverride ?? songRating} onRate={handleRate} />
            </div>
            {(heartError || rateError) && <p className="text-xs" style={{ color: '#FF6B6B' }}>{rateError ? 'Failed to save rating' : 'Failed to update favorite'}</p>}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-lg mt-8 md:mt-10 px-4">
          <DraggableProgressBar progress={progress} duration={duration} buffered={playback.buffered} onSeek={seek} />
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-4 md:gap-6 lg:gap-10 mt-6">
          <button onClick={toggleShuffle} className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
            style={{ color: shuffle ? '#D0BCFF' : '#CBC3D7' }}>
            <span className="material-symbols-outlined text-xl">shuffle</span>
          </button>
          <button onClick={prevTrack} className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
            style={{ color: '#E5E2E1' }}>
            <span className="material-symbols-outlined text-2xl">skip_previous</span>
          </button>
          <button onClick={() => isPlaying ? pause() : resume()}
            className="w-14 h-14 rounded-full flex items-center justify-center border-none cursor-pointer hover:scale-105 transition-transform"
            style={{ background: '#D0BCFF' }}>
            <span className="material-symbols-outlined text-3xl" style={{ color: '#1A0A2E', fontVariationSettings: "'FILL' 1" }}>
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button onClick={nextTrack} className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
            style={{ color: '#E5E2E1' }}>
            <span className="material-symbols-outlined text-2xl">skip_next</span>
          </button>
          <button onClick={toggleRepeat} className="bg-transparent border-none cursor-pointer p-1 hover:opacity-80"
            style={{ color: repeat !== 'off' ? '#D0BCFF' : '#CBC3D7' }}>
            <span className="material-symbols-outlined text-xl">{repeat === 'one' ? 'repeat_one' : 'repeat'}</span>
          </button>
        </div>

        {/* Cast — mobile only (desktop gets the Volume + Cast row below) */}
        <div className="md:hidden mt-5">
          <CastButton />
        </div>

        {/* Volume + Cast row — hidden on mobile */}
        <div className="hidden md:flex items-center gap-6 mt-8 w-full max-w-xs justify-center">
          <button onClick={() => setVolume(volume === 0 ? 0.7 : 0)} className="bg-transparent border-none cursor-pointer p-1"
            style={{ color: '#CBC3D7' }}>
            <span className="material-symbols-outlined text-xl">
              {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
            </span>
          </button>
          <input type="range" min="0" max="1" step="0.01" value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
            style={{ background: `linear-gradient(to right, #D0BCFF ${volume * 100}%, rgba(255,255,255,0.08) ${volume * 100}%)`, accentColor: '#D0BCFF' }} />
          <CastButton />
        </div>
      </div>

      {/* Right column — Queue (wide screens only) */}
      {queue.length > 0 && (
        <section id="queue-section" className="hidden lg:block w-[400px] flex-shrink-0 mt-8 lg:mt-0">
          {renderQueueHeader()}
          {renderQueueItems()}
        </section>
      )}

      {/* Mobile queue — always visible, actions below the list */}
      {queue.length > 0 && (
        <section id="queue-section-mobile" className="lg:hidden w-full mt-8">
          {renderQueueItems()}
          <div className="flex items-center justify-end gap-3 mt-4">
            <SavePlaylistButton />
            <button onClick={clearQueue}
              className="text-xs font-bold uppercase px-4 py-2 rounded-lg cursor-pointer bg-transparent border-none hover:opacity-80"
              style={{ color: '#CBC3D7' }}>
              Clear All
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
