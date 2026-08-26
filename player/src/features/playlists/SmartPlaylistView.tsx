import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMusic } from '../../core/MusicContext';
import { useCompanion } from '../../core/CompanionContext';
import { getDailyMix, getArtistIntro, getGenreMix, getPlaylistCoverUrl } from '../../core/companionClient';
import type { SubsonicSong } from '../../core/types';
import { CachedCover } from '../../components/CachedCover';
import { SongTable } from '../library/SongTable';
import { Centered, Empty } from '../library/components';

type SmartKind = 'daily-mix' | 'artist-intro' | 'genre-mix';

interface SmartDetail {
  title: string;
  subtitle: string;
  coverId: string;
  songs: SubsonicSong[];
  artistName?: string;
  artistCoverArt?: string;
}

export default function SmartPlaylistView() {
  const params = useParams();
  const navigate = useNavigate();
  const { play, addToQueue, replaceQueue, getCoverUrl } = useMusic();
  const { enabled } = useCompanion();

  const kind: SmartKind = params.kind as SmartKind;
  const id = params.id || '';

  const [detail, setDetail] = useState<SmartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    async function load() {
      if (!enabled) {
        setError('Companion service not available. Enable it in Settings.');
        setLoading(false);
        return;
      }

      try {
        if (kind === 'daily-mix') {
          const mix = await getDailyMix(id);
          if (!cancelled && mix) {
            setDetail({
              title: mix.title,
              subtitle: mix.subtitle,
              coverId: mix.id,
              songs: mix.songs ?? [],
            });
          } else if (!cancelled) {
            setError('Mix not found');
          }
        } else if (kind === 'artist-intro') {
          const intro = await getArtistIntro(id);
          if (!cancelled && intro) {
            setDetail({
              title: `This is ${intro.artist.name}`,
              subtitle: `${intro.trackCount} tracks · Top songs and discovery`,
              coverId: `artist-intro-${id}`,
              songs: intro.tracks ?? [],
              artistName: intro.artist.name,
              artistCoverArt: intro.artist.coverArt,
            });
          } else if (!cancelled) {
            setError('Artist intro not available');
          }
        } else if (kind === 'genre-mix') {
          const genre = decodeURIComponent(id);
          const result = await getGenreMix(genre);
          if (!cancelled) {
            setDetail({
              title: `Best of ${genre}`,
              subtitle: `${result.length} tracks · Shuffled by rating`,
              coverId: `genre-${genre}`,
              songs: result,
            });
          }
        } else {
          setError('Unknown playlist type');
        }
      } catch (e) {
        if (!cancelled) setError('Failed to load playlist');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [kind, id, enabled]);

  function crumbs() {
    const segs: { label: string; link?: string }[] = [
      { label: 'Library', link: '/library/albums' },
      { label: 'Playlists', link: '/library/playlists' },
    ];
    if (detail) segs.push({ label: detail.title });
    return segs;
  }

  function navigateCrumb(link: string) { navigate(link); }

  if (loading) {
    return (
      <Centered>
        <div className="py-16 text-center" style={{ color: '#CBC3D7' }}>
          <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Loading playlist…</p>
        </div>
      </Centered>
    );
  }

  if (error || !detail) {
    return (
      <Centered>
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate('/library/playlists')} className="bg-transparent border-none cursor-pointer" style={{ color: '#D0BCFF' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        </div>
        <Empty>{error || 'Playlist not found'}</Empty>
      </Centered>
    );
  }

  const { title, subtitle, coverId, songs } = detail;

  return (
    <Centered>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-1.5 text-xs min-w-0" style={{ color: '#CBC3D7' }}>
        {crumbs().map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span style={{ color: 'rgba(203,195,215,0.3)' }}>/</span>}
            {seg.link ? (
              <button onClick={() => navigateCrumb(seg.link!)} className="cursor-pointer border-none p-0 text-xs bg-transparent hover:opacity-80" style={{ color: '#CBC3D7' }}>
                {seg.label}
              </button>
            ) : (
              <span className="text-xs font-bold truncate" style={{ color: '#D0BCFF' }}>{seg.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 min-w-0">
        {/* Cover */}
        <div className="w-48 h-48 md:w-52 md:h-52 flex-shrink-0 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {detail.artistCoverArt ? (
            <CachedCover url={getCoverUrl(detail.artistCoverArt)} alt={title} className="w-full h-full object-cover" />
          ) : (
            <img src={getPlaylistCoverUrl(coverId)} alt={title} className="w-full h-full object-cover" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-end">
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider self-start mb-2"
            style={{ background: 'rgba(208,188,255,0.1)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.15)' }}>
            {kind === 'daily-mix' ? 'Daily Mix' : kind === 'artist-intro' ? 'Artist Intro' : 'Genre Mix'}
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-2"
            style={{ color: '#E5E2E1', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}
            title={title}>
            {title}
          </h1>
          <p className="text-sm" style={{ color: '#CBC3D7' }}>{subtitle}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-6">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: '#D0BCFF', color: '#1A0A2E' }}
          onClick={() => { if (songs.length) { replaceQueue(songs); navigate('/player'); } }}>
          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
          Play Now
        </button>
        <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
          style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#CBC3D7' }}
          onClick={() => { if (songs.length) { addToQueue(songs); } }}
          title="Add to queue">
          <span className="material-symbols-outlined text-lg">playlist_add</span>
        </button>
        <button className="w-10 h-10 rounded-full flex items-center justify-center border cursor-pointer hover:bg-white/5 transition-colors bg-transparent"
          style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#CBC3D7' }}
          onClick={() => {
            if (!songs.length) return;
            const shuffled = [...songs].sort(() => Math.random() - 0.5);
            replaceQueue(shuffled);
            navigate('/player');
          }}
          title="Shuffle play">
          <span className="material-symbols-outlined text-lg">shuffle</span>
        </button>
      </div>

      {/* Track table */}
      {songs.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="px-4 py-3">
            <SongTable songs={songs} play={play} addToQueue={addToQueue} replaceQueue={replaceQueue}
              getCoverUrl={getCoverUrl}
              columns={['#', 'title', 'artist', 'quality', 'duration']} />
          </div>
        </div>
      ) : (
        <Empty>No tracks available. Try refreshing your library scan in Settings.</Empty>
      )}
    </Centered>
  );
}
