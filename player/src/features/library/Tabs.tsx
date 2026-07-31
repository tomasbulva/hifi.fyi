import { useState } from 'react';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import type { SubsonicArtist, SubsonicAlbum, SubsonicSong, AlbumListType, SubsonicPlaylist } from '../../core/types';
import { LOSSLESS_FORMATS } from '../../core/quality';
import { AlbumGrid } from './AlbumGrid';
import { SongList } from './SongList';
import { Label, Empty } from './components';
import { SmartPlaylistsGrid, SmartPlaylistDetail, type SmartPlaylistCard } from './SmartPlaylists';
import { CachedCover } from '../../components/CachedCover';

function artistCoverUrl(artist: SubsonicArtist, getCoverUrl: (id: string | undefined) => string): string {
  return getCoverUrl(artist.coverArt || artist.artistImageUrl);
}

// ── Albums Tab ──

const ALBUM_SECTIONS: { type: AlbumListType; label: string }[] = [
  { type: 'newest', label: 'Recently Added' },
  { type: 'random', label: 'Random' },
  { type: 'starred', label: 'Favourites' },
  { type: 'highest', label: 'Top Rated' },
  { type: 'recent', label: 'Recently Played' },
  { type: 'frequent', label: 'Most Played' },
  { type: 'alphabeticalByName', label: 'All Albums' },
];

