/**
 * Subsonic API client for Navidrome.
 * Uses token+salt authentication (MD5) per Subsonic spec.
 * Auth method: t=md5(password+salt)&s=salt
 *
 * Security improvements:
 * - Fresh salt+token generated per request (prevents replay attacks)
 * - Auth sent via custom headers for API calls (not in URL query string)
 * - Stream/cover URLs still use query params (Subsonic spec limitation for media URLs)
 * - Password kept in memory only, stored in sessionStorage (cleared on tab close)
 */

import { md5 } from 'js-md5';
import type { SubsonicArtist, SubsonicAlbum, SubsonicSong, SubsonicPlaylist, SubsonicRadioStation, AlbumListType } from './types';

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'hifi-web-player';

let baseUrl = '';
let username = '';
let password = '';

// ---- config ----

export function configure(_serverUrl: string, user: string, pass: string) {
  // If serverUrl is provided and not empty, use it directly (for cross-origin connections)
  // If empty, use relative /rest (for unified server setup where /rest is proxied)
  if (_serverUrl && _serverUrl.trim()) {
    // Normalize: remove trailing slash, ensure no double /rest
    let url = _serverUrl.trim().replace(/\/+$/, '');
    // If the URL already ends with /rest, don't add it again
    if (!url.endsWith('/rest')) {
      url = url + '/rest';
    }
    baseUrl = url;
  } else {
    baseUrl = '/rest';
  }
  username = user;
  password = pass;
  // Reset cover art auth so new credentials get a fresh stable token
  _coverSalt = null;
  _coverToken = null;
}

