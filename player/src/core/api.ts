/**
 * Subsonic API client for Navidrome.
 * Uses token+salt authentication (MD5) per Subsonic spec.
 *
 * All requests use relative /rest — the browser stays same-origin.
 * The unified server proxies /rest → Navidrome (dynamic target).
 * Credentials are stored in memory only (via AuthContext.getNavidromeCreds()).
 * No credentials in localStorage or sessionStorage.
 */

import { md5 } from 'js-md5';
import type { SubsonicArtist, SubsonicAlbum, SubsonicSong, SubsonicPlaylist, SubsonicRadioStation, AlbumListType } from './types';

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'hifi-web-player';

// Credentials are kept in module-scoped memory — set by AuthContext on login/session restore.
let _username = '';
let _password = '';

// Stable salt/token for cover-art URLs (replayed across requests so the browser
// cache isn't busted on every render).
let _coverSalt: string | null = null;
let _coverToken: string | null = null;

/** Called by AuthContext after successful login or session restore. */
export function configure(_serverUrl: string, user: string, pass: string) {
  _username = user;
  _password = pass;
  _coverSalt = null;
  _coverToken = null;
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function makeAuthParams(): { token: string; salt: string } {
  const salt = generateSalt();
  const token = md5(_password + salt);
  return { token, salt };
}

export function getConfig() {
  return { baseUrl:  '/rest', username: _username };
}

export function isConfigured() {
  return !!(_username && _password);
}

// ---- auth query string ----
// Subsonic spec requires auth params in query string

function authQueryParams(): string {
  const { token, salt } = makeAuthParams();
  return `u=${encodeURIComponent(_username)}&t=${token}&s=${salt}&v=${API_VERSION}&c=${CLIENT_NAME}&f=json`;
}

// ---- fetch helper ----

async function request(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const url = `/rest/${endpoint}?${authQueryParams()}${qs ? '&' + qs : ''}`;

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
  return `/rest/stream.view?${authQueryParams()}&${p.join('&')}`;
}

// Session-stable salt for cover art URLs — makes getCoverArtUrl deterministic
// so client-side image caching works (same coverArt ID → same URL → cache hit).
// Cover art is not sensitive; replay risk is negligible.
function coverAuthParams(): string {
  if (!_coverSalt || !_coverToken) {
    _coverSalt = generateSalt();
    _coverToken = md5(_password + _coverSalt);
  }
  return `u=${encodeURIComponent(_username)}&t=${_coverToken}&s=${_coverSalt}&v=${API_VERSION}&c=${CLIENT_NAME}&f=json`;
}

export function getCoverArtUrl(id: string | undefined, size = 300): string {
  if (!id) return '';
  return `/rest/getCoverArt.view?${coverAuthParams()}&id=${encodeURIComponent(id)}&size=${size}`;
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

/** Rate a song 0-5 (0 clears the rating). */
export async function setRating(id: string, rating: number) {
  return request('setRating.view', { id, rating });
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
  const url = `/rest/createPlaylist.view?${authQueryParams()}&name=${encodeURIComponent(name)}${songIdParams}`;
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
