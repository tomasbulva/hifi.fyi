/**
 * Subsonic API client — talks to Navidrome using token+salt auth.
 * Fresh salt per request for security.
 */

import { createHash } from 'crypto';
import type { SubsonicSong, SubsonicAlbum, SubsonicResponse } from './types.js';

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'hifi-companion';

export class SubsonicClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    if (!this.baseUrl.endsWith('/rest')) this.baseUrl += '/rest';
    this.username = username;
    this.password = password;
  }

  private makeAuthParams(): string {
    const salt = this.generateSalt();
    const token = createHash('md5').update(this.password + salt).digest('hex');
    return `u=${encodeURIComponent(this.username)}&t=${token}&s=${salt}&v=${API_VERSION}&c=${CLIENT_NAME}&f=json`;
  }

  private generateSalt(): string {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  private async request(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');

    const url = `${this.baseUrl}/${endpoint}?${this.makeAuthParams()}${qs ? '&' + qs : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as SubsonicResponse;
    const sr = data['subsonic-response'];
    if (!sr || sr.status === 'failed') {
      throw new Error(sr?.error?.message ?? 'Unknown Subsonic error');
    }
    return sr;
  }

  async ping(): Promise<boolean> {
    const sr = await this.request('ping.view');
    return sr.status === 'ok';
  }

  async getAlbumList2(type: string, size = 500, offset = 0): Promise<SubsonicAlbum[]> {
    const sr = await this.request('getAlbumList2.view', { type, size, offset });
    return sr.albumList2?.album ?? [];
  }

  async getAlbum(id: string): Promise<SubsonicAlbum & { song: SubsonicSong[] }> {
    const sr = await this.request('getAlbum.view', { id });
    return sr.album;
  }

  async getSimilarSongs2(id: string, count = 50): Promise<SubsonicSong[]> {
    const sr = await this.request('getSimilarSongs2.view', { id, count });
    return sr.similarSongs2?.song ?? [];
  }

  async getTopSongs(artist: string, count = 50): Promise<SubsonicSong[]> {
    const sr = await this.request('getTopSongs.view', { artist, count });
    return sr.topSongs?.song ?? [];
  }

  async getRandomSongs(size = 50, fromYear?: number, toYear?: number, genre?: string): Promise<SubsonicSong[]> {
    const sr = await this.request('getRandomSongs.view', { size, fromYear, toYear, genre });
    return sr.randomSongs?.song ?? [];
  }

}