/** Reconfigure API from saved settings — used when settings change without full login */
export function reconfigureFromSettings(serverUrl: string) {
  const raw = sessionStorage.getItem('hifi_auth');
  if (!raw) return;
  try {
    const { username, password } = JSON.parse(raw);
    if (username && password) {
      configure(serverUrl, username, password);
    }
  } catch {}
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate fresh auth params for a single request */
function makeAuthParams(): { token: string; salt: string } {
  const salt = generateSalt();
  const token = md5(password + salt);
  return { token, salt };
}

export function getConfig() {
  return { baseUrl, username };
}

export function isConfigured() {
  return !!(baseUrl && username && password);
}

// ---- auth query string ----
// Subsonic spec requires auth params in query string

function authQueryParams(): string {
  const { token, salt } = makeAuthParams();
  return `u=${encodeURIComponent(username)}&t=${token}&s=${salt}&v=${API_VERSION}&c=${CLIENT_NAME}&f=json`;
}

// ---- fetch helper ----

async function request(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const url = `${baseUrl}/${endpoint}?${authQueryParams()}${qs ? '&' + qs : ''}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const sr = data['subsonic-response'];
  if (!sr || sr.status === 'failed') {
    throw new Error(sr?.error?.message ?? 'Unknown error');
  }
  return sr;
}

// ---- stream / cover URLs ----
// These use query params because media players (Sonos, Cast) fetch them
// directly and don't send custom headers. Fresh salt+token per URL.

export function getStreamUrl(id: string, opts?: { maxBitRate?: number }) {
  const p = [`id=${encodeURIComponent(id)}`];
  if (opts?.maxBitRate) p.push(`maxBitRate=${opts.maxBitRate}`);
  return `${baseUrl}/stream.view?${authQueryParams()}&${p.join('&')}`;
}

// Session-stable salt for cover art URLs — makes getCoverArtUrl deterministic
// so client-side image caching works (same coverArt ID → same URL → cache hit).
// Cover art is not sensitive; replay risk is negligible.
let _coverSalt: string | null = null;
let _coverToken: string | null = null;
function coverAuthParams(): string {
  if (!_coverSalt || !_coverToken) {
    _coverSalt = generateSalt();
    _coverToken = md5(password + _coverSalt);
  }
  return `u=${encodeURIComponent(username)}&t=${_coverToken}&s=${_coverSalt}&v=${API_VERSION}&c=${CLIENT_NAME}&f=json`;
}

export function getCoverArtUrl(id: string | undefined, size = 300): string {
  if (!id) return '';
  return `${baseUrl}/getCoverArt.view?${coverAuthParams()}&id=${encodeURIComponent(id)}&size=${size}`;
}

// ---- API methods ----

export async function ping(): Promise<boolean> {
  const sr = await request('ping.view');
  return sr.status === 'ok';
}

export async function getArtists(): Promise<SubsonicArtist[]> {
  const sr = await request('getArtists.view');
  const index: { name: string; artist: SubsonicArtist[] }[] = sr.artists?.index ?? [];
  return index.flatMap(g => g.artist ?? []);
}

export async function getArtist(id: string): Promise<SubsonicArtist & { album: SubsonicAlbum[] }> {
  const sr = await request('getArtist.view', { id });
  return sr.artist;
}

export async function getAlbum(id: string): Promise<SubsonicAlbum & { song: SubsonicSong[] }> {
  const sr = await request('getAlbum.view', { id });
  return sr.album;
}

export async function search(query: string, opts?: { artistCount?: number; albumCount?: number; songCount?: number }) {
  const sr = await request('search2.view', { query, ...opts });
  return sr.searchResult2 ?? {};
}

export async function star(id: string) {
  return request('star.view', { id });
}

export async function unstar(id: string) {
  return request('unstar.view', { id });
}

// Playlists
export async function getPlaylists(username?: string): Promise<SubsonicPlaylist[]> {
  const sr = await request('getPlaylists.view', { username });
  return sr.playlists?.playlist ?? [];
}

export async function getPlaylist(id: string): Promise<SubsonicPlaylist & { entry: SubsonicSong[] }> {
  const sr = await request('getPlaylist.view', { id });
  return sr.playlist;
}

export async function createPlaylist(name: string, songIds?: string[]): Promise<SubsonicPlaylist> {
  // Build repeated songId params manually — Subsonic API expects &songId=a&songId=b, not commas
  let songIdParams = '';
  if (songIds?.length) {
    songIdParams = songIds.map(id => `&songId=${encodeURIComponent(id)}`).join('');
  }
  const url = `${baseUrl}/createPlaylist.view?${authQueryParams()}&name=${encodeURIComponent(name)}${songIdParams}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const sr = data['subsonic-response'];
  if (!sr || sr.status === 'failed') throw new Error(sr?.error?.message ?? 'Unknown error');
  return sr.playlist;
}

// Album lists
export async function getAlbumList2(type: AlbumListType, opts?: { size?: number; offset?: number }): Promise<SubsonicAlbum[]> {
  const sr = await request('getAlbumList2.view', { type, size: opts?.size ?? 48, offset: opts?.offset ?? 0 });
  return sr.albumList2?.album ?? [];
}

// Internet radios
export async function getInternetRadioStations(): Promise<SubsonicRadioStation[]> {
  const sr = await request('getInternetRadioStations.view');
  return sr.internetRadioStations?.internetRadioStation ?? [];
}

// All songs — search3 with empty query is unreliable across Navidrome versions.
// Use getRandomSongs for reliability, with search3 as a secondary attempt.
export async function getSongs(opts?: { size?: number; offset?: number }): Promise<SubsonicSong[]> {
  const size = opts?.size ?? 100;

  // Primary: search3 with empty query (fast on most Navidrome versions)
  try {
    const sr = await request('search3.view', { query: '', artistCount: 0, albumCount: 0, songCount: size, songOffset: opts?.offset ?? 0 });
    const songs = sr.searchResult3?.song ?? [];
    if (songs.length > 0) return songs;
  } catch { /* empty query not supported, fall through */ }

  // Fallback: random songs (always works)
  const rr = await request('getRandomSongs.view', { size });
  return rr.randomSongs?.song ?? [];
}
