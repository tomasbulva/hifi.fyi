import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMusic } from '../../core/MusicContext';
import type { SubsonicAlbum } from '../../core/types';
import { Centered, Empty } from '../../features/library/components';
import { AlbumGrid } from '../../features/library/AlbumGrid';
import { SongTable } from '../../features/library/SongTable';
import { getAlbumList2 } from '../../core/api';

import { slugify } from '../../core/format';

export default function FavoritesView() {
  const {
    playback, getCoverUrl, play, addToQueue, replaceQueue,
    starredIds, allSongs, loadAllSongs,
  } = useMusic();

  const navigate = useNavigate();

  const [starredAlbums, setStarredAlbums] = useState<SubsonicAlbum[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAllSongs();
    getAlbumList2('starred', { size: 50 }).then(albs => {
      setStarredAlbums(albs);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [loadAllSongs]);

  const starredSongs = allSongs.filter(s => starredIds.has(s.id));
  const currentTrack = playback.currentTrack;

  return (
    <Centered>
      <h1 className="text-4xl font-extrabold mb-8" style={{ color: '#E5E2E1' }}>
        <span className="material-symbols-outlined text-3xl mr-2 align-middle" style={{ color: '#D0BCFF', fontVariationSettings: "'FILL' 1" }}>
          favorite
        </span>
        Favorites
      </h1>

      {/* Starred Albums */}
      {starredAlbums.length > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-bold mb-3" style={{ color: '#E5E2E1' }}>Favorite Albums</h2>
          <AlbumGrid albums={starredAlbums} getCoverUrl={getCoverUrl}
            selectAlbum={(a) => navigate(`/library/albums/${slugify(a.name)}/${a.id}`)} loaded={loaded} />
        </section>
      )}

      {/* Starred Songs */}
      {starredSongs.length > 0 ? (
        <section>
          <h2 className="text-base font-bold mb-3" style={{ color: '#E5E2E1' }}>Favorite Songs</h2>
          <SongTable songs={starredSongs}
            play={play} addToQueue={addToQueue} replaceQueue={replaceQueue}
            getCoverUrl={getCoverUrl} currentTrackId={currentTrack?.id}
            columns={['#', 'title', 'artist', 'album', 'quality', 'duration']} />
        </section>
      ) : starredAlbums.length === 0 ? (
        <Empty>No favorites yet. Click the heart on tracks and albums to add them.</Empty>
      ) : null}
    </Centered>
  );
}