import { useState, useEffect } from 'react';
import { useCompanion } from '../../core/CompanionContext';
import type { SubsonicSong } from '../../core/types';
import { Label } from './components';
import { CachedCover } from '../../components/CachedCover';

export interface SmartPlaylistCard {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  params: { mood?: string; era?: string; topRated?: boolean; limit?: number };
}

export const SMART_PLAYLISTS: SmartPlaylistCard[] = [
  { id: 'top-rated', title: 'Top Rated', subtitle: 'Your highest rated tracks', icon: 'star', params: { topRated: true, limit: 50 } },
  { id: 'chill', title: 'Chill', subtitle: 'Relaxed, mellow vibes', icon: 'spa', params: { mood: 'chill', limit: 50 } },
  { id: 'energetic', title: 'Energetic', subtitle: 'High energy tracks', icon: 'bolt', params: { mood: 'energetic', limit: 50 } },
  { id: 'focus', title: 'Focus', subtitle: 'Deep concentration', icon: 'psychology', params: { mood: 'focus', limit: 50 } },
  { id: 'dark', title: 'Dark', subtitle: 'Moody and atmospheric', icon: 'dark_mode', params: { mood: 'dark', limit: 50 } },
  { id: '80s', title: '80s', subtitle: 'Tracks from the 1980s', icon: 'schedule', params: { era: '1980', limit: 50 } },
  { id: '90s', title: '90s', subtitle: 'Tracks from the 1990s', icon: 'schedule', params: { era: '1990', limit: 50 } },
  { id: '2000s', title: '2000s', subtitle: 'Tracks from the 2000s', icon: 'schedule', params: { era: '2000', limit: 50 } },
];

interface SmartPlaylistsGridProps {
  onSelect: (card: SmartPlaylistCard) => void;
  onDirectPlay?: (card: SmartPlaylistCard) => void;
}

export function SmartPlaylistsGrid({ onSelect, onDirectPlay: _onDirectPlay }: SmartPlaylistsGridProps) {
  const { enabled } = useCompanion();

  if (!enabled) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {SMART_PLAYLISTS.map(card => (
        <div
          key={card.id}
          className="group glass-panel rounded-xl p-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onClick={() => onSelect(card)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-xl">{card.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <Label>{card.title}</Label>
              <p className="text-xs text-on-surface-variant truncate">{card.subtitle}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SmartPlaylistDetailProps {
  card: SmartPlaylistCard;
  onBack: () => void;
  replaceQueue: (songs: SubsonicSong[]) => void;
  play: (song: SubsonicSong) => void;
  addToQueue: (songs: SubsonicSong | SubsonicSong[]) => void;
  getCoverUrl: (id: string | undefined) => string;
}

export function SmartPlaylistDetail({ card, onBack, replaceQueue, play, addToQueue, getCoverUrl }: SmartPlaylistDetailProps) {
  const { getPlaylist } = useCompanion();
  const [songs, setSongs] = useState<SubsonicSong[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlaylist(card.params).then(s => {
      setSongs(s);
      setLoading(false);
    });
  }, [card.id, getPlaylist]);

  if (loading) {
    return (
      <div className="py-16 text-center text-on-surface-variant flex flex-col items-center gap-3">
        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        <span className="text-label-sm">Loading playlist…</span>
      </div>
    );
  }

  if (!songs || songs.length === 0) {
    return (
      <div className="py-16 text-center text-on-surface-variant">
        No tracks found for this playlist. Try refreshing your library scan.
      </div>
    );
  }

  return (
    <div>
      {/* Back + header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-label-sm text-primary bg-transparent border-none cursor-pointer hover:opacity-80"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
        </button>
        <div>
          <h2 className="text-headline-md text-on-surface font-bold">{card.title}</h2>
          <p className="text-on-surface-variant text-sm">{songs.length} tracks</p>
        </div>
      </div>

      {/* Play all button */}
      <div className="mb-4 flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-label-sm font-semibold bg-primary text-on-primary border-none cursor-pointer hover:scale-105 transition-transform"
          onClick={() => { replaceQueue(songs); play(songs[0]); }}
        >
          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
          Play All
        </button>
        <button
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-label-sm font-semibold bg-surface-container-high text-on-surface border-none cursor-pointer hover:bg-surface-container-highest"
          onClick={() => addToQueue(songs)}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add to Queue
        </button>
      </div>

      {/* Song list */}
      <div className="flex flex-col">
        {songs.map((song, i) => (
          <div
            key={song.id}
            className="group flex items-center gap-3 px-3 my-1 py-2 rounded-lg cursor-pointer transition-colors hover:bg-surface-container-high border border-transparent"
            onClick={() => play(song)}
          >
            <span className="material-symbols-outlined text-on-surface-variant w-6 text-center text-xl group-hover:hidden">
              {i + 1}
            </span>
            <span
              className="material-symbols-outlined text-primary hidden group-hover:block w-6 text-center"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              play_arrow
            </span>
            <CachedCover url={getCoverUrl(song.coverArt)} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-on-surface">{song.title}</div>
              <div className="truncate text-xs text-on-surface-variant">{song.artist ?? 'Unknown'}</div>
            </div>
            <span className="text-xs font-mono-ui text-on-surface-variant">
              {song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
