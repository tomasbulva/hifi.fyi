import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMusic } from '../../core/MusicContext';
import { getAlbum, getArtist, getPlaylist, star, unstar } from '../../core/api';
import type { SubsonicArtist, SubsonicAlbum, AlbumListType, SubsonicSong, SubsonicPlaylist } from '../../core/types';
import { Centered, Breadcrumb, Empty } from './components';
import { LibraryTabs } from './LibraryTabs';
import { AlbumGrid } from './AlbumGrid';
import { SongTable } from './SongTable';
import { CachedCover } from '../../components/CachedCover';
import { useToast } from '../../components/Toast';
import { formatTime, slugify } from '../../core/format';
import { LOSSLESS_FORMATS } from '../../core/quality';
import { getDailyMixes, getPlaylistCoverUrl, getGenres, getSmartPlaylist } from '../../core/companionClient';
import { useCompanion } from '../../core/CompanionContext';
import { useSettings } from '../../core/SettingsContext';

type LibTab = 'albums' | 'artists' | 'playlists' | 'songs';

const TABS: { id: LibTab; label: string }[] = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'songs', label: 'Songs' },
];

const VALID_TABS: LibTab[] = ['playlists', 'albums', 'artists', 'songs'];

const ALBUM_FILTERS: Record<string, AlbumListType> = {
  'all': 'alphabeticalByName',
  'recently-added': 'newest',
  'recently-played': 'recent',
  'favorites': 'starred',
  'top-rated': 'highest',
  'most-played': 'frequent',
  'random': 'random',
};

const HEADER_LABELS: Record<LibTab, string> = {
  playlists: 'Your Playlists',
  albums: 'Your Albums',
  artists: 'Your Artists',
  songs: 'Your Songs',
};

const CARD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
const CARD_HDR = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' };

// Event playlists — mood/activity-based, generated from companion mood data
const EVENT_PLAYLISTS = [
  { id: 'easy-sunday', title: 'Easy Sunday', subtitle: 'Relaxed morning vibes', icon: 'wb_sunny', mood: 'chill' },
  { id: 'family-dinner', title: 'Family Dinner', subtitle: 'Warm and comforting', icon: 'restaurant', mood: 'chill' },
  { id: 'focus-session', title: 'Focus Session', subtitle: 'Deep concentration', icon: 'psychology', mood: 'focus' },
  { id: 'late-night', title: 'Late Night', subtitle: 'Moody and atmospheric', icon: 'dark_mode', mood: 'dark' },
  { id: 'workout', title: 'Workout', subtitle: 'High energy tracks', icon: 'fitness_center', mood: 'energetic' },
  { id: 'road-trip', title: 'Road Trip', subtitle: 'Driving anthems', icon: 'directions_car', mood: 'energetic' },
];

function artistCoverUrl(artist: SubsonicArtist, getCoverUrl: (id: string | undefined) => string): string {
  return getCoverUrl(artist.coverArt || artist.artistImageUrl);
}

// ── Bento featured section: large card + 2×2 grid ──
function FeaturedSection<T extends { id: string }>({
  items, renderFeatured, renderCompact,
}: {
  items: T[];
  renderFeatured: (item: T) => React.ReactNode;
  renderCompact: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  const featured = items[0];
  const secondary = items.slice(1, 5);
  const rest = items.slice(5);
  return (
    <div className="py-4 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderFeatured(featured)}
        {secondary.length > 0 && (
          <div className="grid grid-cols-2 gap-4">{secondary.map(renderCompact)}</div>
        )}
      </div>
      {rest.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {rest.map(renderCompact)}
        </div>
      )}
    </div>
  );
}

// ── Playlist quality helper ──
function playlistQuality(songs: SubsonicSong[]): { label: string; isHiRes: boolean } {
  if (songs.length === 0) return { label: '—', isHiRes: false };
  const counts = new Map<string, number>();
  let losslessCount = 0;
  let hiResCount = 0;
  songs.forEach(s => {
    const sfx = (s.suffix ?? '').toLowerCase();
    if (!sfx) return;
    counts.set(sfx, (counts.get(sfx) || 0) + 1);
    if (LOSSLESS_FORMATS.includes(sfx)) {
      losslessCount++;
      if ((s.bitRate ?? 0) >= 2304) hiResCount++;
    }
  });
  // Find most common
  let common = '';
  let max = 0;
  counts.forEach((c, k) => { if (c > max) { max = c; common = k; } });
  const commonLossless = LOSSLESS_FORMATS.includes(common);
  const isHiRes = commonLossless && hiResCount > songs.length / 2;
  return {
    label: commonLossless ? (isHiRes ? 'HI-RES' : 'LOSSLESS') : (common.toUpperCase() || '—'),
    isHiRes,
  };
}

