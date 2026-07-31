/**
 * Library scanner — pulls all songs from Navidrome via Subsonic API.
 * Iterates through all albums, fetching songs for each.
 */

import type { SubsonicClient } from './subsonic.js';
import type { CompanionDB } from './database.js';

const ALBUM_TYPES = ['newest', 'alphabeticalByName'] as const;

export class Scanner {
  private client: SubsonicClient;
  private db: CompanionDB;
  private scanning = false;

  constructor(client: SubsonicClient, db: CompanionDB) {
    this.client = client;
    this.db = db;
  }

  get isScanning(): boolean {
    return this.scanning;
  }

  async scan(): Promise<{ totalSongs: number; totalAlbums: number }> {
    if (this.scanning) throw new Error('Scan already in progress');
    this.scanning = true;

    try {
      // Fetch all albums using multiple sort types to catch everything
      const seenAlbumIds = new Set<string>();
      const allAlbums: { id: string }[] = [];

      for (const type of ALBUM_TYPES) {
        let offset = 0;
        const size = 500;
        while (true) {
          const batch = await this.client.getAlbumList2(type, size, offset);
          if (batch.length === 0) break;
          for (const a of batch) {
            if (!seenAlbumIds.has(a.id)) {
              seenAlbumIds.add(a.id);
              allAlbums.push(a);
            }
          }
          if (batch.length < size) break;
          offset += size;
        }
      }

      console.log(`[scanner] Found ${allAlbums.length} albums, fetching songs...`);

      let processed = 0;
      let totalSongs = 0;

      for (const album of allAlbums) {
        try {
          const albumData = await this.client.getAlbum(album.id);
          const songs = albumData.song ?? [];
          for (const song of songs) {
            this.db.upsertSong(song);
            totalSongs++;
          }
          processed++;
          if (processed % 50 === 0) {
            this.db.updateScanStatus(true, Math.round((processed / allAlbums.length) * 100), totalSongs);
            console.log(`[scanner] ${processed}/${allAlbums.length} albums, ${totalSongs} songs`);
          }
        } catch (err) {
          console.warn(`[scanner] Failed to fetch album ${album.id}:`, err);
        }
      }

      this.db.updateScanStatus(false, 100, totalSongs);
      console.log(`[scanner] Done: ${totalSongs} songs from ${allAlbums.length} albums`);
      return { totalSongs, totalAlbums: allAlbums.length };
    } finally {
      this.scanning = false;
    }
  }
}
