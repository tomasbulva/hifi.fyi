import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMusic } from '../../core/MusicContext';
import type { SubsonicArtist, SubsonicAlbum, SubsonicSong } from '../../core/types';
import { Centered, Section, Empty } from '../../features/library/components';
import { AlbumGrid } from '../../features/library/AlbumGrid';
import { SongTable } from '../../features/library/SongTable';
import { CachedCover } from '../../components/CachedCover';

import { slugify } from '../../core/format';
import { track as trackEvent } from '../../core/analytics';

export default function SearchView() {
  const {
    search, searchResults, getCoverUrl, play, addToQueue, replaceQueue,
    playback,
  } = useMusic();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      if (q.trim()) {
        trackEvent('search', { query: q.trim().slice(0, 64) });
        search(q);
      }
    }, 300);
  }, [search]);

  const clearSearch = useCallback(() => { setQuery(''); search(''); }, [search]);
  const artistCoverUrl = (a: SubsonicArtist) => getCoverUrl(a.coverArt || a.artistImageUrl);

  return (
    <Centered>
      <h1 className="text-4xl font-extrabold mb-6" style={{ color: '#E5E2E1' }}>Search</h1>

      <div className="relative mb-8">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-xl"
          style={{ color: '#CBC3D7' }}>search</span>
        <input
          type="text" value={query} onChange={e => handleSearch(e.target.value)}
          placeholder="Search for songs, albums, artists..."
          autoFocus
          className="w-full pl-12 pr-12 py-3.5 rounded-xl border-none outline-none text-base"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#E5E2E1' }} />
        {query && (
          <button onClick={clearSearch} className="absolute right-4 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer hover:opacity-80 p-0">
            <span className="material-symbols-outlined text-lg" style={{ color: '#CBC3D7' }}>close</span>
          </button>
        )}
      </div>

      {searchResults ? (
        <>
          {searchResults.artist?.length > 0 && (
            <Section title="Artists">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4">
                {searchResults.artist.map((a: SubsonicArtist) => (
                  <div key={a.id} className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => { navigate(`/library/artists/${slugify(a.name)}/${a.id}`); setQuery(''); }}>
                    <CachedCover url={artistCoverUrl(a)} alt={a.name}
                      className="w-28 h-28 rounded-full object-cover mb-2" />
                    <span className="text-sm font-medium truncate w-full text-center" style={{ color: '#E5E2E1' }}>{a.name}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {searchResults.album?.length > 0 && (
            <Section title="Albums">
              <AlbumGrid albums={searchResults.album}
                selectAlbum={(a: SubsonicAlbum) => { navigate(`/library/albums/${slugify(a.name)}/${a.id}`); setQuery(''); }}
                getCoverUrl={getCoverUrl} />
            </Section>
          )}
          {searchResults.song?.length > 0 && (
            <Section title="Songs">
              <SongTable
                songs={searchResults.song}
                play={(s: SubsonicSong) => { play(s); setQuery(''); }}
                addToQueue={addToQueue} replaceQueue={replaceQueue}
                getCoverUrl={getCoverUrl}
                currentTrackId={playback.currentTrack?.id}
                columns={['#', 'title', 'artist', 'quality', 'duration']} />
            </Section>
          )}
          {!searchResults.artist?.length && !searchResults.album?.length && !searchResults.song?.length && (
            <Empty>{query ? 'No results found' : 'Start typing to search'}</Empty>
          )}
        </>
      ) : (
        <p className="text-center mt-20 text-sm" style={{ color: '#CBC3D7' }}>
          Search across your entire music library
        </p>
      )}
    </Centered>
  );
}