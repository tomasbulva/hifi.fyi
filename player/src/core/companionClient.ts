/**
 * hifi Companion API client — talks to the optional recommendation backend.
 *
 * The companion service scans the Navidrome library, caches ratings/tags in SQLite,
 * and provides smart playlist generation, hot track marking, and radio mode.
 */

import type { SubsonicSong } from './types';

let COMPANION_URL = '';
let COMPANION_API_KEY = '';

function resolveCompanionUrl(): string {
  // Both dev and production use relative /api — Vite proxy (dev) or unified server (prod)
  return '/api';
}

function resolveApiKey(): string {
  try {
    const raw = localStorage.getItem('hifi_settings');
    if (raw) {
      const settings = JSON.parse(raw);
      return settings.companionApiKey || '';
    }
  } catch {}
  return '';
}

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (COMPANION_API_KEY) h['X-API-Key'] = COMPANION_API_KEY;
  return h;
}

export function getCompanionUrl(): string {
  return COMPANION_URL;
}

/** Reload URL and API key from settings */
export function reloadCompanionSettings() {
  COMPANION_URL = resolveCompanionUrl();
  COMPANION_API_KEY = resolveApiKey();
}

// Initialize on load
reloadCompanionSettings();

// ── API methods ──

export async function checkCompanionHealth(): Promise<boolean> {
  if (!COMPANION_URL) return false;
  try {
    const res = await fetch(`${COMPANION_URL}/health`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getHotTrackIds(threshold?: number): Promise<Set<string>> {
  if (!COMPANION_URL) return new Set();
  try {
    const params = threshold ? `?threshold=${threshold}` : '';
    const res = await fetch(`${COMPANION_URL}/hot${params}`, {
      headers: apiHeaders(),
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
  if (!COMPANION_URL) return null;
  try {
    const res = await fetch(`${COMPANION_URL}/status`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function triggerScan(): Promise<boolean> {
  if (!COMPANION_URL) return false;
  try {
    const res = await fetch(`${COMPANION_URL}/refresh`, {
      method: 'POST',
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
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
  if (!COMPANION_URL) return [];
  try {
    const qs = new URLSearchParams();
    if (params.mood) qs.set('mood', params.mood);
    if (params.era) qs.set('era', params.era);
    if (params.topRated) qs.set('topRated', 'true');
    if (params.limit) qs.set('limit', String(params.limit));

    const res = await fetch(`${COMPANION_URL}/playlist?${qs}`, {
      headers: apiHeaders(),
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
  if (!COMPANION_URL) return [];
  try {
    const res = await fetch(`${COMPANION_URL}/radio?seed=${encodeURIComponent(seed)}&limit=${limit}`, {
      headers: apiHeaders(),
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
  if (!COMPANION_URL) return null;
  try {
    const res = await fetch(`${COMPANION_URL}/next?currentSong=${encodeURIComponent(currentSongId)}`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.song as SubsonicSong | null;
  } catch {
    return null;
  }
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
  if (!COMPANION_URL) return null;
  try {
    const res = await fetch(`${COMPANION_URL}/song/${encodeURIComponent(songId)}/rating`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json() as SongRating;
  } catch {
    return null;
  }
}
