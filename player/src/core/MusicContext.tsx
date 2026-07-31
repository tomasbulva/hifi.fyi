import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { getAudioEngine, AudioEngine } from './AudioEngine';
import { getStreamUrl, getArtists, getAlbum, getCoverArtUrl, search as searchApi, getAlbumList2, getPlaylists, getSongs, getInternetRadioStations, createPlaylist, star as starSong, unstar as unstarSong } from './api';
import { googleCastProvider, googleCastControls } from './googleCastProvider';
import { sonosControls, getProxyUrl, proxyApiHeaders } from './sonosProvider';
import { useSettings } from './SettingsContext';
import { getNextRecommendation } from './companionClient';
import { imageCache } from './imageCache';
import type {
  SubsonicArtist, SubsonicAlbum, SubsonicSong,
  QueueItem, PlaybackState, CodecInfo, ViewName,
  AlbumListType, SubsonicPlaylist, SubsonicRadioStation,
  CastTarget,
} from './types';

interface MusicContextValue {
  // Playback
  playback: PlaybackState;
  play: (track: SubsonicSong) => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  nextTrack: () => void;
  prevTrack: () => void;

  // Cast
  castTarget: CastTarget | null;
  setCastTarget: (target: CastTarget | null) => void;

  // Queue
  queue: QueueItem[];
  addToQueue: (tracks: SubsonicSong | SubsonicSong[]) => void;
  replaceQueue: (tracks: SubsonicSong[]) => void;
  removeFromQueue: (index: number) => void;
  playNow: (track: SubsonicSong) => void;
  playFromQueue: (index: number) => void;
  clearQueue: () => void;
  saveQueueAsPlaylist: (name: string) => Promise<SubsonicPlaylist | null>;

  // Codec
  codecInfo: CodecInfo | null;

  // Library
  artists: SubsonicArtist[];
  loadArtists: () => Promise<void>;
  artistsHasMore: boolean;
  loadMoreArtists: () => Promise<void>;

  // Album lists by type
  albumsByType: Record<string, SubsonicAlbum[]>;
  loadAlbumList: (type: AlbumListType) => Promise<void>;
  albumsHasMore: (type: AlbumListType) => boolean;
  loadMoreAlbums: (type: AlbumListType) => Promise<void>;

  // Playlists
  playlists: SubsonicPlaylist[];
  loadPlaylists: () => Promise<void>;

  // Songs
  allSongs: SubsonicSong[];
  loadAllSongs: () => Promise<void>;
  songsHasMore: boolean;
  loadMoreSongs: () => Promise<void>;

  // Radios
  radios: SubsonicRadioStation[];
  loadRadios: () => Promise<void>;

  // Search
  searchResults: any;
  search: (query: string) => Promise<void>;

  // View
  view: ViewName;
  setView: (v: ViewName) => void;

  // Star/favourite
  starredIds: Set<string>;
  toggleStar: (songId: string) => Promise<void>;
  isStarred: (songId: string) => boolean;

  // Utility
  getCoverUrl: (id: string | undefined) => string;
  engine: AudioEngine;
}