export default function LibraryView() {
  const {
    playback, artists, loadArtists, artistsHasMore, loadMoreArtists,
    getCoverUrl, play, addToQueue, replaceQueue,
    albumsByType, loadAlbumList, albumsHasMore, loadMoreAlbums,
    playlists, loadPlaylists,
    allSongs, loadAllSongs, songsHasMore, loadMoreSongs,
  } = useMusic();
  const navigate = useNavigate();
  const toast = useToast();
  const { enabled: companionEnabled, scanStatus } = useCompanion();
  const { settings } = useSettings();
  const showSmartPlaylists = companionEnabled && settings.smartPlaylists;
  const params = useParams();
  const currentTrack = playback.currentTrack;

  // ── Parse URL ──
  const albumId = params.albumId || '';
  const artistId = params.artistId || '';
  const playlistId = params.playlistId || '';
  const tab: LibTab = params.tab && VALID_TABS.includes(params.tab as LibTab) ? (params.tab as LibTab) : 'playlists';

  const [filter, setFilter] = useState('all');
  const [dailyMixes, setDailyMixes] = useState<any[]>([]);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);

  // Load daily mixes + genres when on playlists tab (only if companion is enabled)
  useEffect(() => {
    if (!showSmartPlaylists) {
      setDailyMixes([]);
      setGenres([]);
      return;
    }
    if (tab !== 'playlists' || albumId || artistId || playlistId) return;
    getDailyMixes().then(mixes => {
      setDailyMixes(mixes);
    }).catch(() => setDailyMixes([]));
    getGenres().then(g => {
      setGenres(g);
    }).catch(() => setGenres([]));
  }, [tab, albumId, artistId, playlistId, showSmartPlaylists, scanStatus?.scanning, scanStatus?.progress, scanStatus?.total_songs]);

  // Show toasts for scanning status (only on state transitions, not every poll)
  const wasScanning = useRef(false);
  useEffect(() => {
    if (!scanStatus) return;
    if (scanStatus.scanning && !wasScanning.current) {
      // Scanning just started
      toast.show(`Scanning library… ${scanStatus.total_songs ? `${scanStatus.progress}/${scanStatus.total_songs}` : 'starting'} songs`);
      wasScanning.current = true;
    } else if (!scanStatus.scanning && wasScanning.current) {
      // Scanning just finished
      toast.show(`Scan complete: ${scanStatus.total_songs} songs indexed`);
      wasScanning.current = false;
    } else if (scanStatus.scanning && scanStatus.progress > 0) {
      // Still scanning — update progress toast occasionally (every ~50 songs)
      if (scanStatus.progress % 50 === 0 || scanStatus.progress >= (scanStatus.total_songs || Infinity)) {
        toast.show(`Scanning… ${Math.round((scanStatus.progress / (scanStatus.total_songs || 1)) * 100)}% (${scanStatus.progress}/${scanStatus.total_songs})`);
      }
    }
  }, [scanStatus?.scanning, scanStatus?.progress, scanStatus?.total_songs]);

  // ── Infinite scroll sentry ──
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMoreRef.current?.(); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, filter, allSongs.length, artists.length, albumsByType]);

  // ── Detail state (fetched by ID from URL) ──
  const [detailAlbum, setDetailAlbum] = useState<SubsonicAlbum & { song: SubsonicSong[] } | null>(null);
  const [detailArtist, setDetailArtist] = useState<SubsonicArtist & { album: SubsonicAlbum[] } | null>(null);
  const [detailPlaylist, setDetailPlaylist] = useState<SubsonicPlaylist & { entry: SubsonicSong[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [albumStarred, setAlbumStarred] = useState(false);
  const [discoFilter, setDiscoFilter] = useState<'albums' | 'singles'>('albums');

  // Fetch detail when URL param changes
  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    setDetailAlbum(null);
    setDetailArtist(null);
    setDetailPlaylist(null);

    async function load() {
      if (albumId) {
        try {
          const a = await getAlbum(albumId);
          if (!cancelled) { setDetailAlbum(a); setAlbumStarred(!!a.starred); }
        } catch { /* 404 etc */ }
      } else if (artistId) {
        try {
          const a = await getArtist(artistId);
          if (!cancelled) {
            setDetailArtist(a);
            const albs = a.album ?? [];
            const hasAlbs = albs.some(ab => (ab.songCount ?? 0) > 1);
            const hasSgls = albs.some(ab => (ab.songCount ?? 0) === 1);
            setDiscoFilter(hasAlbs ? 'albums' : hasSgls ? 'singles' : 'albums');
          }
        } catch { /* */ }
      } else if (playlistId) {
        try {
          const p = await getPlaylist(playlistId);
          if (!cancelled) setDetailPlaylist(p);
        } catch { /* */ }
      }
      if (!cancelled) setDetailLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [albumId, artistId, playlistId]);

  // Load list data
  const loadersRef = useRef({ loadArtists, loadAlbumList, loadPlaylists, loadAllSongs });
  loadersRef.current = { loadArtists, loadAlbumList, loadPlaylists, loadAllSongs };
  useEffect(() => {
    if (albumId || artistId || playlistId) return; // don't load lists while viewing detail
    const { loadArtists, loadAlbumList, loadPlaylists, loadAllSongs } = loadersRef.current;
    switch (tab) {
      case 'albums': loadAlbumList(ALBUM_FILTERS[filter] || 'alphabeticalByName'); break;
      case 'artists': loadArtists(); break;
      case 'playlists': loadPlaylists(); break;
      case 'songs': loadAllSongs(); break;
    }
  }, [tab, filter, albumId, artistId, playlistId]);

  const setTab = useCallback((newTab: string) => {
    setFilter('all');
    navigate(`/library/${newTab}`);
  }, [navigate]);

  // ── Build breadcrumbs ──
  function crumbs(): { label: string; link?: string }[] {
    const segs: { label: string; link?: string }[] = [{ label: 'Library', link: '/library/albums' }];
    if (albumId) {
      segs.push({ label: 'Albums', link: '/library/albums' });
      if (detailAlbum) segs.push({ label: detailAlbum.name });
    } else if (artistId) {
      segs.push({ label: 'Artists', link: '/library/artists' });
      if (detailArtist) segs.push({ label: detailArtist.name });
    } else if (playlistId) {
      segs.push({ label: 'Playlists', link: '/library/playlists' });
      if (detailPlaylist) segs.push({ label: detailPlaylist.name });
    }
    return segs;
  }

  function navigateCrumb(link: string) { navigate(link); }

  // ══════════════════════════════════════════
  // ALBUM DETAIL
  // ══════════════════════════════════════════
  if (albumId) {
    if (detailLoading) return <Centered><Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} /><Empty>Loading…</Empty></Centered>;
    if (!detailAlbum) return <Centered><Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} /><Empty>Album not found</Empty></Centered>;
    const album = detailAlbum;
    const songs = album.song ?? [];
    
    async function handleAlbumStar() {
      const wasStarred = albumStarred;
      setAlbumStarred(!wasStarred);
      try {
        if (wasStarred) await unstar(album.id);
        else await star(album.id);
      } catch { setAlbumStarred(wasStarred); }
    }
    return (
      <Centered>
        <Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} />
        {/* Bento top section */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 min-w-0">
          {/* Main card — left */}
          <div className="flex-1 min-w-0 rounded-2xl p-6 md:p-8 flex flex-col" style={CARD_HDR}>
            <div className="flex gap-6 flex-1">
              <CachedCover url={getCoverUrl(album.coverArt)} alt={album.name}
                className="w-40 h-40 md:w-48 md:h-48 rounded-xl object-cover flex-shrink-0" />
              <div className="flex flex-col flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#D0BCFF' }}>Album</span>
                <h1 className="text-2xl md:text-3xl font-extrabold leading-tight mb-2"
                  title={album.name}
                  style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                  {album.name}
                </h1>
                <p className="text-sm" style={{ color: '#CBC3D7' }}>
                  {album.artistId ? (
                    <button
                      onClick={() => navigate(`/library/artists/${slugify(album.artist ?? '')}/${album.artistId ?? ''}`)}
                      className="bg-transparent border-none p-0 cursor-pointer hover:underline hover:opacity-80"
                      style={{ color: '#D0BCFF' }}>
                      {album.artist}
                    </button>
                  ) : album.artist}
                  {album.year ? ` · ${album.year}` : ''}
                </p>
              </div>
            </div>
            {/* Buttons at bottom */}
            <div className="flex items-center gap-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
                style={{ background: '#D0BCFF', color: '#1A0A2E' }}
                onClick={() => { songs.length && replaceQueue(songs); navigate('/player'); }}>
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                Play
              </button>
              <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#CBC3D7' }}
                onClick={() => { if (!songs.length) return; addToQueue(songs); toast.show(`${songs.length} tracks added to queue`); }}>
                <span className="material-symbols-outlined text-lg">playlist_add</span>
              </button>
              <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
                style={{ borderColor: albumStarred ? 'rgba(208,188,255,0.3)' : 'rgba(255,255,255,0.1)', color: albumStarred ? '#D0BCFF' : '#CBC3D7' }}
                onClick={handleAlbumStar}
                title={albumStarred ? 'Unfavorite' : 'Favorite'}>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: albumStarred ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
              </button>
            </div>
          </div>

          {/* Right info tiles — 3 cards */}
          <div className="flex flex-col gap-3 md:w-44 flex-shrink-0">
            <div className="rounded-xl px-4 py-3" style={CARD}>
              <span className="text-[9px] font-bold uppercase tracking-widest block mb-0.5" style={{ color: '#CBC3D7' }}>Released</span>
              <span className="text-lg font-extrabold" style={{ color: '#E5E2E1' }}>{album.year ?? '—'}</span>
            </div>
            <div className="rounded-xl px-4 py-3" style={CARD}>
              <span className="text-[9px] font-bold uppercase tracking-widest block mb-0.5" style={{ color: '#CBC3D7' }}>Genre</span>
              <span className="text-sm font-semibold" style={{ color: '#E5E2E1' }}>{album.genre || 'Unknown'}</span>
            </div>
            <div className="rounded-xl px-4 py-3" style={CARD}>
              <span className="text-[9px] font-bold uppercase tracking-widest block mb-0.5" style={{ color: '#CBC3D7' }}>Duration</span>
              <span className="text-sm font-semibold" style={{ color: '#E5E2E1' }}>
                {album.duration ? formatTime(album.duration) : songs.reduce((t, s) => t + (s.duration ?? 0), 0)
                  ? formatTime(songs.reduce((t, s) => t + (s.duration ?? 0), 0))
                  : '—'}
              </span>
              <span className="text-[10px] block" style={{ color: '#CBC3D7' }}>{album.songCount ?? songs.length} tracks</span>
            </div>
          </div>
        </div>

        {/* Track table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="px-4 py-3">
            <SongTable songs={songs} play={play} addToQueue={addToQueue} replaceQueue={replaceQueue}
              getCoverUrl={getCoverUrl} currentTrackId={currentTrack?.id} showSelection
              columns={['checkbox', '#', 'title', 'quality', 'duration']} compact />
          </div>
        </div>
      </Centered>
    );
  }

  // ══════════════════════════════════════════
  // ARTIST DETAIL
  // ══════════════════════════════════════════
  if (artistId) {
    if (detailLoading) return <Centered><Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} /><Empty>Loading…</Empty></Centered>;
    if (!detailArtist) return <Centered><Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} /><Empty>Artist not found</Empty></Centered>;
    const artist = detailArtist;
    const artistAlbums = artist.album ?? [];
    
    // ponytail: songCount > 1 = album, songCount === 1 = single
    const albums = artistAlbums.filter(a => (a.songCount ?? 0) > 1);
    const singles = artistAlbums.filter(a => (a.songCount ?? 0) === 1);
    const hasAlbums = albums.length > 0;
    const hasSingles = singles.length > 0;
    const discoAlbums = discoFilter === 'albums' ? albums : singles;
    return (
      <Centered>
        <Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} />
        {/* Bento top section */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 min-w-0">
          {/* Hero image card */}
          <div className="relative rounded-2xl overflow-hidden flex-1 min-w-0 min-h-[220px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <CachedCover url={artistCoverUrl(artist, getCoverUrl)} alt={artist.name}
              className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h1 className="text-3xl font-extrabold"
                title={artist.name}
                style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{artist.name}</h1>
              {artist.albumCount !== undefined && (
                <p className="text-sm mt-1" style={{ color: '#CBC3D7' }}>
                  {artist.albumCount} Albums · {artistAlbums.reduce((t, a) => t + (a.songCount ?? 0), 0)} Tracks
                </p>
              )}
            </div>
          </div>

          {/* Right tiles — wider, two rows */}
          <div className="flex flex-col gap-3 md:w-56 flex-shrink-0">
            {/* Top row: Albums count */}
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={CARD}>
              <span className="material-symbols-outlined text-xl" style={{ color: '#44E2CD' }}>album</span>
              <div>
                <span className="text-lg font-extrabold block" style={{ color: '#E5E2E1' }}>
                  {artist.albumCount ?? artistAlbums.length}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#CBC3D7' }}>Albums</span>
              </div>
            </div>
            {/* Bottom row: Genre + Latest */}
            <div className="flex gap-3">
              <div className="flex-1 min-w-0 rounded-xl px-4 py-3 flex flex-col justify-center" style={CARD}>
                <span className="material-symbols-outlined text-base mb-1" style={{ color: '#FFB800' }}>bolt</span>
                <span className="text-sm font-semibold" style={{ color: '#E5E2E1' }}>
                  {artistAlbums.find(a => a.genre)?.genre || 'Unknown'}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#CBC3D7' }}>Genre</span>
              </div>
              {artistAlbums.length > 0 && (() => {
                const latest = artistAlbums[artistAlbums.length - 1];
                return (
                <div className="flex-1 min-w-0 rounded-xl px-3 py-3 flex items-center gap-2 cursor-pointer hover:bg-white/[0.06] transition-colors"
                  style={CARD}
                  onClick={() => navigate(`/library/albums/${slugify(latest.name)}/${latest.id ?? ''}`)}>
                  <CachedCover url={getCoverUrl(latest.coverArt)} alt=""
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-widest block" style={{ color: '#CBC3D7' }}>Latest</span>
                    <span className="text-xs font-semibold truncate block" style={{ color: '#E5E2E1' }}>
                      {latest.name}
                    </span>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Artist Intro — "This is ..." */}
        {showSmartPlaylists && (
        <div className="mb-8 rounded-2xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
          onClick={() => navigate(`/smart/artist-intro/${artistId}`)}>
          <div className="flex items-center gap-4 p-5">
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
              <CachedCover url={artistCoverUrl(artist, getCoverUrl)} alt={artist.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-widest block mb-1" style={{ color: '#D0BCFF' }}>Artist Intro</span>
              <h2 className="text-lg font-extrabold truncate" style={{ color: '#E5E2E1' }}>This is {artist.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#CBC3D7' }}>Top tracks and discovery</p>
            </div>
            <span className="material-symbols-outlined text-2xl" style={{ color: '#CBC3D7' }}>chevron_right</span>
          </div>
        </div>
        )}

        {/* Popular tracks — top 5 */}
        {artistAlbums.length > 0 && (() => {
          const topSongs = artistAlbums.flatMap(a => (a as any).song ?? []).slice(0, 5);
          if (topSongs.length === 0) return null;
          return (
            <div className="rounded-2xl overflow-hidden mb-8" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="px-4 py-3">
                <h2 className="text-sm font-bold mb-3" style={{ color: '#E5E2E1' }}>Popular Tracks</h2>
                <SongTable songs={topSongs} play={play} addToQueue={addToQueue} replaceQueue={replaceQueue}
                  getCoverUrl={getCoverUrl} currentTrackId={currentTrack?.id}
                  columns={['#', 'title', 'duration']} compact />
              </div>
            </div>
          );
        })()}

        {/* Discography */}
        {artistAlbums.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-sm font-bold" style={{ color: '#E5E2E1' }}>Discography</h2>
              {hasAlbums && hasSingles && (
              <div className="flex items-center rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <button className="px-3 py-1 rounded-md text-xs font-semibold border-none cursor-pointer"
                  style={{ background: discoFilter === 'albums' ? 'rgba(255,255,255,0.10)' : 'transparent', color: discoFilter === 'albums' ? '#E5E2E1' : '#CBC3D7' }}
                  onClick={() => setDiscoFilter('albums')}>Albums</button>
                <button className="px-3 py-1 rounded-md text-xs font-semibold border-none cursor-pointer"
                  style={{ background: discoFilter === 'singles' ? 'rgba(255,255,255,0.10)' : 'transparent', color: discoFilter === 'singles' ? '#E5E2E1' : '#CBC3D7' }}
                  onClick={() => setDiscoFilter('singles')}>Singles</button>
              </div>
              )}
            </div>
            <AlbumGrid albums={discoAlbums}
              selectAlbum={(a) => navigate(`/library/albums/${slugify(a.name)}/${a.id}`)}
              getCoverUrl={getCoverUrl} loaded />
          </div>
        )}
      </Centered>
    );
  }

  // ══════════════════════════════════════════
  // PLAYLIST DETAIL
  // ══════════════════════════════════════════
  if (playlistId) {
    if (detailLoading) return <Centered><Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} /><Empty>Loading…</Empty></Centered>;
    if (!detailPlaylist) return <Centered><Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} /><Empty>Playlist not found</Empty></Centered>;
    const pl = detailPlaylist;
    const entries = pl.entry ?? [];
    const q = playlistQuality(entries);
    return (
      <Centered>
        <Breadcrumb segments={crumbs()} onNavigate={navigateCrumb} />

        {/* Bento top section */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 min-w-0">
          {/* Cover card — square, top-left */}
          <div className="w-48 h-48 md:w-52 md:h-52 flex-shrink-0 rounded-2xl overflow-hidden" style={CARD_HDR}>
            <CachedCover url={getCoverUrl(pl.coverArt)} alt={pl.name}
              className="w-full h-full object-cover" />
          </div>

          {/* Description card + sub-cards */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Main description box */}
            <div className="flex-1 rounded-2xl p-5 md:p-6 flex flex-col" style={CARD_HDR}>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(208,188,255,0.1)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.15)' }}>
                  Curated Playlist
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold mb-2"
                style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}
                title={pl.name}>
                {pl.name}
              </h1>
              {pl.comment && (
                <PlaylistDescription text={pl.comment} />
              )}
            </div>

            {/* Sub-cards row: Tracks + Quality */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl px-4 py-3" style={CARD}>
                <span className="text-[9px] font-bold uppercase tracking-widest block mb-0.5" style={{ color: '#CBC3D7' }}>Total Tracks</span>
                <span className="text-lg font-extrabold" style={{ color: '#E5E2E1' }}>{pl.songCount ?? entries.length}</span>
                <span className="text-[10px] block" style={{ color: '#CBC3D7' }}>
                  {pl.duration ? `${Math.floor(pl.duration / 3600)}h ${Math.floor((pl.duration % 3600) / 60)}m` : `${entries.reduce((t, s) => t + (s.duration ?? 0), 0) ? formatTime(entries.reduce((t, s) => t + (s.duration ?? 0), 0)) : '—'}`}
                </span>
              </div>
              <div className="flex-1 rounded-xl px-4 py-3" style={CARD}>
                <span className="text-[9px] font-bold uppercase tracking-widest block mb-0.5" style={{ color: '#CBC3D7' }}>Audio Quality</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold" style={{ color: q.isHiRes ? '#44E2CD' : '#E5E2E1' }}>{q.label}</span>
                  {q.isHiRes && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: 'rgba(68,226,205,0.12)', color: '#44E2CD', border: '1px solid rgba(68,226,205,0.25)' }}>
                      HI-RES
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mb-6">
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #D0BCFF, #9B7FFF)', color: '#1A0A2E' }}
            onClick={() => entries.length && replaceQueue(entries)}>
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            Play Now
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#CBC3D7' }}>
            <span className="material-symbols-outlined text-lg">shuffle</span>
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#CBC3D7' }}>
            <span className="material-symbols-outlined text-lg">favorite</span>
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#CBC3D7' }}>
            <span className="material-symbols-outlined text-lg">more_horiz</span>
          </button>
        </div>

        {/* Track table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="px-4 py-3">
            <SongTable songs={entries} play={play} addToQueue={addToQueue} replaceQueue={replaceQueue}
              getCoverUrl={getCoverUrl} currentTrackId={currentTrack?.id}
              columns={['#', 'title', 'artist', 'quality', 'duration']} />
          </div>
        </div>
      </Centered>
    );
  }
  // ══════════════════════════════════════════
  // MAIN LIBRARY TABS
  // ══════════════════════════════════════════
  return (
    <Centered>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-4xl font-extrabold" style={{ color: '#E5E2E1' }}>
          {HEADER_LABELS[tab]}
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/search')} className="bg-transparent border-none cursor-pointer hover:opacity-80 p-1">
            <span className="material-symbols-outlined text-2xl" style={{ color: '#CBC3D7' }}>search</span>
          </button>
        </div>
      </div>
      <LibraryTabs tabs={TABS} active={tab} onChange={setTab} filter={filter} onFilter={setFilter} />

      {tab === 'albums' && (() => {
        const albs = albumsByType[ALBUM_FILTERS[filter]] ?? [];
        const albumListType = ALBUM_FILTERS[filter];
        loadMoreRef.current = albumsHasMore(albumListType) ? () => loadMoreAlbums(albumListType) : null;
        return (
          <>
          <FeaturedSection items={albs}
            renderFeatured={a => (
              <div className="group relative rounded-2xl overflow-hidden cursor-pointer"
                onClick={() => navigate(`/library/albums/${slugify(a.name)}/${a.id}`)}>
                <CachedCover url={getCoverUrl(a.coverArt)} alt={a.name}
                  className="w-full aspect-[4/5] md:aspect-auto md:h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest mb-2"
                    style={{ background: 'rgba(208,188,255,0.2)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.3)' }}>
                    Album
                  </span>
                  <h3 className="text-xl font-extrabold" title={a.name}
                    style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{a.name}</h3>
                  <p className="text-sm mt-0.5" style={{ color: '#CBC3D7' }}>{a.artist}{a.year ? ` · ${a.year}` : ''}</p>
                </div>
              </div>
            )}
            renderCompact={a => (
              <div key={a.id} className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-white/[0.03]"
                onClick={() => navigate(`/library/albums/${slugify(a.name)}/${a.id}`)}>
                <div className="relative overflow-hidden rounded-lg mb-2 aspect-square">
                  <CachedCover url={getCoverUrl(a.coverArt)} alt={a.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                </div>
                <h3 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{a.name}</h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: '#CBC3D7' }}>{a.artist ?? 'Unknown'}</p>
              </div>
            )}
          />
          {albumsHasMore(albumListType) && (
            <div ref={sentinelRef} className="h-8" />
          )}
          </>
        );
      })()}

      {tab === 'artists' && (() => {
        loadMoreRef.current = (artistsHasMore && artists.length > 0) ? loadMoreArtists : null;
        return (
          <>
          <FeaturedSection items={artists}
          renderFeatured={a => (
            <div className="relative rounded-2xl overflow-hidden cursor-pointer group"
              onClick={() => navigate(`/library/artists/${slugify(a.name)}/${a.id}`)}>
              <CachedCover url={artistCoverUrl(a, getCoverUrl)} alt={a.name}
                className="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-xl font-extrabold" title={a.name}
                  style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{a.name}</h3>
                {a.albumCount !== undefined && (
                  <p className="text-sm mt-0.5" style={{ color: '#CBC3D7' }}>{a.albumCount} albums</p>
                )}
              </div>
            </div>
          )}
          renderCompact={a => (
            <div key={a.id} className="flex flex-col items-center rounded-lg p-3 cursor-pointer hover:bg-white/[0.03] transition-all"
              onClick={() => navigate(`/library/artists/${slugify(a.name)}/${a.id}`)}>
              <CachedCover url={artistCoverUrl(a, getCoverUrl)} alt={a.name}
                className="mb-2 h-24 w-24 rounded-full object-cover transition-transform group-hover:scale-105 flex-shrink-0" />
              <span className="text-sm font-medium truncate w-full text-center" style={{ color: '#E5E2E1' }}>{a.name}</span>
            </div>
          )}
        />
        {artistsHasMore && artists.length > 0 && (
          <div ref={sentinelRef} className="h-8" />
        )}
        </>
      );
      })()}

      {tab === 'playlists' && (() => (
        <>
        {showSmartPlaylists && dailyMixes.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#CBC3D7' }}>Daily Mixes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 stagger-children">
              {dailyMixes.map(mix => (
                <div key={mix.id} className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-white/[0.03]"
                  onClick={() => navigate(`/smart/daily-mix/${mix.id}`)}>
                  <div className="relative overflow-hidden rounded-lg mb-2 aspect-square">
                    <img src={getPlaylistCoverUrl(mix.id)} alt={mix.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl" style={{ color: '#E5E2E1', fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{mix.title}</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#CBC3D7' }}>{mix.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Event Playlists */}
        {showSmartPlaylists && (
        <div className="mb-8">
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#CBC3D7' }}>Mood & Moments</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 stagger-children">
            {EVENT_PLAYLISTS.map(card => (
              <div key={card.id} className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-white/[0.03]"
                onClick={() => {
                  getSmartPlaylist({ mood: card.mood, limit: 50 }).then(songs => {
                    if (songs.length > 0) { replaceQueue(songs); navigate('/player'); }
                    else { toast.show('No tracks found — try running a library scan in Settings'); }
                  }).catch(() => toast.show('Failed to generate playlist'));
                }}>
                <div className="relative overflow-hidden rounded-lg mb-2 aspect-square flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="material-symbols-outlined text-4xl" style={{ color: '#D0BCFF' }}>{card.icon}</span>
                </div>
                <h3 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{card.title}</h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: '#CBC3D7' }}>{card.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
        )}
        {/* Genre Mixes */}
        {showSmartPlaylists && genres.length > 0 && (
          <div className="mb-8">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#CBC3D7' }}>Genre Mixes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 stagger-children">
              {genres.slice(0, 10).map(g => (
                <div key={g.genre} className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-white/[0.03]"
                  onClick={() => navigate(`/smart/genre-mix/${encodeURIComponent(g.genre)}`)}>
                  <div className="relative overflow-hidden rounded-lg mb-2 aspect-square">
                    <img src={getPlaylistCoverUrl(`genre-${g.genre}`)} alt={g.genre} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl" style={{ color: '#E5E2E1', fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{g.genre}</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#CBC3D7' }}>{g.count} tracks</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <FeaturedSection items={playlists}
          renderFeatured={pl => (
            <div className="group relative rounded-2xl overflow-hidden cursor-pointer"
              onClick={() => navigate(`/library/playlists/${slugify(pl.name)}/${pl.id}`)}>
              <CachedCover url={getCoverUrl(pl.coverArt)} alt={pl.name}
                className="w-full aspect-[4/5] md:aspect-auto md:h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest mb-2"
                  style={{ background: 'rgba(208,188,255,0.2)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.3)' }}>
                  Playlist
                </span>
                <h3 className="text-xl font-extrabold" title={pl.name}
                  style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{pl.name}</h3>
                <p className="text-sm mt-0.5" style={{ color: '#CBC3D7' }}>
                  {pl.owner ? `${pl.owner} · ` : ''}{pl.songCount ?? 0} tracks
                </p>
              </div>
            </div>
          )}
          renderCompact={pl => (
            <div key={pl.id} className="group cursor-pointer rounded-lg p-2 transition-all hover:bg-white/[0.03]"
              onClick={() => navigate(`/library/playlists/${slugify(pl.name)}/${pl.id}`)}>
              <div className="relative overflow-hidden rounded-lg mb-2 aspect-square">
                <CachedCover url={getCoverUrl(pl.coverArt)} alt={pl.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl" style={{ color: '#E5E2E1', fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                </div>
              </div>
              <h3 className="text-sm font-semibold truncate" style={{ color: '#E5E2E1' }}>{pl.name}</h3>
              <p className="text-xs mt-0.5" style={{ color: '#CBC3D7' }}>{pl.songCount ? `${pl.songCount} tracks` : ''}</p>
            </div>
          )}
        />
        </>
      ))()}

      {tab === 'songs' && (() => {
        loadMoreRef.current = songsHasMore ? loadMoreSongs : null;
        return allSongs.length === 0 ? <Empty>Loading songs…</Empty> : (
          <>
          <SongTable songs={allSongs} play={play} addToQueue={addToQueue} replaceQueue={replaceQueue}
            getCoverUrl={getCoverUrl} currentTrackId={currentTrack?.id} showSelection
            columns={['checkbox', '#', 'title', 'album', 'quality', 'duration']} />
          {songsHasMore && <div ref={sentinelRef} className="h-8" />}
          </>
        );
      })()}
    </Centered>
  );
}

// ── Playlist description with expand/collapse ──
function PlaylistDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="text-sm" style={{ color: '#CBC3D7' }}>
      <div
        style={expanded ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } : {
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          overflowWrap: 'anywhere',
        }}
      >{text}</div>
      <button onClick={() => setExpanded(!expanded)}
        className="mt-1 bg-transparent border-none cursor-pointer font-semibold"
        style={{ color: '#D0BCFF' }}>
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
