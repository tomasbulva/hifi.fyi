import { useState } from 'react';
import type { SubsonicSong } from '../../core/types';
import { useCompanion } from '../../core/CompanionContext';
import { CachedCover } from '../../components/CachedCover';
import { LOSSLESS_FORMATS } from '../../core/quality';
import { formatTime } from '../../core/format';

function CodecPill({ song }: { song: SubsonicSong }) {
  const suffix = (song.suffix ?? '').toLowerCase();
  if (!suffix) return null;
  const lossless = LOSSLESS_FORMATS.includes(suffix);
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase font-mono-ui ${
        lossless
          ? 'bg-secondary/15 text-secondary border border-secondary/20'
          : 'bg-tertiary/15 text-tertiary border border-tertiary/20'
      }`}
    >
      {lossless && '◆ '}{suffix.toUpperCase()}{song.bitRate ? ` ${song.bitRate}` : ''}
    </span>
  );
}

// Animated equalizer bars for currently playing track
function PlayingBars() {
  return (
    <div className="flex items-end gap-0.5 h-4">
      <div className="w-0.5 bg-primary rounded-full animate-pulse-soft" style={{ height: '40%', animationDelay: '0ms' }} />
      <div className="w-0.5 bg-primary rounded-full animate-pulse-soft" style={{ height: '80%', animationDelay: '150ms' }} />
      <div className="w-0.5 bg-primary rounded-full animate-pulse-soft" style={{ height: '60%', animationDelay: '300ms' }} />
      <div className="w-0.5 bg-primary rounded-full animate-pulse-soft" style={{ height: '90%', animationDelay: '450ms' }} />
    </div>
  );
}

interface SongListProps {
  songs: SubsonicSong[];
  play: (s: SubsonicSong) => void;
  addToQueue: (tracks: SubsonicSong | SubsonicSong[]) => void;
  replaceQueue: (tracks: SubsonicSong[]) => void;
  getCoverUrl: (id: string | undefined) => string;
}

export function SongList({ songs, play, addToQueue, replaceQueue, getCoverUrl }: SongListProps) {
  const { hotTrackIds } = useCompanion();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const hasSelection = selected.size > 0;

  if (songs.length === 0) return (
    <p className="mt-10 text-center text-on-surface-variant">No tracks</p>
  );

  function toggleSelect(songId: string, shiftKey: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClicked) {
        const startIdx = songs.findIndex(s => s.id === lastClicked);
        const endIdx = songs.findIndex(s => s.id === songId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
          for (let i = from; i <= to; i++) {
            if (next.has(songs[i].id)) next.delete(songs[i].id);
            else next.add(songs[i].id);
          }
          setLastClicked(songId);
          return next;
        }
      }
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      setLastClicked(songId);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === songs.length) setSelected(new Set());
    else setSelected(new Set(songs.map(s => s.id)));
  }

  function getSelectedSongs(): SubsonicSong[] {
    return songs.filter(s => selected.has(s.id));
  }

  function handleReplace() {
    const list = hasSelection ? getSelectedSongs() : songs;
    replaceQueue(list);
  }

  function handleAdd() {
    const list = hasSelection ? getSelectedSongs() : songs;
    addToQueue(list);
  }

  return (
    <>
      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 pb-2 border-b border-outline-variant text-label-sm text-on-surface-variant font-label uppercase tracking-wider">
        <div className="w-4 flex-shrink-0">
          <input
            type="checkbox"
            checked={selected.size === songs.length && songs.length > 0}
            onChange={selectAll}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
        </div>
        <div className="w-10 flex-shrink-0" />
        <div className="flex-1 min-w-0">Title</div>
        <div className="hidden md:block w-40 truncate">Album</div>
        <div className="hidden lg:block w-24 text-right">Duration</div>
        <div className="w-8" />
      </div>

      {/* Song rows */}
      <div className="flex flex-col">
        {songs.map((song) => {
          const isSelected = selected.has(song.id);
          const isPlaying = false; // TODO: compare with playback.currentTrack?.id
          return (
            <div
              key={song.id}
              className={`group flex items-center gap-3 px-3 my-1 py-2 rounded-lg cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-primary-container/10 border border-primary/20'
                  : 'hover:bg-surface-container-high border border-transparent'
              }`}
              onClick={(e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  toggleSelect(song.id, e.shiftKey);
                } else {
                  play(song);
                }
              }}
            >
              {/* Checkbox */}
              <div className="w-4 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(song.id, false)}
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
              </div>

              {/* Playing bars (only when playing) */}
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                {isPlaying && <PlayingBars />}
              </div>

              {/* Cover art thumbnail — square, 4px rounded */}
              <CachedCover
                url={getCoverUrl(song.coverArt)}
                alt=""
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />

              {/* Title + artist */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-sm font-medium ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                    {song.title}
                  </span>
                  {hotTrackIds.has(song.id) && (
                    <span className="material-symbols-outlined text-tertiary text-base flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} title="Hot track">
                      local_fire_department
                    </span>
                  )}
                  <CodecPill song={song} />
                </div>
                <div className="truncate text-xs text-on-surface-variant">
                  {song.artist ?? 'Unknown'}
                </div>
              </div>

              {/* Album (desktop) */}
              <div className="hidden md:block w-40 truncate text-sm text-on-surface-variant">
                {song.album ?? ''}
              </div>

              {/* Duration (desktop) */}
              <div className="hidden lg:block w-24 text-right text-xs font-mono-ui text-on-surface-variant">
                {song.duration ? formatTime(song.duration) : '—'}
              </div>

              {/* Hover actions */}
              <div className="w-8 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="material-symbols-outlined text-on-surface-variant hover:text-primary bg-transparent border-none cursor-pointer text-lg"
                  onClick={e => { e.stopPropagation(); toggleSelect(song.id, false); }}
                  title="Select"
                >
                  {isSelected ? 'check_box' : 'check_box_outline_blank'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating selection bar */}
      {hasSelection && (
        <div className="sticky bottom-20 z-30 mt-4">
          <div className="glass-panel rounded-full px-4 py-2.5 flex items-center gap-3 mx-auto w-fit shadow-lg">
            <span className="text-label-sm font-bold text-primary whitespace-nowrap">
              {selected.size} song{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="w-px h-5 bg-outline-variant" />
            <button
              className="flex items-center gap-1.5 text-label-sm text-on-surface hover:text-primary bg-transparent border-none cursor-pointer whitespace-nowrap"
              onClick={handleAdd}
            >
              <span className="material-symbols-outlined text-base">playlist_add</span>
              Add to Queue
            </button>
            <button
              className="flex items-center gap-1.5 text-label-sm text-on-surface hover:text-primary bg-transparent border-none cursor-pointer whitespace-nowrap"
              onClick={handleReplace}
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              Play Selected
            </button>
            <div className="w-px h-5 bg-outline-variant" />
            <button
              className="flex items-center gap-1.5 text-label-sm text-error hover:opacity-80 bg-transparent border-none cursor-pointer whitespace-nowrap"
              onClick={() => setSelected(new Set())}
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