const MusicContext = createContext<MusicContextValue | null>(null);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef(getAudioEngine());
  const engine = engineRef.current;

  const [view, setView] = useState<ViewName>('player');
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentTrack: null,
    progress: 0,
    duration: 0,
    buffered: 0,
    volume: 0.8,
    shuffle: false,
    repeat: 'off',
  });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const unshuffledQueue = useRef<QueueItem[]>([]);
  const [codecInfo, setCodecInfo] = useState<CodecInfo | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  // Sync starred state when current track changes
  useEffect(() => {
    if (!playback.currentTrack) return;
    setStarredIds(prev => {
      const next = new Set(prev);
      if (playback.currentTrack!.starred) next.add(playback.currentTrack!.id);
      else next.delete(playback.currentTrack!.id);
      return next;
    });
  }, [playback.currentTrack]);

  // Queue persistence
  const { settings } = useSettings();
  const QUEUE_STORAGE_KEY = 'hifi_queue';
  const TRACK_STORAGE_KEY = 'hifi_last_track';
  const CODEC_STORAGE_KEY = 'hifi_codec_info';

  // Restore queue on mount
  useEffect(() => {
    if (!settings.persistQueue) return;
    try {
      const rawQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
      let savedQueue: QueueItem[] = [];
      if (rawQueue) {
        savedQueue = JSON.parse(rawQueue) as QueueItem[];
        if (savedQueue.length > 0) {
          setQueue(savedQueue);
        }
      }
      const rawTrack = localStorage.getItem(TRACK_STORAGE_KEY);
      if (rawTrack) {
        const savedTrack = JSON.parse(rawTrack) as SubsonicSong;
        setPlayback(prev => ({ ...prev, currentTrack: savedTrack, duration: savedTrack.duration ?? 0 }));
        // Find the track's position in the restored queue
        const idx = savedQueue.findIndex(item => item.song.id === savedTrack.id);
        if (idx >= 0) {
          setQueueIndex(idx);
        }
      }
      // Restore codec info so the quality badge shows immediately
      const rawCodec = localStorage.getItem(CODEC_STORAGE_KEY);
      if (rawCodec) {
        setCodecInfo(JSON.parse(rawCodec) as CodecInfo);
      }
    } catch {}
  }, []); // Run once on mount

  // Save queue when it changes
  useEffect(() => {
    if (!settings.persistQueue) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
      localStorage.removeItem(TRACK_STORAGE_KEY);
      localStorage.removeItem(CODEC_STORAGE_KEY);
      return;
    }
    try {
      if (queue.length > 0) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      } else {
        localStorage.removeItem(QUEUE_STORAGE_KEY);
      }
    } catch {}
  }, [queue, settings.persistQueue]);

  // Save last played track when it changes
  useEffect(() => {
    if (!settings.persistQueue) return;
    try {
      if (playback.currentTrack) {
        localStorage.setItem(TRACK_STORAGE_KEY, JSON.stringify(playback.currentTrack));
      }
    } catch {}
  }, [playback.currentTrack, settings.persistQueue]);

  // Save codec info when it changes (so badge survives reloads)
  useEffect(() => {
    if (!settings.persistQueue) return;
    try {
      if (codecInfo) {
        localStorage.setItem(CODEC_STORAGE_KEY, JSON.stringify(codecInfo));
      } else {
        localStorage.removeItem(CODEC_STORAGE_KEY);
      }
    } catch {}
  }, [codecInfo, settings.persistQueue]);

  // Preload cover art for the current track into the image cache
  // Also handles restored tracks that may be missing coverArt by fetching album info
  useEffect(() => {
    if (!playback.currentTrack) return;
    const track = playback.currentTrack;
    const coverId = track.coverArt || (track as any).albumId;
    if (coverId) {
      const url = getCoverArtUrl(coverId);
      if (url) imageCache.fetch(url);
    } else if (track.albumId) {
      // Track missing coverArt — fetch album to get it
      getAlbum(track.albumId).then(album => {
        if (album.coverArt) {
          const url = getCoverArtUrl(album.coverArt);
          if (url) imageCache.fetch(url);
          // Update the track in playback with coverArt
          setPlayback(prev => prev.currentTrack
            ? { ...prev, currentTrack: { ...prev.currentTrack, coverArt: album.coverArt } }
            : prev
          );
        }
      }).catch(() => {});
    }
  }, [playback.currentTrack]);

  // Library state
  const [artists, setArtists] = useState<SubsonicArtist[]>([]);
  const [artistsFull, setArtistsFull] = useState<SubsonicArtist[]>([]); // full list for client-side pagination
  const [albumsByType, setAlbumsByType] = useState<Record<string, SubsonicAlbum[]>>({});
  const [albumsOffsets, setAlbumsOffsets] = useState<Record<string, number>>({});
  const [albumsLastPageSize, setAlbumsLastPageSize] = useState<Record<string, number>>({});
  const [playlists, setPlaylists] = useState<SubsonicPlaylist[]>([]);
  const [allSongs, setAllSongs] = useState<SubsonicSong[]>([]);
  const [songsOffset, setSongsOffset] = useState(0);
  const [songsHasMore, setSongsHasMore] = useState(true);
  const [radios, setRadios] = useState<SubsonicRadioStation[]>([]);
  const [searchResults, setSearchResults] = useState<any>(null);

  // Cast target tracking — when set, playback routes through Sonos
  const castTargetRef = useRef<CastTarget | null>(null);
  const [castTargetState, setCastTargetState] = useState<CastTarget | null>(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  function isCasting() {
    return castTargetRef.current !== null;
  }

  function castStreamUrl(track: SubsonicSong) {
    if (!castTargetRef.current) return;
    const streamUrl = getStreamUrl(track.id);
    const target = castTargetRef.current;

    if (target.type === 'sonos') {
      const ip = (target as any).ip;
      if (!ip) return;
      fetch(`${getProxyUrl()}/cast`, {
        method: 'POST',
        headers: proxyApiHeaders(),
        body: JSON.stringify({ ip, streamUrl, title: track.title, artist: track.artist ?? '' }),
      }).catch(() => {});
    } else {
      // Google Cast — use the provider directly
      googleCastProvider.cast(streamUrl, { title: track.title, artist: track.artist ?? '' });
    }
  }

  // ---- Queue helpers ----

  const playFromQueueIndex = useCallback((idx: number) => {
    const item = queue[idx];
    if (!item) return;
    setQueueIndex(idx);

    if (isCasting()) {
      // Send stream URL to Sonos
      castStreamUrl(item.song);
    } else {
      const s = engine.state;
      if (s.currentTrack?.id !== item.song.id) {
        engine.play(item.song);
      } else {
        engine.resume();
      }
      setCodecInfo(engine.getCodecInfo());
    }
    setPlayback(prev => ({ ...prev, currentTrack: item.song, isPlaying: true }));
  }, [queue, engine]);

  // Sync engine state to React
  useEffect(() => {
    const unsubs = [
      engine.on('timeupdate', () => {
        const s = engine.state;
        setPlayback(prev => ({ ...prev, progress: s.progress, duration: s.duration, buffered: s.buffered }));
      }),
      engine.on('play', () => setPlayback(prev => ({ ...prev, isPlaying: true }))),
      engine.on('pause', () => setPlayback(prev => ({ ...prev, isPlaying: false }))),
      engine.on('loadedmetadata', () => {
        const s = engine.state;
        setPlayback(prev => ({ ...prev, currentTrack: s.currentTrack, duration: s.duration }));
        setCodecInfo(engine.getCodecInfo());
      }),
      engine.on('ended', () => {
        // Auto-advance in queue order (shuffle scrambles the queue itself)
        if (queue.length > 0 && queueIndex >= 0) {
          let nextIdx = queueIndex + 1;
          if (playback.repeat === 'one') {
            nextIdx = queueIndex;
          } else if (playback.repeat === 'all' && nextIdx >= queue.length) {
            nextIdx = 0;
          } else if (nextIdx >= queue.length) {
            // Keep Playing: fetch next recommendation when queue ends
            if (settings.autoplay && playback.currentTrack) {
              getNextRecommendation(playback.currentTrack.id).then(song => {
                if (song) {
                  addToQueue(song);
                  playFromQueueIndex(queueIndex + 1);
                } else {
                  setPlayback(prev => ({ ...prev, isPlaying: false }));
                }
              }).catch(() => {
                setPlayback(prev => ({ ...prev, isPlaying: false }));
              });
            } else {
              setPlayback(prev => ({ ...prev, isPlaying: false }));
            }
            return;
          }
          playFromQueueIndex(nextIdx);
        }
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [engine, queue, queueIndex, playback.repeat, playFromQueueIndex]);

  // Poll Sonos for playback status while casting
  const sonosTargetIp = castTargetState?.type === 'sonos' ? (castTargetState as any)?.ip : null;
  useEffect(() => {
    if (!sonosTargetIp) return;
    let active = true;
    const pollStatus = async () => {
      if (!active) return;
      try {
        const status = await sonosControls.getStatus(sonosTargetIp);
        if (!status || !active) return;
        const parseTime = (t: string) => {
          if (!t || t === 'NOT_IMPLEMENTED' || t === '0:00:00') return 0;
          const parts = t.split(':').map(Number);
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        };
        const progress = parseTime(status.position);
        const duration = parseTime(status.duration);
        setPlayback(prev => ({
          ...prev,
          isPlaying: status.isPlaying,
          progress,
          duration: duration || prev.duration,
        }));
        // Auto-advance when track ends
        if (duration > 0 && progress >= duration && status.isPlaying) {
          // Track finished — advance queue
          // (Sonos may report PLAYING briefly at end; only advance if progress is at end)
        }
      } catch { /* ignore */ }
    };
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [sonosTargetIp]);

  const play = useCallback((track: SubsonicSong) => {
    // If queue is empty or playing outside queue, build a fresh queue
    setQueue([{ song: track, queuedAt: Date.now() }]);
    setQueueIndex(0);

    if (isCasting()) {
      castStreamUrl(track);
    } else {
      engine.play(track);
      setCodecInfo(engine.getCodecInfo());
    }
    setPlayback(prev => ({ ...prev, currentTrack: track, isPlaying: true }));
  }, [engine]);

  const pause = useCallback(() => {
    const target = castTargetRef.current;
    if (target?.type === 'sonos') {
      sonosControls.pause((target as any).ip).catch(() => {});
      setPlayback(prev => ({ ...prev, isPlaying: false }));
    } else if (target) {
      googleCastControls.pause();
      setPlayback(prev => ({ ...prev, isPlaying: false }));
    } else {
      engine.pause();
    }
  }, [engine]);

  const resume = useCallback(() => {
    const target = castTargetRef.current;
    if (target?.type === 'sonos') {
      const currentTrack = playback.currentTrack;
      if (currentTrack) {
        const streamUrl = getStreamUrl(currentTrack.id);
        const ip = (target as any).ip;
        if (ip) {
          fetch(`${getProxyUrl()}/cast`, {
            method: 'POST',
            headers: proxyApiHeaders(),
            body: JSON.stringify({ ip, streamUrl, title: currentTrack.title, artist: currentTrack.artist ?? '' }),
          }).catch(() => {});
        }
      } else {
        sonosControls.resume((target as any).ip).catch(() => {});
      }
      setPlayback(prev => ({ ...prev, isPlaying: true }));
    } else if (target) {
      googleCastControls.resume();
      setPlayback(prev => ({ ...prev, isPlaying: true }));
    } else {
      // If engine has no track loaded (e.g. after restoring from localStorage), load it
      if (!engine.state.currentTrack && playback.currentTrack) {
        engine.play(playback.currentTrack);
      } else {
        engine.resume();
      }
    }
  }, [engine, playback.currentTrack]);

  const seek = useCallback((s: number) => {
    const target = castTargetRef.current;
    if (target?.type === 'sonos') {
      sonosControls.seek((target as any).ip, s).catch(() => {});
    } else if (target) {
      googleCastControls.seek(s);
    } else {
      engine.seek(s);
    }
  }, [engine]);

  const setVolume = useCallback((v: number) => {
    const target = castTargetRef.current;
    if (target?.type === 'sonos') {
      sonosControls.setVolume((target as any).ip, Math.round(v * 100)).catch(() => {});
    } else if (target) {
      googleCastControls.setVolume(v);
    } else {
      engine.setVolume(v);
    }
    setPlayback(prev => ({ ...prev, volume: v }));
  }, [engine]);

  const toggleShuffle = useCallback(() => {
    setPlayback(prev => {
      const newShuffle = !prev.shuffle;
      if (newShuffle) {
        // Save original order, scramble queue
        unshuffledQueue.current = [...queue];
        const scrambled = [...queue];
        // Fisher-Yates shuffle
        for (let i = scrambled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
        }
        // Find current track in scrambled queue
        const currentTrack = engine.state.currentTrack;
        let newIdx = scrambled.findIndex(item => item.song.id === currentTrack?.id);
        if (newIdx === -1) newIdx = 0;
        setQueue(scrambled);
        setQueueIndex(newIdx);
      } else {
        // Restore original order
        if (unshuffledQueue.current.length > 0) {
          const currentTrack = engine.state.currentTrack;
          let newIdx = unshuffledQueue.current.findIndex(item => item.song.id === currentTrack?.id);
          if (newIdx === -1) newIdx = queueIndex;
          setQueue(unshuffledQueue.current);
          setQueueIndex(Math.max(0, newIdx));
          unshuffledQueue.current = [];
        }
      }
      return { ...prev, shuffle: newShuffle };
    });
  }, [queue, queueIndex, engine]);
  const toggleRepeat = useCallback(() => {
    setPlayback(prev => ({
      ...prev,
      repeat: prev.repeat === 'off' ? 'all' : prev.repeat === 'all' ? 'one' : 'off',
    }));
  }, []);

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return;
    let next = queueIndex + 1;
    if (next >= queue.length) next = 0;
    playFromQueueIndex(next);
  }, [queue, queueIndex, playFromQueueIndex]);

  const prevTrack = useCallback(() => {
    if (queue.length === 0) return;
    // If >3s in, restart current, else go back
    if (!isCasting()) {
      const s = engine.state;
      if (s.progress > 3) {
        engine.seek(0);
        return;
      }
    }
    let prev = queueIndex - 1;
    if (prev < 0) prev = queue.length - 1;
    playFromQueueIndex(prev);
  }, [queue, queueIndex, playFromQueueIndex, engine]);

  const addToQueue = useCallback((tracks: SubsonicSong | SubsonicSong[]) => {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    setQueue(prev => [...prev, ...list.map(song => ({ song, queuedAt: Date.now() }))]);
  }, []);

  const replaceQueue = useCallback((tracks: SubsonicSong[]) => {
    if (tracks.length === 0) return;
    const newQueue = tracks.map(song => ({ song, queuedAt: Date.now() }));
    setQueue(newQueue);
    setQueueIndex(0);
    
    if (isCasting()) {
      castStreamUrl(tracks[0]);
    } else {
      engine.stop();
      engine.play(tracks[0]);
      setCodecInfo(engine.getCodecInfo());
    }
    setPlayback(prev => ({ ...prev, currentTrack: tracks[0], isPlaying: true }));
  }, [engine]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (index < queueIndex) setQueueIndex(i => i - 1);
  }, [queueIndex]);

  const playNow = useCallback((track: SubsonicSong) => {
    if (!isCasting()) {
      engine.stop();
    }
    setQueue([{ song: track, queuedAt: Date.now() }]);
    setQueueIndex(0);

    if (isCasting()) {
      castStreamUrl(track);
    } else {
      engine.play(track);
      setCodecInfo(engine.getCodecInfo());
    }
    setPlayback(prev => ({ ...prev, currentTrack: track, isPlaying: true }));
  }, [engine]);

  const playFromQueue = useCallback((index: number) => {
    playFromQueueIndex(index);
  }, [playFromQueueIndex]);

  const clearQueue = useCallback(() => {
    const target = castTargetRef.current;
    if (target?.type === 'sonos') {
      sonosControls.stop((target as any).ip).catch(() => {});
    } else if (target) {
      googleCastControls.stop();
    } else {
      engine.stop();
    }
    setQueue([]);
    setQueueIndex(-1);
    setPlayback(prev => ({ ...prev, currentTrack: null, isPlaying: false, progress: 0, duration: 0 }));
  }, [engine]);

  // ---- Cast target management ----

  const setCastTarget = useCallback((target: CastTarget | null) => {
    // Stop local playback when starting to cast
    if (target && !castTargetRef.current) {
      engine.pause();
    }
    // Stop old target if switching or disconnecting
    if (castTargetRef.current && castTargetRef.current !== target) {
      const old = castTargetRef.current;
      if (old.type === 'sonos' && (old as any).ip) {
        sonosControls.stop((old as any).ip).catch(() => {});
      } else {
        googleCastControls.stop();
      }
    }
    castTargetRef.current = target;
    setCastTargetState(target);
    
    if (target) {
      // Send current track to the cast target (Sonos or Google Cast)
      const currentTrack = playbackRef.current.currentTrack;
      if (currentTrack) {
        castStreamUrl(currentTrack);
      }
    } else {
      // Disconnecting — resume local playback if we have a current track
      const currentTrack = playbackRef.current.currentTrack;
      if (currentTrack) {
        engine.play(currentTrack);
        setCodecInfo(engine.getCodecInfo());
      }
    }
  }, [engine]);

  const saveQueueAsPlaylist = useCallback(async (name: string): Promise<SubsonicPlaylist | null> => {
    if (queue.length === 0) return null;
    try {
      const songIds = queue.map(item => item.song.id);
      const playlist = await createPlaylist(name, songIds);
      // Refresh playlists
      const p = await getPlaylists();
      setPlaylists(p);
      return playlist;
    } catch {
      return null;
    }
  }, [queue]);

  // ---- Library ----

  const loadArtists = useCallback(async () => {
    if (artistsFull.length > 0) return;
    try {
      const a = await getArtists();
      setArtistsFull(a);
      setArtists(a.slice(0, 48));
    } catch (e) {
      console.error('Failed to load artists:', e);
    }
  }, [artistsFull.length]);

  const loadMoreArtists = useCallback(async () => {
    if (artists.length >= artistsFull.length) return;
    setArtists(artistsFull.slice(0, artists.length + 48));
  }, [artists, artistsFull]);

  const loadAlbumList = useCallback(async (type: AlbumListType) => {
    if (albumsByType[type]) return; // cached
    try {
      const albums = await getAlbumList2(type, { size: 48, offset: 0 });
      setAlbumsByType(prev => ({ ...prev, [type]: albums }));
      setAlbumsOffsets(prev => ({ ...prev, [type]: albums.length }));
      setAlbumsLastPageSize(prev => ({ ...prev, [type]: albums.length }));
    } catch (e) {
      console.error('Failed to load albums:', type, e);
      setAlbumsByType(prev => ({ ...prev, [type]: [] }));
      setAlbumsOffsets(prev => ({ ...prev, [type]: 0 }));
    }
  }, [albumsByType]);

  const albumsHasMore = useCallback((type: AlbumListType) => {
    const lastSize = albumsLastPageSize[type] ?? 0;
    return lastSize >= 48;
  }, [albumsLastPageSize]);

  const loadMoreAlbums = useCallback(async (type: AlbumListType) => {
    const offset = albumsOffsets[type] ?? 0;
    if (offset === 0) return; // not loaded yet
    try {
      const more = await getAlbumList2(type, { size: 48, offset });
      if (more.length === 0) return; // no more
      setAlbumsByType(prev => ({ ...prev, [type]: [...(prev[type] ?? []), ...more] }));
      setAlbumsOffsets(prev => ({ ...prev, [type]: offset + more.length }));
      setAlbumsLastPageSize(prev => ({ ...prev, [type]: more.length }));
    } catch (e) {
      console.error('Failed to load more albums:', type, e);
    }
  }, [albumsOffsets]);

  const loadPlaylists = useCallback(async () => {
    if (playlists.length > 0) return;
    try {
      const p = await getPlaylists();
      setPlaylists(p);
    } catch (e) {
      console.error('Failed to load playlists:', e);
    }
  }, [playlists.length]);

  const loadAllSongs = useCallback(async () => {
    if (allSongs.length > 0) return;
    try {
      const songs = await getSongs({ size: 100, offset: 0 });
      setAllSongs(songs);
      setSongsOffset(songs.length);
      setSongsHasMore(songs.length >= 100);
    } catch (e) {
      console.error('Failed to load songs:', e);
    }
  }, [allSongs.length]);

  const loadMoreSongs = useCallback(async () => {
    if (!songsHasMore) return;
    try {
      const more = await getSongs({ size: 100, offset: songsOffset });
      if (more.length === 0) {
        setSongsHasMore(false);
        return;
      }
      setAllSongs(prev => [...prev, ...more]);
      setSongsOffset(prev => prev + more.length);
      if (more.length < 100) setSongsHasMore(false);
    } catch (e) {
      console.error('Failed to load more songs:', e);
    }
  }, [songsHasMore, songsOffset]);

  const loadRadios = useCallback(async () => {
    if (radios.length > 0) return;
    try {
      const r = await getInternetRadioStations();
      setRadios(r);
    } catch (e) {
      console.error('Failed to load radios:', e);
    }
  }, [radios.length]);

  // Preload cover art images into cache when library data changes
  useEffect(() => {
    const urls: string[] = [];
    for (const a of artists) {
      const url = getCoverArtUrl(a.coverArt || a.artistImageUrl);
      if (url) urls.push(url);
    }
    imageCache.preload(urls);
  }, [artists]);

  useEffect(() => {
    const urls: string[] = [];
    for (const albums of Object.values(albumsByType)) {
      for (const a of albums) {
        const url = getCoverArtUrl(a.coverArt);
        if (url) urls.push(url);
      }
    }
    imageCache.preload(urls);
  }, [albumsByType]);

  useEffect(() => {
    const urls: string[] = [];
    for (const s of allSongs.slice(0, 200)) {
      const url = getCoverArtUrl(s.coverArt);
      if (url) urls.push(url);
    }
    imageCache.preload(urls);
  }, [allSongs]);

  const searchFn = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const results = await searchApi(query, { artistCount: 6, albumCount: 12, songCount: 24 });
    setSearchResults(results);
  }, []);

  const toggleStar = useCallback(async (songId: string) => {
    const isCurrentlyStarred = starredIds.has(songId);
    // Optimistic update
    setStarredIds(prev => {
      const next = new Set(prev);
      if (isCurrentlyStarred) next.delete(songId);
      else next.add(songId);
      return next;
    });
    // Update current track's starred field if it's the playing track
    if (playback.currentTrack?.id === songId) {
      setPlayback(prev => prev.currentTrack
        ? { ...prev, currentTrack: { ...prev.currentTrack, starred: isCurrentlyStarred ? undefined : new Date().toISOString() } }
        : prev
      );
    }
    try {
      if (isCurrentlyStarred) {
        await unstarSong(songId);
      } else {
        await starSong(songId);
      }
    } catch (e) {
      console.error('Failed to toggle star, reverting:', e);
      // Revert on error
      setStarredIds(prev => {
        const next = new Set(prev);
        if (isCurrentlyStarred) next.add(songId);
        else next.delete(songId);
        return next;
      });
      throw e; // Re-throw so the UI can show an error
    }
  }, [starredIds, playback.currentTrack]);

  const isStarredFn = useCallback((songId: string) => starredIds.has(songId), [starredIds]);

  const getCoverUrl = useCallback((id: string | undefined) => getCoverArtUrl(id), []);

  return (
    <MusicContext.Provider value={{
      playback,
      play, pause, resume, seek, setVolume,
      toggleShuffle, toggleRepeat, nextTrack, prevTrack,
      queue, addToQueue, replaceQueue, removeFromQueue, playNow, playFromQueue, clearQueue,
      saveQueueAsPlaylist,
      castTarget: castTargetState, setCastTarget,
      codecInfo,
      artists, loadArtists, artistsHasMore: artists.length < artistsFull.length, loadMoreArtists,
      albumsByType, loadAlbumList, albumsHasMore, loadMoreAlbums,
      playlists, loadPlaylists,
      allSongs, loadAllSongs, songsHasMore, loadMoreSongs,
      radios, loadRadios,
      searchResults, search: searchFn,
      view, setView,
      starredIds, toggleStar, isStarred: isStarredFn,
      getCoverUrl,
      engine,
    }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusic must be inside MusicProvider');
  return ctx;
}
