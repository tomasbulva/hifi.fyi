/**
 * Last.fm API client — fetches track metadata for ratings.
 * Maps listener counts to a 1-5 rating scale.
 */

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

let apiKey = '';

export function setLastfmKey(key: string) {
  apiKey = key;
}

export function hasLastfmKey(): boolean {
  return !!apiKey;
}

interface LastfmTrackInfo {
  name: string;
  url: string;
  duration: string;
  listeners: string;
  playcount: string;
  artist: { name: string; url: string };
  toptags?: { tag: { name: string; url: string }[] };
  wiki?: { summary: string; content: string };
}

/**
 * Fetch track info from Last.fm.
 * Returns listeners and playcount which we map to a 1-5 rating.
 */
export async function getTrackInfo(artist: string, track: string): Promise<{ listeners: number; playcount: number } | null> {
  if (!apiKey) return null;
  try {
    const params = new URLSearchParams({
      method: 'track.getInfo',
      api_key: apiKey,
      artist,
      track,
      format: 'json',
    });
    const res = await fetch(`${LASTFM_BASE}?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { track?: LastfmTrackInfo };
    if (!data.track) return null;
    return {
      listeners: parseInt(data.track.listeners || '0', 10),
      playcount: parseInt(data.track.playcount || '0', 10),
    };
  } catch {
    return null;
  }
}

/**
 * Map listener count to a 1-5 rating.
 * Scale (based on typical Last.fm listener counts):
 *   < 50K listeners  -> 1 star (niche)
 *   50K-200K         -> 2 stars
 *   200K-500K        -> 3 stars
 *   500K-2M          -> 4 stars
 *   > 2M             -> 5 stars (mainstream/popular)
 */
export function listenersToRating(listeners: number): number {
  if (listeners >= 2_000_000) return 5;
  if (listeners >= 500_000) return 4;
  if (listeners >= 200_000) return 3;
  if (listeners >= 50_000) return 2;
  if (listeners > 0) return 1;
  return 0;
}
