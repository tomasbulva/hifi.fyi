/**
 * hifi Companion API client — talks to the recommendation backend.
 *
 * All companion endpoints live at /api/* on the unified server (same origin).
 * No configurable URL or API key needed — the cookie session handles auth.
 */

import type { SubsonicSong, ArtistStats } from './types';

// ── API methods ──

export async function checkCompanionHealth(): Promise<boolean> {
  try {
    const res = await fetch(`/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getHotTrackIds(threshold?: number): Promise<Set<string>> {
  try {
    const params = threshold ? `?threshold=${threshold}` : '';
    const res = await fetch(`/api/hot${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.songs as string[]);
  } catch {
    return new Set();
  }
}

export async function getCompanionStatus(): Promise<{ scanning: boolean; total_songs: number; progress: number; last_scan: string } | null> {
  try {
    const res = await fetch(`/api/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function triggerScan(): Promise<boolean> {
  try {
    const res = await fetch(`/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSmartPlaylist(params: {
  mood?: string;
  era?: string;
  topRated?: boolean;
  limit?: number;
}): Promise<SubsonicSong[]> {
  try {
    const qs = new URLSearchParams();
    if (params.mood) qs.set('mood', params.mood);
    if (params.era) qs.set('era', params.era);
    if (params.topRated) qs.set('topRated', 'true');
    if (params.limit) qs.set('limit', String(params.limit));

    const res = await fetch(`/api/playlist?${qs}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.songs as SubsonicSong[];
  } catch {
    return [];
  }
}

export async function getRadioTracks(seed: string, limit = 50): Promise<SubsonicSong[]> {
  try {
    const res = await fetch(`/api/radio?seed=${encodeURIComponent(seed)}&limit=${limit}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.songs as SubsonicSong[];
  } catch {
    return [];
  }
}

export async function getNextRecommendation(currentSongId: string): Promise<SubsonicSong | null> {
  try {
    const res = await fetch(`/api/next?currentSong=${encodeURIComponent(currentSongId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.song as SubsonicSong | null;
  } catch {
    return null;
  }
}

export async function getDailyMixes(): Promise<any[]> {
  try {
    const res = await fetch(`/api/daily-mixes`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.mixes ?? [];
  } catch { return []; }
}

export async function getDailyMix(id: string): Promise<{ id: string; title: string; subtitle: string; songs: SubsonicSong[] } | null> {
  try {
    const res = await fetch(`/api/daily-mix/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function getArtistIntro(artistId: string): Promise<{ artist: { id: string; name: string; coverArt?: string }; tracks: SubsonicSong[]; trackCount: number } | null> {
  try {
    const res = await fetch(`/api/artist-intro/${encodeURIComponent(artistId)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function getGenres(): Promise<{ genre: string; count: number }[]> {
  try {
    const res = await fetch(`/api/genres`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.genres ?? [];
  } catch { return []; }
}

export async function getGenreMix(genre: string): Promise<SubsonicSong[]> {
  try {
    const res = await fetch(`/api/genre-mix/${encodeURIComponent(genre)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.songs ?? [];
  } catch { return []; }
}

export function getPlaylistCoverUrl(id: string): string {
  return `/api/playlist-cover/${encodeURIComponent(id)}`;
}

export interface SongRating {
  id: string;
  rating: number; // 0-5
  starred: boolean;
  playCount: number;
  genre: string;
  mood: string;
}

export async function getSongRating(songId: string): Promise<SongRating | null> {
  try {
    const res = await fetch(`/api/song/${encodeURIComponent(songId)}/rating`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json() as SongRating;
  } catch {
    return null;
  }
}

// ── Library browser: whole-library sorting/filtering over the companion cache ──

export type SongSort = 'most-played' | 'least-played' | 'recently-played' | 'favorites' | 'top-rated' | 'play-now' | 'newest' | 'oldest' | 'neglected';
export type ArtistSort = 'most-played' | 'least-played' | 'recently-played' | 'favorites' | 'golden-years' | 'play-now' | 'neglected';

export async function getSongsExtended(sort: SongSort, offset = 0, limit = 100, opts?: { genre?: string; shuffle?: boolean }): Promise<{ songs: SubsonicSong[]; total: number }> {
  try {
    const qs = new URLSearchParams({ sort, offset: String(offset), limit: String(limit) });
    if (opts?.genre) qs.set('genre', opts.genre);
    if (opts?.shuffle) qs.set('shuffle', 'true');
    const res = await fetch(`/api/songs-extended?${qs}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { songs: [], total: 0 };
    return await res.json();
  } catch { return { songs: [], total: 0 }; }
}

export async function getArtistsExtended(sort: ArtistSort, offset = 0, limit = 100, opts?: { shuffle?: boolean }): Promise<{ artists: ArtistStats[]; total: number }> {
  try {
    const qs = new URLSearchParams({ sort, offset: String(offset), limit: String(limit) });
    if (opts?.shuffle) qs.set('shuffle', 'true');
    const res = await fetch(`/api/artists-extended?${qs}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { artists: [], total: 0 };
    return await res.json();
  } catch { return { artists: [], total: 0 }; }
}
