/**
 * SQLite database layer — caches songs, ratings, tags, playlists.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { SubsonicSong } from './types.js';

export interface CachedSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  album_id: string;
  duration: number;
  suffix: string;
  bit_rate: number;
  cover_art: string;
  year: number;
  genre: string;
  user_rating: number;
  starred: number;
  play_count: number;
  last_played: string | null;
  lastfm_tags: string | null;
  mood: string | null;
  updated_at: string;
}

const MOOD_GENRE_MAP: Record<string, string[]> = {
  chill: ['jazz', 'lounge', 'downtempo', 'ambient', 'chillout', 'bossa', 'soul', 'r&b', 'acoustic'],
  energetic: ['rock', 'punk', 'metal', 'electronic', 'dance', 'edm', 'house', 'techno', 'drum', 'hip hop', 'rap'],
  focus: ['classical', 'instrumental', 'ambient', 'jazz', 'electronic', 'lo-fi', 'minimal'],
  dark: ['metal', 'goth', 'industrial', 'darkwave', 'doom', 'black', 'death', 'ambient'],
};

function deriveMood(genre: string): string | null {
  const g = genre.toLowerCase();
  for (const [mood, genres] of Object.entries(MOOD_GENRE_MAP)) {
    if (genres.some(gx => g.includes(gx))) return mood;
  }
  return null;
}

export class CompanionDB {
  private db: BetterSqlite3.Database;

  constructor(path: string) {
    this.db = new BetterSqlite3(path);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY, title TEXT, artist TEXT, album TEXT, album_id TEXT,
        duration INTEGER DEFAULT 0, suffix TEXT, bit_rate INTEGER DEFAULT 0,
        cover_art TEXT, year INTEGER, genre TEXT, user_rating INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0, play_count INTEGER DEFAULT 0, last_played TEXT,
        lastfm_tags TEXT, mood TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_songs_rating ON songs(user_rating);
      CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
      CREATE INDEX IF NOT EXISTS idx_songs_year ON songs(year);
      CREATE INDEX IF NOT EXISTS idx_songs_mood ON songs(mood);
      CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
      CREATE TABLE IF NOT EXISTS artists_cache (
        id TEXT PRIMARY KEY, name TEXT, cover_art TEXT, lastfm_tags TEXT,
        similar_artists TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS playlists_cache (
        id TEXT PRIMARY KEY, name TEXT, song_ids TEXT, generated_at TEXT, expires_at TEXT
      );
      CREATE TABLE IF NOT EXISTS scan_status (
        id INTEGER PRIMARY KEY DEFAULT 1, last_scan TEXT,
        total_songs INTEGER DEFAULT 0, scanning INTEGER DEFAULT 0, progress INTEGER DEFAULT 0
      );
    `);
  }

  upsertSong(song: SubsonicSong): void {
    const mood = deriveMood(song.genre ?? '');
    const stmt = this.db.prepare(`
      INSERT INTO songs (id, title, artist, album, album_id, duration, suffix, bit_rate, cover_art, year, genre, user_rating, starred, play_count, mood, updated_at)
      VALUES (@id, @title, @artist, @album, @album_id, @duration, @suffix, @bit_rate, @cover_art, @year, @genre, @user_rating, @starred, @play_count, @mood, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        title=@title, artist=@artist, album=@album, album_id=@album_id, duration=@duration,
        suffix=@suffix, bit_rate=@bit_rate, cover_art=@cover_art, year=@year, genre=@genre,
        user_rating=@user_rating, starred=@starred, play_count=@play_count, mood=@mood, updated_at=@updated_at
    `);
    stmt.run({
      id: song.id, title: song.title ?? '', artist: song.artist ?? '', album: song.album ?? '',
      album_id: song.albumId ?? '', duration: song.duration ?? 0, suffix: song.suffix ?? '',
      bit_rate: song.bitRate ?? 0, cover_art: song.coverArt ?? '', year: song.year ?? null,
      genre: song.genre ?? '', user_rating: song.userRating ?? 0, starred: song.starred ? 1 : 0,
      play_count: song.playCount ?? 0, mood, updated_at: new Date().toISOString(),
    });
  }

  getHotSongs(minRating: number): string[] {
    let rows = this.db.prepare('SELECT id FROM songs WHERE user_rating >= ? ORDER BY user_rating DESC, play_count DESC').all(minRating) as { id: string }[];
    if (rows.length < 5) {
      rows = this.db.prepare('SELECT id FROM songs WHERE starred = 1 OR play_count > 0 ORDER BY play_count DESC LIMIT 50').all() as { id: string }[];
    }
    return rows.map(r => r.id);
  }

  getSongsByRating(minRating: number, maxRating?: number): CachedSong[] {
    const max = maxRating ?? 5;
    let songs = this.db.prepare('SELECT * FROM songs WHERE user_rating >= ? AND user_rating <= ? ORDER BY user_rating DESC, RANDOM()').all(minRating, max) as CachedSong[];
    if (songs.length === 0) {
      songs = this.db.prepare('SELECT * FROM songs WHERE starred = 1 OR play_count > 0 ORDER BY play_count DESC, RANDOM() LIMIT ?').all(50) as CachedSong[];
    }
    return songs;
  }

  getSongsByGenre(genre: string, limit = 50): CachedSong[] {
    let songs = this.db.prepare('SELECT * FROM songs WHERE genre = ? COLLATE NOCASE ORDER BY user_rating DESC, RANDOM() LIMIT ?').all(genre, limit) as CachedSong[];
    if (songs.length === 0) {
      songs = this.db.prepare('SELECT * FROM songs WHERE genre LIKE ? COLLATE NOCASE ORDER BY RANDOM() LIMIT ?').all('%' + genre + '%', limit) as CachedSong[];
    }
    return songs;
  }

  getSongsByYear(fromYear: number, toYear: number, limit = 50): CachedSong[] {
    return this.db.prepare('SELECT * FROM songs WHERE year >= ? AND year <= ? ORDER BY RANDOM() LIMIT ?').all(fromYear, toYear, limit) as CachedSong[];
  }

  getSongsByMood(mood: string, limit = 50): CachedSong[] {
    let songs = this.db.prepare('SELECT * FROM songs WHERE mood = ? ORDER BY user_rating DESC, RANDOM() LIMIT ?').all(mood, limit) as CachedSong[];
    if (songs.length === 0) {
      const genres = MOOD_GENRE_MAP[mood] || [];
      for (const g of genres) {
        const more = this.db.prepare('SELECT * FROM songs WHERE genre LIKE ? COLLATE NOCASE ORDER BY RANDOM() LIMIT ?').all('%' + g + '%', limit) as CachedSong[];
        songs = songs.concat(more);
        if (songs.length >= limit) break;
      }
      songs = songs.slice(0, limit);
    }
    return songs;
  }

  getSongById(id: string): CachedSong | null {
    return (this.db.prepare('SELECT * FROM songs WHERE id = ?').get(id) as CachedSong) ?? null;
  }

  getTotalSongs(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM songs').get() as { count: number };
    return row.count;
  }

  updateScanStatus(scanning: boolean, progress: number, totalSongs?: number): void {
    this.db.prepare(`
      INSERT INTO scan_status (id, last_scan, total_songs, scanning, progress)
      VALUES (1, @last_scan, @total_songs, @scanning, @progress)
      ON CONFLICT(id) DO UPDATE SET
        last_scan=@last_scan, total_songs=@total_songs, scanning=@scanning, progress=@progress
    `).run({
      last_scan: new Date().toISOString(),
      total_songs: totalSongs ?? this.getTotalSongs(),
      scanning: scanning ? 1 : 0, progress,
    });
  }

  getScanStatus(): { last_scan: string; total_songs: number; scanning: number; progress: number } {
    return (this.db.prepare('SELECT * FROM scan_status WHERE id = 1').get() as any) ?? { last_scan: '', total_songs: 0, scanning: 0, progress: 0 };
  }

  close(): void { this.db.close(); }
}
