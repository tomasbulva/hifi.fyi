import type { SubsonicAlbum } from '../../core/types';
import { CachedCover } from '../../components/CachedCover';

interface AlbumGridProps {
  albums: SubsonicAlbum[];
  loaded?: boolean;
  selectAlbum: (a: SubsonicAlbum) => void;
  getCoverUrl: (id: string | undefined) => string;
}

export function AlbumGrid({ albums, loaded, selectAlbum, getCoverUrl }: AlbumGridProps) {
  if (albums.length === 0) return (
    <p className="mt-10 text-center text-sm" style={{ color: '#CBC3D7' }}>
      {loaded ? 'No albums found' : 'Loading…'}
    </p>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 py-4">
      {albums.map(album => (
        <div
          key={album.id}
          className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-white/[0.03]"
          onClick={() => selectAlbum(album)}
        >
          <div className="relative overflow-hidden rounded-lg mb-2 aspect-square">
            <CachedCover
              url={getCoverUrl(album.coverArt)}
              alt={album.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl"
                style={{ color: '#E5E2E1', fontVariationSettings: "'FILL' 1" }}>
                play_arrow
              </span>
            </div>
          </div>
          <h3 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{album.name}</h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#CBC3D7' }}>
            {album.artist ?? 'Unknown'}{album.year ? ` · ${album.year}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}