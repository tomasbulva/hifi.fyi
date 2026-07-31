import { useState } from 'react';
import type { SubsonicSong } from '../../core/types';
import { CachedCover } from '../../components/CachedCover';
import { LOSSLESS_FORMATS } from '../../core/quality';
import { formatTime } from '../../core/format';

// Animated equalizer bars
function PlayingBars() {
  return (
    <div className="flex items-end gap-[1px] h-3 ml-0.5">
      <div className="w-0.5 rounded-full animate-pulse-soft" style={{ height: '30%', background: '#D0BCFF', animationDelay: '0ms' }} />
      <div className="w-0.5 rounded-full animate-pulse-soft" style={{ height: '70%', background: '#D0BCFF', animationDelay: '150ms' }} />
      <div className="w-0.5 rounded-full animate-pulse-soft" style={{ height: '50%', background: '#D0BCFF', animationDelay: '300ms' }} />
      <div className="w-0.5 rounded-full animate-pulse-soft" style={{ height: '85%', background: '#D0BCFF', animationDelay: '450ms' }} />
    </div>
  );
}

function CodecPill({ song }: { song: SubsonicSong }) {
  const suffix = (song.suffix ?? '').toLowerCase();
  if (!suffix) return null;
  const bitRate = song.bitRate ?? 0;
  const lossless = LOSSLESS_FORMATS.includes(suffix);
  const label = lossless
    ? 'LOSSLESS'
    : suffix.toUpperCase();
  const isHiRes = lossless && bitRate >= 2304;

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ml-2"
      style={{
        background: isHiRes ? 'rgba(68, 226, 205, 0.12)' : lossless ? 'rgba(208, 188, 255, 0.1)' : 'rgba(255,255,255,0.05)',
        color: isHiRes ? '#44E2CD' : lossless ? '#CBC3D7' : '#CBC3D7',
        border: `1px solid ${isHiRes ? 'rgba(68,226,205,0.25)' : lossless ? 'rgba(208,188,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {isHiRes ? 'HI-RES' : label}{lossless && !isHiRes ? '' : ''}{!lossless && bitRate ? ` ${bitRate}` : ''}
    </span>
  );
}

type Column = '#' | 'title' | 'artist' | 'album' | 'quality' | 'added' | 'duration' | 'checkbox' | 'favorite';

interface SongTableProps {
  songs: SubsonicSong[];
  play: (s: SubsonicSong) => void;
  addToQueue: (tracks: SubsonicSong | SubsonicSong[]) => void;
  replaceQueue: (tracks: SubsonicSong[]) => void;
  getCoverUrl: (id: string | undefined) => string;
  columns?: Column[];
  currentTrackId?: string;
  showSelection?: boolean;
  onSelectionChange?: (selected: SubsonicSong[]) => void;
  compact?: boolean;
}

const DEFAULT_COLUMNS: Column[] = ['#', 'title', 'artist', 'quality', 'duration'];

export function SongTable({
  songs, play, addToQueue, replaceQueue, getCoverUrl,
  columns = DEFAULT_COLUMNS,
  currentTrackId,
  showSelection = false,
  onSelectionChange,
  compact = false,
}: SongTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const hasSelection = selected.size > 0;
  const showCol = (c: Column) => columns.includes(c);

  if (songs.length === 0) return (
    <p className="mt-10 text-center text-sm" style={{ color: '#CBC3D7' }}>No tracks</p>
  );

  function toggleSelect(songId: string, shiftKey: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClicked) {
        const start = songs.findIndex(s => s.id === lastClicked);
        const end = songs.findIndex(s => s.id === songId);
        if (start !== -1 && end !== -1) {
          const [from, to] = [Math.min(start, end), Math.max(start, end)];
          for (let i = from; i <= to; i++) {
            if (next.has(songs[i].id)) next.delete(songs[i].id);
            else next.add(songs[i].id);
          }
          setLastClicked(songId);
          onSelectionChange?.(songs.filter(s => next.has(s.id)));
          return next;
        }
      }
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      setLastClicked(songId);
      onSelectionChange?.(songs.filter(s => next.has(s.id)));
      return next;
    });
  }

  function selectAll() {
    const newSet = selected.size === songs.length ? new Set<string>() : new Set(songs.map(s => s.id));
    setSelected(newSet);
    onSelectionChange?.(songs.filter(s => newSet.has(s.id)));
  }

  // ponytail: header label map
  const headerLabels: Record<string, string> = {
    '#': '#', title: 'TITLE', artist: 'ARTIST', album: 'ALBUM',
    quality: 'QUALITY', added: 'ADDED', duration: '', checkbox: '',
    favorite: '',
  };

  // ponytail: column width classes
  const colWidth: Record<string, string> = {
    '#': 'w-8', title: 'flex-1 min-w-0', artist: 'w-40 hidden md:table-cell',
    album: 'w-44 hidden md:table-cell', quality: 'w-24 hidden lg:table-cell',
    added: 'w-32 hidden lg:table-cell', duration: 'w-16 text-right',
    checkbox: 'w-8', favorite: 'w-8',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 pb-2 mb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: '#CBC3D7', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {showCol('checkbox') && (
          <div className="w-8 flex-shrink-0">
            <input type="checkbox" checked={selected.size === songs.length && songs.length > 0}
              onChange={selectAll} className="h-3.5 w-3.5 cursor-pointer accent-[#D0BCFF]" />
          </div>
        )}
        {showCol('#') && <div className="w-10 flex-shrink-0">{headerLabels['#']}</div>}
        {showCol('title') && <div className="flex-1 min-w-0">{headerLabels.title}</div>}
        {showCol('artist') && <div className="w-40 hidden md:block">{headerLabels.artist}</div>}
        {showCol('album') && <div className="w-44 hidden md:block">{headerLabels.album}</div>}
        {showCol('quality') && <div className={compact ? 'w-24 flex-shrink-0' : 'w-20 hidden lg:block'}>{headerLabels.quality}</div>}
        {showCol('added') && <div className="w-28 hidden lg:block">{headerLabels.added}</div>}
        {showCol('duration') && <div className="w-14 flex-shrink-0 text-right">⏱</div>}
        {showCol('favorite') && <div className="w-8 flex-shrink-0" />}
      </div>

      {/* Rows */}
      {songs.map((song, idx) => {
        const isSelected = selected.has(song.id);
        const isPlaying = currentTrackId === song.id;

        return (
          <div
            key={song.id}
            className="group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border border-transparent"
            style={{ background: isPlaying ? 'rgba(208,188,255,0.06)' : 'transparent' }}
            onMouseEnter={e => { if (!isPlaying) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={e => { if (!isPlaying) e.currentTarget.style.background = 'transparent'; }}
            onClick={(e) => {
              if (e.shiftKey && showSelection) toggleSelect(song.id, e.shiftKey);
              else play(song);
            }}
          >
            {/* Checkbox */}
            {showCol('checkbox') && (
              <div className="w-8 flex-shrink-0 flex items-center">
                <input type="checkbox" checked={isSelected}
                  onChange={() => toggleSelect(song.id, false)}
                  onClick={e => e.stopPropagation()}
                  className="h-3.5 w-3.5 cursor-pointer accent-[#D0BCFF]" />
              </div>
            )}

            {/* # column — index or EQ bars */}
            {showCol('#') && (
              <div className="w-10 flex-shrink-0 flex items-center justify-center text-xs"
                style={{ color: isPlaying ? '#D0BCFF' : '#CBC3D7' }}>
                {isPlaying ? <PlayingBars /> : <span>{idx + 1}</span>}
              </div>
            )}

            {/* Title column — art + title + sub-artist */}
            {showCol('title') && (
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <CachedCover url={getCoverUrl(song.coverArt)} alt=""
                  className="w-10 h-10 rounded flex-shrink-0 object-cover" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium"
                      style={{ color: isPlaying ? '#D0BCFF' : '#E5E2E1' }}>
                      {song.title}
                    </span>
                  </div>
                  {!showCol('artist') && (
                    <div className="truncate text-xs" style={{ color: '#CBC3D7' }}>
                      {song.artist ?? 'Unknown'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Artist column */}
            {showCol('artist') && (
              <div className="w-40 hidden md:block truncate text-sm" style={{ color: '#CBC3D7' }}>
                {song.artist ?? 'Unknown'}
              </div>
            )}

            {/* Album column */}
            {showCol('album') && (
              <div className="w-44 hidden md:block truncate text-sm" style={{ color: '#CBC3D7' }}>
                {song.album ?? ''}
              </div>
            )}

            {/* Quality */}
            {showCol('quality') && (
              <div className={compact ? 'w-24 flex-shrink-0 flex items-center' : 'w-20 hidden lg:flex items-center'}>
                <CodecPill song={song} />
              </div>
            )}

            {/* Added date */}
            {showCol('added') && (
              <div className="w-28 hidden lg:block text-xs" style={{ color: '#CBC3D7' }}>
                {/* ponytail: Navidrome doesn't expose created date on songs. Placeholder. */}
                —
              </div>
            )}

            {/* Duration */}
            {showCol('duration') && (
              <div className="w-14 flex-shrink-0 text-right text-xs font-mono" style={{ color: '#CBC3D7' }}>
                {song.duration ? formatTime(song.duration) : '—'}
              </div>
            )}
          </div>
        );
      })}

      {/* Selection bar — fixed to viewport, sits above MiniPlayer when present */}
      {hasSelection && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full px-4 py-2.5 flex items-center gap-3 mx-auto w-fit"
            style={{ background: 'rgba(13,13,13,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(208,188,255,0.2)' }}>
            <span className="text-xs font-semibold" style={{ color: '#D0BCFF' }}>
              {selected.size} song{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <button className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer hover:opacity-80"
              style={{ color: '#E5E2E1' }}
              onClick={() => addToQueue(songs.filter(s => selected.has(s.id)))}>
              <span className="material-symbols-outlined text-sm">playlist_add</span>
              Add to Queue
            </button>
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <button className="flex items-center gap-1 text-xs bg-transparent border-none cursor-pointer hover:opacity-80"
              style={{ color: '#E5E2E1' }}
              onClick={() => setSelected(new Set())}>
              <span className="material-symbols-outlined text-sm">close</span>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}