export function AlbumsTab({
  section, setSection, albumsByType, selectAlbum, getCoverUrl, addToQueue, replaceQueue, hasMore, onLoadMore,
}: {
  section: number;
  setSection: (i: number) => void;
  albumsByType: Record<string, SubsonicAlbum[]>;
  selectAlbum: (a: SubsonicAlbum) => void;
  getCoverUrl: (id: string | undefined) => string;
  addToQueue: (tracks: SubsonicSong | SubsonicSong[]) => void;
  replaceQueue: (tracks: SubsonicSong[]) => void;
  hasMore: (type: AlbumListType) => boolean;
  onLoadMore: (type: AlbumListType) => Promise<void>;
}) {
  const currentType = ALBUM_SECTIONS[section].type;
  const sentinelRef = useInfiniteScroll(() => onLoadMore(currentType), hasMore(currentType));
  return (
    <>
      <div className="scrollbar-none flex gap-1 overflow-x-auto pb-3">
        {ALBUM_SECTIONS.map((s, i) => (
          <button
            key={s.type}
            onClick={() => setSection(i)}
            className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-label-sm font-label cursor-pointer border-none transition-colors ${
              section === i
                ? 'bg-primary-container/30 text-primary font-semibold'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >{s.label}</button>
        ))}
      </div>
      <AlbumGrid
        albums={albumsByType[ALBUM_SECTIONS[section].type] ?? []}
        loaded={albumsByType[ALBUM_SECTIONS[section].type] !== undefined}
        selectAlbum={selectAlbum}
        getCoverUrl={getCoverUrl}
        addToQueue={addToQueue}
        replaceQueue={replaceQueue}
      />
      {hasMore(currentType) && <div ref={sentinelRef} className="h-10" />}
    </>
  );
}

// ── Artists Tab ──

export function ArtistsTab({
  artists, selectArtist, getCoverUrl, hasMore, onLoadMore,
}: {
  artists: SubsonicArtist[];
  selectArtist: (a: SubsonicArtist) => void;
  getCoverUrl: (id: string | undefined) => string;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const sentinelRef = useInfiniteScroll(() => onLoadMore(), hasMore);
  if (artists.length === 0) return <Empty>Loading artists…</Empty>;
  return (
    <div className="grid gap-4 py-4 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
      {artists.map((artist) => (
        <div
          key={artist.id}
          className="group flex flex-col items-center rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-surface-container-high"
          onClick={() => selectArtist(artist)}
        >
          <CachedCover
            url={artistCoverUrl(artist, getCoverUrl)}
            alt={artist.name}
            className="mb-3 h-[120px] w-[120px] flex-shrink-0 rounded-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <Label>{artist.name}</Label>
        </div>
      ))}
      {hasMore && <div ref={sentinelRef} className="h-10" />}
    </div>
  );
}

// ── Featured playlist section (bento: featured + 2×2) ──

function FeaturedPlaylistSection({
  playlists, selectPlaylist, getCoverUrl,
}: {
  playlists: SubsonicPlaylist[];
  selectPlaylist: (p: SubsonicPlaylist) => void;
  getCoverUrl: (id: string | undefined) => string;
}) {
  const featured = playlists[0];
  const secondary = playlists.slice(1, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Featured playlist */}
      <div
        className="group relative overflow-hidden rounded-2xl cursor-pointer aspect-[4/5] md:aspect-auto"
        onClick={() => selectPlaylist(featured)}
      >
        <CachedCover
          url={getCoverUrl(featured.coverArt)}
          alt={featured.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-2">
          <span className="text-label-sm text-secondary font-bold uppercase tracking-widest bg-secondary/20 backdrop-blur-sm self-start px-2 py-0.5 rounded-full border border-secondary/30">
            Playlist
          </span>
          <h3 className="text-headline-md text-on-surface font-bold truncate">{featured.name}</h3>
          <p className="text-on-surface-variant text-sm truncate">
            {featured.owner ?? ''} · {featured.songCount ?? 0} tracks
          </p>
          <button
            className="flex items-center gap-1.5 self-start rounded-full px-4 py-2 text-label-sm font-semibold bg-primary text-on-primary border-none cursor-pointer hover:scale-105 transition-transform mt-1"
            onClick={e => { e.stopPropagation(); selectPlaylist(featured); }}
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            Play
          </button>
        </div>
      </div>

      {/* 2×2 grid */}
      {secondary.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {secondary.map(pl => (
            <div
              key={pl.id}
              className="group flex flex-col rounded-xl cursor-pointer transition-all hover:bg-surface-container-high p-2"
              onClick={() => selectPlaylist(pl)}
            >
              <div className="relative overflow-hidden rounded-xl mb-2">
                <CachedCover
                  url={getCoverUrl(pl.coverArt)}
                  alt={pl.name}
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <span className="material-symbols-outlined text-3xl text-on-surface" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                </div>
              </div>
              <Label>{pl.name}</Label>
              <span className="text-xs text-on-surface-variant mt-0.5 truncate">{pl.songCount ?? 0} tracks</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Playlists Tab ──

export function PlaylistsTab({
  playlists, selectPlaylist, getCoverUrl, replaceQueue, play, addToQueue,
}: {
  playlists: SubsonicPlaylist[];
  selectPlaylist: (p: SubsonicPlaylist) => void;
  getCoverUrl: (id: string | undefined) => string;
  replaceQueue: (tracks: SubsonicSong[]) => void;
  play: (s: SubsonicSong) => void;
  addToQueue: (tracks: SubsonicSong | SubsonicSong[]) => void;
}) {
  const [smartDetail, setSmartDetail] = useState<SmartPlaylistCard | null>(null);

  // Smart playlist detail view
  if (smartDetail) {
    return (
      <SmartPlaylistDetail
        key={smartDetail.id}
        card={smartDetail}
        onBack={() => setSmartDetail(null)}
        replaceQueue={replaceQueue}
        play={play}
        addToQueue={addToQueue}
        getCoverUrl={getCoverUrl}
      />
    );
  }

  return (
    <div className="py-4 space-y-8">
      {/* Smart playlists section */}
      <div>
        <h3 className="mb-3 text-label-sm uppercase tracking-widest text-on-surface-variant font-label">
          Smart Playlists
        </h3>
        <SmartPlaylistsGrid onSelect={setSmartDetail} />
      </div>

      {/* Navidrome playlists */}
      {playlists.length === 0 ? (
        <Empty>No playlists yet</Empty>
      ) : (
        <>
          {/* Featured + 2x2 */}
          <FeaturedPlaylistSection
            playlists={playlists}
            selectPlaylist={selectPlaylist}
            getCoverUrl={getCoverUrl}
          />

          {/* Rest as 4-column grid */}
          {playlists.length > 5 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {playlists.slice(5).map(pl => (
                <div
                  key={pl.id}
                  className="group flex flex-col rounded-xl cursor-pointer transition-all hover:bg-surface-container-high p-2"
                  onClick={() => selectPlaylist(pl)}
                >
                  <div className="relative overflow-hidden rounded-xl mb-2">
                    <CachedCover
                      url={getCoverUrl(pl.coverArt)}
                      alt={pl.name}
                      className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <span className="material-symbols-outlined text-3xl text-on-surface" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  </div>
                  <Label>{pl.name}</Label>
                  <span className="text-xs text-on-surface-variant mt-0.5 truncate">{pl.songCount ?? 0} tracks</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Songs Tab ──

export function SongsTab({
  songs, play, addToQueue, replaceQueue, getCoverUrl, hasMore, onLoadMore,
}: {
  songs: SubsonicSong[];
  play: (s: SubsonicSong) => void;
  addToQueue: (tracks: SubsonicSong | SubsonicSong[]) => void;
  replaceQueue: (tracks: SubsonicSong[]) => void;
  getCoverUrl: (id: string | undefined) => string;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const sentinelRef = useInfiniteScroll(() => onLoadMore(), hasMore);
  if (songs.length === 0) return <Empty>Loading songs…</Empty>;
  return (
    <>
      <SongList songs={songs} play={play} addToQueue={addToQueue} replaceQueue={replaceQueue} getCoverUrl={getCoverUrl} />
      {hasMore && <div ref={sentinelRef} className="h-10" />}
    </>
  );
}

// ── Radios Tab ──

export function RadiosTab({ radios }: { radios: any[] }) {
  if (radios.length === 0) return <Empty>No internet radio stations configured</Empty>;
  return (
    <div className="grid gap-4 py-4 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
      {radios.map((r) => (
        <div
          key={r.id}
          className="group flex flex-col items-center rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-surface-container-high"
        >
          <div className="mb-3 flex h-[120px] w-[120px] flex-shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant transition-transform duration-300 group-hover:scale-105">
            <span className="material-symbols-outlined text-5xl">radio</span>
          </div>
          <Label>{r.name}</Label>
          <a
            href={r.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary mt-0.5"
          >Open stream</a>
        </div>
      ))}
    </div>
  );
}

// ── Album Codec Summary ──

export function AlbumCodecSummary({ songs }: { songs: SubsonicSong[] }) {
  if (!songs || songs.length === 0) return null;
  const codecs = new Map<string, number>();
  for (const s of songs) {
    const suffix = (s.suffix ?? '?').toLowerCase();
    codecs.set(suffix, (codecs.get(suffix) || 0) + 1);
  }
  const parts = [...codecs.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([codec, count]) => {
      const lossless = LOSSLESS_FORMATS.includes(codec);
      return { label: `${lossless ? '◆ ' : ''}${codec.toUpperCase()}${count < songs.length ? ` (${count})` : ''}`, lossless };
    });

  if (parts.length === 0) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      {parts.map((p, i) => (
        <span
          key={i}
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold font-mono-ui ${
            p.lossless
              ? 'bg-secondary/15 text-secondary border border-secondary/20'
              : 'bg-tertiary/15 text-tertiary border border-tertiary/20'
          }`}
        >{p.label}</span>
      ))}
    </span>
  );
}
