/**
 * SQLite database layer — caches songs, ratings, tags, playlists.
 */

import BetterSqlite3 from 'better-sqlite3';
import type { SubsonicSong } from './types.js';

/** Per-artist aggregate stats for the library browser (/api/artists-extended). */
export interface ArtistStatRow {
  artist: string;
  song_count: number;
  album_count: number;
  total_plays: number;
  starred_count: number;
  avg_rating: number | null;
  last_played: string | null;
  cover_art: string | null;
  golden_year: number | null;
  best_unplayed: number;
}

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
      CREATE TABLE IF NOT EXISTS daily_mixes (
        id TEXT PRIMARY KEY,
        title TEXT,
        subtitle TEXT,
        icon TEXT,
        song_ids TEXT,
        generated_at TEXT,
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_daily_mixes_expires ON daily_mixes(expires_at);
      CREATE TABLE IF NOT EXISTS playlist_covers (
        id TEXT PRIMARY KEY,
        data TEXT,
        content_type TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS app_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        navidrome_url TEXT,
        navidrome_username TEXT,
        navidrome_password TEXT,
        app_username TEXT,
        app_password_hash TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        created_at TEXT,
        expires_at TEXT
      );
    `);
  }

  upsertSong(song: SubsonicSong): void {
    const mood = deriveMood(song.genre ?? '');
    const stmt = this.db.prepare(`
      INSERT INTO songs (id, title, artist, album, album_id, duration, suffix, bit_rate, cover_art, year, genre, user_rating, starred, play_count, last_played, mood, updated_at)
      VALUES (@id, @title, @artist, @album, @album_id, @duration, @suffix, @bit_rate, @cover_art, @year, @genre, @user_rating, @starred, @play_count, @last_played, @mood, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        title=@title, artist=@artist, album=@album, album_id=@album_id, duration=@duration,
        suffix=@suffix, bit_rate=@bit_rate, cover_art=@cover_art, year=@year, genre=@genre,
        user_rating=@user_rating, starred=@starred, play_count=@play_count, last_played=@last_played, mood=@mood, updated_at=@updated_at
    `);
    stmt.run({
      id: song.id, title: song.title ?? '', artist: song.artist ?? '', album: song.album ?? '',
      album_id: song.albumId ?? '', duration: song.duration ?? 0, suffix: song.suffix ?? '',
      bit_rate: song.bitRate ?? 0, cover_art: song.coverArt ?? '', year: song.year ?? null,
      genre: song.genre ?? '', user_rating: song.userRating ?? 0, starred: song.starred ? 1 : 0,
      play_count: song.playCount ?? 0, last_played: song.played ?? null, mood, updated_at: new Date().toISOString(),
    });
  }

  /** Sync a single rating change back into the cache (keeps /api/ratings fresh between scans). */
  updateSongRating(id: string, rating: number, starred?: boolean): void {
    this.db.prepare('UPDATE songs SET user_rating = ?, starred = COALESCE(?, starred) WHERE id = ?').run(rating, starred === undefined ? null : (starred ? 1 : 0), id);
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

  // ── Library browser: sorted/filtered songs over the whole scanned library ──

  /** Sort orders for /api/songs-extended. Returns the filtered total for pagination. */
  getSongsSorted(sort: string, limit: number, offset: number, opts?: { genre?: string; shuffle?: boolean }): { songs: CachedSong[]; total: number } {
    let where = '1=1';
    let order = 'title COLLATE NOCASE';
    const params: (string | number)[] = [];
    switch (sort) {
      case 'most-played':
        where = 'play_count > 0';
        order = 'play_count DESC, user_rating DESC, title COLLATE NOCASE';
        break;
      case 'least-played':
        order = 'play_count ASC, title COLLATE NOCASE';
        break;
      case 'recently-played':
        where = 'last_played IS NOT NULL';
        order = 'last_played DESC';
        break;
      case 'favorites':
        where = '(starred = 1 OR user_rating >= 4)';
        order = 'user_rating DESC, play_count DESC, title COLLATE NOCASE';
        break;
      case 'top-rated':
        where = 'user_rating > 0';
        order = 'user_rating DESC, play_count DESC, title COLLATE NOCASE';
        break;
      case 'play-now':
        // Never played, best-rated first — the songs most likely to be loved.
        where = 'play_count = 0';
        order = '(user_rating * 2 + starred) DESC, user_rating DESC, id';
        break;
      case 'neglected':
        // Loved (≥4★) but not touched in 90+ days; never-played gems first.
        where = 'user_rating >= 4 AND (last_played IS NULL OR last_played < ?)';
        params.push(new Date(Date.now() - 90 * 86400000).toISOString());
        order = 'last_played ASC, user_rating DESC, title COLLATE NOCASE';
        break;
      case 'newest':
        where = 'year IS NOT NULL AND year > 0';
        order = 'year DESC, artist COLLATE NOCASE, title COLLATE NOCASE';
        break;
      case 'oldest':
        where = 'year IS NOT NULL AND year > 0';
        order = 'year ASC, artist COLLATE NOCASE, title COLLATE NOCASE';
        break;
    }
    if (opts?.genre) {
      where += ' AND genre = ? COLLATE NOCASE';
      params.push(opts.genre);
    }
    if (opts?.shuffle) order = 'RANDOM()';
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM songs WHERE ${where}`).get(...params) as any).c as number;
    const songs = this.db.prepare(`SELECT * FROM songs WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset) as CachedSong[];
    return { songs, total };
  }

  /** Aggregate per-artist stats for /api/artists-extended, sorted. */
  getArtistStats(sort: string, limit: number, offset: number, opts?: { shuffle?: boolean }): { artists: ArtistStatRow[]; total: number } {
    // Per-artist aggregates. Signature cover = cover art of the most-played song.
    const rows = this.db.prepare(`
      SELECT artist,
        COUNT(*) AS song_count,
        COUNT(DISTINCT album_id) AS album_count,
        SUM(play_count) AS total_plays,
        SUM(starred) AS starred_count,
        AVG(NULLIF(user_rating, 0)) AS avg_rating,
        MAX(last_played) AS last_played,
        MAX(CASE WHEN play_count = 0 THEN user_rating ELSE 0 END) AS best_unplayed,
        (SELECT s2.cover_art FROM songs s2 WHERE s2.artist = s.artist COLLATE NOCASE
           ORDER BY s2.play_count DESC, s2.user_rating DESC LIMIT 1) AS cover_art
      FROM songs s
      GROUP BY artist COLLATE NOCASE
    `).all() as Omit<ArtistStatRow, 'golden_year'>[];

    // Golden year: the year (of the artist's played songs) with the most plays —
    // a rough "when this artist was in their prime for you" signal.
    const yearRows = this.db.prepare(`
      SELECT artist, year, SUM(play_count) AS plays
      FROM songs WHERE play_count > 0 AND year IS NOT NULL AND year > 0
      GROUP BY artist COLLATE NOCASE, year
    `).all() as { artist: string; year: number; plays: number }[];
    const golden = new Map<string, number>();
    for (const r of yearRows) {
      const cur = golden.get(r.artist.toLowerCase());
      if (cur === undefined) golden.set(r.artist.toLowerCase(), r.year);
    }

    let stats: ArtistStatRow[] = rows.map(r => ({ ...r, golden_year: golden.get(r.artist.toLowerCase()) ?? null }));

    switch (sort) {
      case 'most-played':
        stats.sort((a, b) => b.total_plays - a.total_plays || a.artist.localeCompare(b.artist));
        break;
      case 'least-played':
        stats.sort((a, b) => a.total_plays - b.total_plays || a.artist.localeCompare(b.artist));
        break;
      case 'recently-played':
        stats.sort((a, b) => (b.last_played ?? '').localeCompare(a.last_played ?? ''));
        break;
      case 'favorites':
        stats.sort((a, b) => b.starred_count - a.starred_count || (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || a.artist.localeCompare(b.artist));
        break;
      case 'golden-years':
        // Chronological journey through the eras; artists without play data last.
        stats.sort((a, b) => (a.golden_year ?? 9999) - (b.golden_year ?? 9999) || b.total_plays - a.total_plays);
        break;
      case 'play-now':
        stats.sort((a, b) => b.best_unplayed - a.best_unplayed || a.total_plays - b.total_plays || a.artist.localeCompare(b.artist));
        break;
      case 'neglected':
        // Loved artists (starred / avg ≥4★) not touched in 90+ days, longest-neglected first.
        stats.sort((a, b) => (a.last_played ?? '').localeCompare(b.last_played ?? '') || (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
        break;
      default:
        stats.sort((a, b) => a.artist.localeCompare(b.artist));
    }

    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const predicates: Record<string, (s: ArtistStatRow) => boolean> = {
      'recently-played': s => !!s.last_played,
      'favorites': s => s.starred_count > 0 || (s.avg_rating ?? 0) >= 4,
      'play-now': s => s.best_unplayed > 0,
      'neglected': s => (s.starred_count > 0 || (s.avg_rating ?? 0) >= 4) && (!s.last_played || s.last_played < cutoff),
    };
    const pred = predicates[sort];
    const filtered = pred ? stats.filter(pred) : stats;
    if (opts?.shuffle) filtered.sort(() => Math.random() - 0.5);
    return { artists: filtered.slice(offset, offset + limit), total: filtered.length };
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

  getGenres(): { genre: string; count: number }[] {
    return this.db.prepare("SELECT genre, COUNT(*) as count FROM songs WHERE genre IS NOT NULL AND genre != '' GROUP BY genre ORDER BY count DESC").all() as { genre: string; count: number }[];
  }

  /** Clear cached daily mixes so they regenerate fresh (call after a scan completes). */
  invalidateDailyMixes(): void {
    this.db.prepare('DELETE FROM daily_mixes').run();
  }

  getDailyMixes(): { id: string; title: string; subtitle: string; icon: string; song_ids: string; generated_at: string; expires_at: string }[] {
    // Check if we have valid (non-expired) mixes
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    let mixes = this.db.prepare('SELECT * FROM daily_mixes WHERE expires_at > ?').all(now) as any[];

    if (mixes.length === 0) {
      // Generate new daily mixes
      mixes = this.generateDailyMixes();
    }

    return mixes;
  }

  getDailyMix(id: string): { id: string; title: string; subtitle: string; icon: string; songs: any[] } | null {
    const mix = this.db.prepare('SELECT * FROM daily_mixes WHERE id = ?').get(id) as any;
    if (!mix) return null;
    const songIds: string[] = JSON.parse(mix.song_ids);
    const songs = songIds.map(sid => this.getSongById(sid)).filter(Boolean);
    return { ...mix, songs };
  }

  private generateDailyMixes(): any[] {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const expiresAt = tomorrow.toISOString();
    const generatedAt = now.toISOString();

    // Mix 1: Top played
    const topPlayed = this.db.prepare('SELECT id FROM songs WHERE play_count > 0 ORDER BY play_count DESC, user_rating DESC LIMIT 50').all() as { id: string }[];
    // Mix 2: Top rated
    const topRated = this.db.prepare('SELECT id FROM songs WHERE user_rating >= 3 ORDER BY user_rating DESC, RANDOM() LIMIT 50').all() as { id: string }[];
    // Mix 3: Discovery (low play count, any rating)
    const discovery = this.db.prepare('SELECT id FROM songs WHERE play_count <= 2 ORDER BY RANDOM() LIMIT 50').all() as { id: string }[];
    // Mix 4: Chill mood
    const chill = this.db.prepare('SELECT id FROM songs WHERE mood = ? ORDER BY user_rating DESC, RANDOM() LIMIT 50').all('chill') as { id: string }[];
    // Mix 5: Energetic mood
    const energetic = this.db.prepare('SELECT id FROM songs WHERE mood = ? ORDER BY user_rating DESC, RANDOM() LIMIT 50').all('energetic') as { id: string }[];

    // Fallback: if any mix is empty, fill with random songs
    const fillRandom = (ids: { id: string }[]) => {
      if (ids.length >= 10) return ids.map(s => s.id);
      const existing = new Set(ids.map(s => s.id));
      const random = this.db.prepare('SELECT id FROM songs ORDER BY RANDOM() LIMIT ?').all(50 - ids.length) as { id: string }[];
      return [...ids.map(s => s.id), ...random.map(s => s.id).filter(id => !existing.has(id))];
    };

    const mixes = [
      { id: 'daily-mix-1', title: 'Daily Mix 1', subtitle: 'Your top played tracks', icon: 'trending_up', song_ids: JSON.stringify(fillRandom(topPlayed)), generated_at: generatedAt, expires_at: expiresAt },
      { id: 'daily-mix-2', title: 'Daily Mix 2', subtitle: 'Top rated tracks', icon: 'star', song_ids: JSON.stringify(fillRandom(topRated)), generated_at: generatedAt, expires_at: expiresAt },
      { id: 'daily-mix-3', title: 'Daily Mix 3', subtitle: 'Discover something new', icon: 'explore', song_ids: JSON.stringify(fillRandom(discovery)), generated_at: generatedAt, expires_at: expiresAt },
      { id: 'daily-mix-4', title: 'Daily Mix 4', subtitle: 'Chill vibes', icon: 'spa', song_ids: JSON.stringify(fillRandom(chill)), generated_at: generatedAt, expires_at: expiresAt },
      { id: 'daily-mix-5', title: 'Daily Mix 5', subtitle: 'High energy', icon: 'bolt', song_ids: JSON.stringify(fillRandom(energetic)), generated_at: generatedAt, expires_at: expiresAt },
    ];

    // Clear old mixes and insert new ones
    this.db.prepare('DELETE FROM daily_mixes').run();
    const stmt = this.db.prepare('INSERT INTO daily_mixes (id, title, subtitle, icon, song_ids, generated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const mix of mixes) {
      stmt.run(mix.id, mix.title, mix.subtitle, mix.icon, mix.song_ids, mix.generated_at, mix.expires_at);
    }

    return mixes;
  }

  getPlaylistCover(id: string): { data: string; contentType: string } | null {
    const row = this.db.prepare('SELECT data, content_type FROM playlist_covers WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { data: row.data, contentType: row.content_type };
  }

  /** Convert a DB row into a SubsonicSong-compatible object for API responses. */
  static toApiSong(row: CachedSong): any {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      albumId: row.album_id,
      duration: row.duration,
      suffix: row.suffix,
      bitRate: row.bit_rate,
      coverArt: row.cover_art || '',
      year: row.year,
      genre: row.genre,
      userRating: row.user_rating ?? 0,
      starred: row.starred ? 1 : 0,
      playCount: row.play_count ?? 0,
      mood: row.mood,
    };
  }

  savePlaylistCover(id: string, data: string, contentType: string): void {
    this.db.prepare('INSERT OR REPLACE INTO playlist_covers (id, data, content_type, created_at) VALUES (?, ?, ?, ?)').run(id, data, contentType, new Date().toISOString());
  }

  // ── App auth ──

  getAppConfig(): { navidrome_url: string; navidrome_username: string; navidrome_password: string; app_username: string; app_password_hash: string } | null {
    return (this.db.prepare('SELECT * FROM app_config WHERE id = 1').get() as any) ?? null;
  }

  saveAppConfig(params: { navidromeUrl: string; navidromeUsername: string; navidromePassword: string; appUsername: string; appPasswordHash: string }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO app_config (id, navidrome_url, navidrome_username, navidrome_password, app_username, app_password_hash, created_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        navidrome_url=?, navidrome_username=?, navidrome_password=?, app_username=?, app_password_hash=?, updated_at=?
    `).run(
      params.navidromeUrl, params.navidromeUsername, params.navidromePassword, params.appUsername, params.appPasswordHash, now, now,
      params.navidromeUrl, params.navidromeUsername, params.navidromePassword, params.appUsername, params.appPasswordHash, now,
    );
  }

  upsertScanningFlag(scanning: boolean): void {
    this.db.prepare(`
      INSERT INTO scan_status (id, last_scan, total_songs, scanning, progress)
      VALUES (1, '', 0, ?, 0)
      ON CONFLICT(id) DO UPDATE SET scanning=?
    `).run(scanning ? 1 : 0, scanning ? 1 : 0);
  }

  createSession(token: string): void {
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    this.db.prepare('INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)').run(token, now.toISOString(), expires.toISOString());
    // Clean old sessions
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
  }

  validateSession(token: string): boolean {
    const row = this.db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, new Date().toISOString()) as any;
    return !!row;
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  deleteAllSessions(): void {
    this.db.prepare('DELETE FROM sessions').run();
  }

  close(): void { this.db.close(); }
}
