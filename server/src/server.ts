/**
 * hifi Server — unified backend.
 *
 * One process, one container:
 *   - Serves the React frontend (static files)
 *   - Proxies /rest/* to Navidrome (same-origin → no CORS)
 *   - Companion API (/api/hot, /api/songs, /api/playlist, /api/radio, /api/next)
 *   - Sonos control (/api/discover, /api/cast, /api/pause, etc.)
 *
 * Env vars:
 *   PORT                 — server port (default 4321)
 *   NAVIDROME_URL        — Navidrome base URL (e.g. http://navidrome:4533)
 *   NAVIDROME_USER       — Navidrome username (for companion scanning)
 *   NAVIDROME_PASSWORD   — Navidrome password (for companion scanning)
 *   LASTFM_API_KEY       — Last.fm API key for similar songs
 *   HOT_THRESHOLD        — min rating for "hot" tracks (default 5)
 *   DB_PATH              — SQLite path (default ./data/companion.db)
 *   PROXY_API_KEY        — shared secret for companion + sonos endpoints
 *   NAVIDROME_LAN_URL    — rewrite stream URLs for LAN access (Sonos)
 *   SENTRY_DSN           — Sentry error reporting (optional)
 *   RELEASE              — release tag for Sentry (default hifi@dev)
 *   UMAMI_WEBSITE_ID     — Umami website ID; enables frontend analytics (optional)
 *   UMAMI_URL            — Umami base URL (default http://umami:3000)
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dgram from 'dgram';
import http from 'http';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

// Load .env from several possible locations
const __serverDir = path.dirname(fileURLToPath(import.meta.url));
const envPaths = [
  path.resolve(__serverDir, '../.env'),       // server/../.env (project root)
  path.resolve(__serverDir, '.env'),           // server/.env
  path.resolve(process.env.HOME || '', '.hifi.env'),  // ~/.hifi.env (outside sync)
];
for (const p of envPaths) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

import { CompanionDB } from './database.js';
import { SubsonicClient } from './subsonic.js';
import { Scanner } from './scanner.js';
import { setLastfmKey, getTrackInfo, listenersToRating } from './lastfm.js';
import { initBanDb, recordFailedAttempt, recordSuccessfulLogin, isBanned, getBanList, unbanIp, clearAllBans, addManualBan } from './banList.js';
import * as Sentry from '@sentry/node';

// ── Config ──

const PORT = process.env.PORT || '4321';
const NAVIDROME_URL = (process.env.NAVIDROME_URL || '').replace(/\/+$/, '');
const NAVIDROME_USER = process.env.NAVIDROME_USER || '';
const NAVIDROME_PASSWORD = process.env.NAVIDROME_PASSWORD || '';
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || '';
if (LASTFM_API_KEY) setLastfmKey(LASTFM_API_KEY);
const HOT_THRESHOLD = parseInt(process.env.HOT_THRESHOLD || '5', 10);
const DB_PATH = process.env.DB_PATH || './data/companion.db';
const API_KEY = process.env.PROXY_API_KEY || '';
const NAVIDROME_LAN_URL = (process.env.NAVIDROME_LAN_URL || '').replace(/\/+$/, '');

// ── Observability ──

const SENTRY_DSN = process.env.SENTRY_DSN || '';
const RELEASE = process.env.RELEASE || 'hifi@dev';
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || '';
const UMAMI_URL = (process.env.UMAMI_URL || 'http://umami:3000').replace(/\/+$/, '');

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: RELEASE,
    environment: process.env.NODE_ENV || 'production',
    // Sonos discovery polls and last.fm enrichment fail benignly all the time
    // — those are caught and ignored locally, so only real 500s land here.
    tracesSampleRate: 0.1,
  });
  console.log('[hifi] Sentry error reporting: enabled');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
// Behind Cloudflare Tunnel (cloudflared) — trust private-network hops so
// req.ip is the real client IP for the ban middleware, not the tunnel's.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// ── Init ban database (shares DB_PATH with companion) ──
initBanDb(DB_PATH);

// ── IP ban middleware ──
// Blocks banned IPs from all endpoints
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const ban = isBanned(ip);
  if (ban.banned) {
    if (ban.permanent) {
      return res.status(403).json({ error: 'IP permanently banned', permanent: true });
    }
    return res.status(429).json({ error: 'Too many failed attempts', retryAfter: ban.remaining });
  }
  next();
});



// ── Navidrome proxy ──
// All /rest/* requests are proxied to Navidrome. This means the frontend
// never talks to Navidrome directly — no CORS issues, ever.
// The proxy target is dynamic — set at startup from DB config or /api/auth/setup.

let currentNavidromeUrl = NAVIDROME_URL;

function navidromeRouter() {
  return currentNavidromeUrl || undefined;
}

// Always install the proxy; the router function returns undefined when
// no Navidrome is configured, so requests pass through harmlessly.
app.use(createProxyMiddleware({
  target: currentNavidromeUrl || 'http://localhost',
  changeOrigin: true,
  pathFilter: '/rest',
  router: navidromeRouter,
}));
console.log('[hifi] Navidrome proxy: /rest → (dynamic)', currentNavidromeUrl ? `currently ${currentNavidromeUrl}` : 'not yet configured');

// ── Companion init ──

const dataDir = DB_PATH.replace(/\/[^/]+$/, '');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new CompanionDB(DB_PATH);

let subsonicClient: SubsonicClient | null = null;
let scanner: Scanner | null = null;

// Reset stale scanning flag (could be stuck from a crash/restart mid-scan)
db.upsertScanningFlag(false);

/** Configure or reconfigure the Navidrome connection (proxy + scanner). */
function configureNavidrome(url: string, user: string, pass: string): void {
  currentNavidromeUrl = url.replace(/\/+$/, '');
  subsonicClient = new SubsonicClient(currentNavidromeUrl, user, pass);
  scanner = new Scanner(subsonicClient, db);
  console.log(`[hifi] Navidrome configured: ${currentNavidromeUrl} (user: ${user})`);
}

// 1) Prefer DB-stored config (persisted from onboarding)
const appConfig = db.getAppConfig();
if (appConfig) {
  configureNavidrome(appConfig.navidrome_url, appConfig.navidrome_username, appConfig.navidrome_password);
  const scanStatus = db.getScanStatus();
  if (scanStatus.total_songs === 0) {
    console.log('[hifi] Companion: auto-scanning (no cached songs)...');
    (scanner as unknown as Scanner).scan().catch((err: Error) => { Sentry.captureException(err); console.error('[hifi] Auto-scan failed:', err); });
  } else {
    console.log(`[hifi] Companion: ${scanStatus.total_songs.toLocaleString()} cached songs`);
  }
} else if (NAVIDROME_URL && NAVIDROME_USER && NAVIDROME_PASSWORD) {
  // 2) Fall back to env vars (legacy / dev — migrate via onboarding)
  configureNavidrome(NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASSWORD);
  console.log('[hifi] Using env vars for Navidrome (no DB config yet)');
} else {
  console.log('[hifi] Navidrome not configured — frontend will trigger /api/auth/setup');
}

// ── Cookie & session middleware ──
app.use(cookieParser());

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionMiddleware(req: any, res: any, next: any) {
  const token = req.cookies?.hifi_token;
  if (token && db.validateSession(token)) return next();

  // Allow localhost/private-network requests without auth (dev mode, same-origin)
  const ip = req.ip || req.socket.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' ||
      ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return next();
  }

  // Fall back to API key for programmatic access
  if (API_KEY) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key === API_KEY) return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// ── Auth endpoints ──

// Check current session state — called by frontend on mount
app.get('/api/auth/session', (req, res) => {
  const token = req.cookies?.hifi_token;
  const valid = token ? db.validateSession(token) : false;
  const config = db.getAppConfig();

  if (valid && config) {
    res.json({
      loggedIn: true,
      setup: true,
      appUsername: config.app_username,
      navidromeUsername: config.navidrome_username,
      navidromePassword: config.navidrome_password,
    });
  } else if (config) {
    res.json({ loggedIn: false, setup: true });
  } else {
    res.json({ loggedIn: false, setup: false });
  }
});

// First-time setup — stores Navidrome config + app password, creates session
app.post('/api/auth/setup', (req, res) => {
  const { navidromeUrl, navidromeUsername, navidromePassword, appUsername, appPassword } = req.body;
  if (!navidromeUrl || !navidromeUsername || !navidromePassword || !appUsername || !appPassword) {
    return res.status(400).json({ error: 'Missing fields: navidromeUrl, navidromeUsername, navidromePassword, appUsername, appPassword' });
  }
  if (db.getAppConfig()) {
    return res.status(409).json({ error: 'Already set up. Log in instead.' });
  }

  crypto.scrypt(appPassword, 'hifi_salt_' + appUsername, 64, (err, hash) => {
    if (err) {
      console.error('[hifi] scrypt error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
    const hashStr = hash.toString('hex');
    // Store credentials in DB (single source of truth for Navidrome connection)
    db.saveAppConfig({
      navidromeUrl,
      navidromeUsername,
      navidromePassword,
      appUsername,
      appPasswordHash: hashStr,
    });

    // Configure the proxy + scanner
    configureNavidrome(navidromeUrl, navidromeUsername, navidromePassword);

    // Start scanning in background
    if (scanner && !scanner.isScanning) {
      scanner.scan().catch(err => { Sentry.captureException(err); console.error('[hifi] Setup scan failed:', err); })
    }

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    db.createSession(token);

    res.cookie('hifi_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.json({ ok: true, loggedIn: true });
  });
});

// Login — verify app username + password, create session
app.post('/api/auth/login', (req, res) => {
  const { appUsername, appPassword } = req.body;
  if (!appUsername || !appPassword) return res.status(400).json({ error: 'Missing appUsername or appPassword' });

  const config = db.getAppConfig();
  if (!config) return res.status(404).json({ error: 'Not set up. Run setup first.' });

  if (appUsername !== config.app_username) {
    return res.status(401).json({ error: 'Unknown username' });
  }

  crypto.scrypt(appPassword, 'hifi_salt_' + appUsername, 64, (err, hash) => {
    if (err) {
      console.error('[hifi] scrypt error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
    if (hash.toString('hex') !== config.app_password_hash) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.createSession(token);

    res.cookie('hifi_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.json({ ok: true, loggedIn: true });
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.hifi_token;
  if (token) db.deleteSession(token);
  res.clearCookie('hifi_token', { path: '/' });
  res.json({ ok: true });
});

// ── Runtime proxy config (get-only; setting is done via /api/auth/setup) ──
app.get('/api/proxy-config', (req, res) => {
  res.json({
    navidromeUrl: currentNavidromeUrl,
    configured: !!db.getAppConfig(),
  });
});

// ── Ban endpoints (unchanged) ──

app.post('/api/auth/failed', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const result = recordFailedAttempt(ip);
  res.json({ banned: result.banned, duration: result.duration, permanent: result.permanent });
});

app.post('/api/auth/success', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  recordSuccessfulLogin(ip);
  res.json({ ok: true });
});

app.get('/api/auth/ban-status', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const ban = isBanned(ip);
  res.json(ban);
});

// Update Navidrome server config — tests connection before saving
app.put('/api/auth/server-config', async (req, res) => {
  const { navidromeUrl, navidromeUsername, navidromePassword } = req.body;
  if (!navidromeUrl || !navidromeUsername || !navidromePassword) {
    return res.status(400).json({ error: 'Missing fields: navidromeUrl, navidromeUsername, navidromePassword' });
  }

  // Test the connection before saving
  try {
    const testClient = new SubsonicClient(navidromeUrl, navidromeUsername, navidromePassword);
    const pingResult = await testClient.ping();
    if (!pingResult) {
      return res.json({ ok: false, error: 'Could not connect to Navidrome — check URL and credentials' });
    }
  } catch {
    return res.json({ ok: false, error: 'Could not connect to Navidrome — check URL' });
  }

  // Update DB config
  const config = db.getAppConfig();
  if (!config) return res.status(404).json({ error: 'Not set up. Run /api/auth/setup first.' });

  db.saveAppConfig({
    navidromeUrl,
    navidromeUsername,
    navidromePassword,
    appUsername: config.app_username,
    appPasswordHash: config.app_password_hash,
  });

  // Reconfigure proxy + scanner
  configureNavidrome(navidromeUrl, navidromeUsername, navidromePassword);

  // Trigger rescan
  if (scanner && !scanner.isScanning) {
    scanner.scan().catch(err => { Sentry.captureException(err); console.error('[hifi] Server config rescan failed:', err); })
  }

  res.json({ ok: true, navidromeUrl });
});

app.get('/api/bans', sessionMiddleware, (req, res) => {
  res.json({ bans: getBanList() });
});

app.post('/api/bans', sessionMiddleware, (req, res) => {
  const ip = req.body.ip;
  if (!ip || typeof ip !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "ip" in body' });
  }
  const added = addManualBan(ip);
  res.json({ banned: true, ip, added });
});

app.delete('/api/bans/:ip', sessionMiddleware, (req, res) => {
  const removed = unbanIp(req.params.ip);
  res.json({ unbanned: removed });
});

app.delete('/api/bans', sessionMiddleware, (req, res) => {
  clearAllBans();
  res.json({ cleared: true });
});

// ── Companion endpoints (/api/*) ──

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    navidrome: !!subsonicClient,
    lastfm: !!LASTFM_API_KEY,
    songs: db.getTotalSongs(),
  });
});

// ── Observability config for the frontend (public — no secrets) ──

app.get('/api/analytics-config', (req, res) => {
  res.json({
    analytics: UMAMI_WEBSITE_ID ? { websiteId: UMAMI_WEBSITE_ID } : null,
    sentryDsn: SENTRY_DSN || undefined,
    release: RELEASE,
  });
});

// Analytics event proxy — frontend posts to same-origin, we forward to Umami.
// Fire-and-forget: analytics must never break the app or spam errors.
app.post('/api/analytics/send', express.json({ limit: '16kb' }), (req, res) => {
  if (!UMAMI_WEBSITE_ID) return res.status(204).end();
  fetch(`${UMAMI_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': req.headers['user-agent'] || 'hifi-server',
      'X-Forwarded-For': req.ip || '',
    },
    body: JSON.stringify(req.body),
  })
    .then(r => res.status(r.ok ? 202 : 502).end())
    .catch(() => res.status(202).end()); // swallow Umami downtime
});

// Get rating for a specific song (from companion DB + last.fm)
app.get('/api/song/:id/rating', sessionMiddleware, async (req, res) => {
  const songId = req.params.id;
  const cached = db.getSongById(songId);

  // Start with companion DB rating
  let rating = cached?.user_rating ?? 0;
  let starred = !!cached?.starred;

  // Read the rating live from Navidrome — the DB cache only updates on scans,
  // so a rating set in the player would otherwise read back stale until the
  // next scan. Sync any change back into the cache.
  if (subsonicClient) {
    try {
      const song = await subsonicClient.getSong(songId);
      if (song.userRating !== undefined) {
        rating = song.userRating;
        starred = !!song.starred;
        if (cached && (song.userRating !== cached.user_rating || !!song.starred !== !!cached.starred)) {
          db.updateSongRating(songId, song.userRating, !!song.starred);
        }
      }
    } catch {
      // Navidrome unavailable — fall back to cache below
    }
  }

  // If no user rating in DB, try last.fm
  if (rating === 0 && cached && LASTFM_API_KEY) {
    try {
      const lastfmData = await getTrackInfo(cached.artist, cached.title);
      if (lastfmData) {
        rating = listenersToRating(lastfmData.listeners);
      }
    } catch {
      // last.fm might be slow or unavailable
    }
  }
  
  res.json({
    id: songId,
    rating,
    starred,
    playCount: cached?.play_count ?? 0,
    genre: cached?.genre ?? '',
    mood: cached?.mood ?? '',
  });
});

// Batch get ratings for multiple songs
app.get('/api/ratings', sessionMiddleware, (req, res) => {
  const ids = (req.query.ids as string || '').split(',').filter(Boolean);
  if (ids.length === 0) return res.json({ ratings: {} });
  const ratings: Record<string, { rating: number; starred: boolean }> = {};
  for (const id of ids) {
    const song = db.getSongById(id);
    if (song) {
      ratings[id] = { rating: song.user_rating ?? 0, starred: !!song.starred };
    }
  }
  res.json({ ratings });
});

app.get('/api/status', (req, res) => {
  const status = db.getScanStatus();
  res.json({
    ...status,
    scanning: !!status.scanning,
    total_songs: db.getTotalSongs(),
  });
});

app.post('/api/refresh', sessionMiddleware, async (req, res) => {
  if (!scanner) return res.status(503).json({ error: 'Navidrome not configured' });
  if (scanner.isScanning) return res.status(409).json({ error: 'Scan already in progress' });
  scanner.scan().catch(err => { Sentry.captureException(err); console.error('[hifi] Scan failed:', err); })
  res.json({ ok: true, message: 'Scan started' });
});

app.get('/api/hot', sessionMiddleware, (req, res) => {
  const threshold = parseInt(req.query.threshold as string) || HOT_THRESHOLD;
  const ids = db.getHotSongs(threshold);
  res.json({ songs: ids, threshold });
});

app.get('/api/songs', sessionMiddleware, (req, res) => {
  const minRating = parseInt(req.query.minRating as string) || 0;
  const maxRating = parseInt(req.query.maxRating as string) || 5;
  const genre = req.query.genre as string;
  const decade = req.query.decade as string;
  const sort = req.query.sort as string || 'random';
  const limit = parseInt(req.query.limit as string) || 500;

  let songs;
  if (genre) {
    songs = db.getSongsByGenre(genre, limit);
  } else if (decade) {
    const year = parseInt(decade);
    songs = db.getSongsByYear(year, year + 9, limit);
  } else {
    songs = db.getSongsByRating(minRating, maxRating);
    if (sort === 'random') songs.sort(() => Math.random() - 0.5);
    songs = songs.slice(0, limit);
  }

  res.json({ songs: songs.map(s => CompanionDB.toApiSong(s)) });
});

app.get('/api/songs-extended', sessionMiddleware, (req, res) => {
  const sort = String(req.query.sort || 'most-played');
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const { songs, total } = db.getSongsSorted(sort, limit, offset);
  res.json({ songs: songs.map(s => CompanionDB.toApiSong(s)), total });
});

app.get('/api/artists-extended', sessionMiddleware, (req, res) => {
  const sort = String(req.query.sort || 'most-played');
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  res.json(db.getArtistStats(sort, limit, offset));
});

app.get('/api/playlist', sessionMiddleware, (req, res) => {
  const mood = req.query.mood as string;
  const era = req.query.era as string;
  const topRated = req.query.topRated === 'true';
  const limit = parseInt(req.query.limit as string) || 50;

  let songs;
  if (mood) {
    songs = db.getSongsByMood(mood, limit);
  } else if (era) {
    const year = parseInt(era);
    songs = db.getSongsByYear(year, year + 9, limit);
  } else if (topRated) {
    songs = db.getSongsByRating(HOT_THRESHOLD);
    songs.sort(() => Math.random() - 0.5);
    songs = songs.slice(0, limit);
  } else {
    return res.status(400).json({ error: 'Specify mood, era, or topRated' });
  }

  res.json({ songs: songs.map(s => CompanionDB.toApiSong(s)) });
});

app.get('/api/radio', sessionMiddleware, async (req, res) => {
  if (!subsonicClient) return res.status(503).json({ error: 'Navidrome not configured' });

  const seed = req.query.seed as string;
  const limit = parseInt(req.query.limit as string) || 50;
  if (!seed) return res.status(400).json({ error: 'Missing seed parameter' });

  const [type, id] = seed.split(':');
  if (!type || !id) return res.status(400).json({ error: 'Invalid seed format. Use song:<id>, artist:<id>, or album:<id>' });

  try {
    let songs: any[] = [];

    if (type === 'song') {
      songs = await subsonicClient.getSimilarSongs2(id, limit);
    } else if (type === 'artist') {
      const cachedArtist = db.getSongById(id);
      if (cachedArtist) {
        songs = await subsonicClient.getTopSongs(cachedArtist.artist, limit);
      }
    } else if (type === 'album') {
      const album = await subsonicClient.getAlbum(id);
      const firstSong = album.song?.[0];
      if (firstSong) {
        songs = await subsonicClient.getSimilarSongs2(firstSong.id, limit);
      }
    }

    const enriched = songs.map(s => {
      const cached = db.getSongById(s.id);
      return { ...s, userRating: cached?.user_rating ?? 0 };
    });

    enriched.sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0));
    res.json({ songs: enriched });
  } catch (err: any) {
    Sentry.captureException(err); res.status(500).json({ error: err.message });
  }
});

app.get('/api/next', sessionMiddleware, async (req, res) => {
  if (!subsonicClient) return res.status(503).json({ error: 'Navidrome not configured' });

  const currentSongId = req.query.currentSong as string;
  if (!currentSongId) return res.status(400).json({ error: 'Missing currentSong parameter' });

  try {
    const similar = await subsonicClient.getSimilarSongs2(currentSongId, 10);
    if (similar.length > 0) {
      const pick = similar[Math.floor(Math.random() * Math.min(5, similar.length))];
      return res.json({ song: pick });
    }
    const random = await subsonicClient.getRandomSongs(1);
    res.json({ song: random[0] ?? null });
  } catch (err: any) {
    Sentry.captureException(err); res.status(500).json({ error: err.message });
  }
});

// ── Daily Mix endpoints ──

app.get('/api/daily-mixes', sessionMiddleware, (req, res) => {
  const mixes = db.getDailyMixes();
  res.json({ mixes });
});

app.get('/api/daily-mix/:id', sessionMiddleware, (req, res) => {
  const mix = db.getDailyMix(req.params.id);
  if (!mix) return res.status(404).json({ error: 'Mix not found' });
  res.json({ ...mix, songs: mix.songs.map((s: any) => CompanionDB.toApiSong(s)) });
});

// ── Artist Intro endpoint ──

app.get('/api/artist-intro/:artistId', sessionMiddleware, async (req, res) => {
  if (!subsonicClient) return res.status(503).json({ error: 'Navidrome not configured' });
  const artistId = req.params.artistId;
  try {
    const artist = await subsonicClient.getArtist(artistId);
    const albums = artist.album ?? [];
    // Gather all songs from all albums
    const allSongs: any[] = [];
    for (const album of albums) {
      const albumData = await subsonicClient.getAlbum(album.id);
      for (const song of (albumData.song ?? [])) {
        const cached = db.getSongById(song.id);
        allSongs.push({ ...song, userRating: cached?.user_rating ?? 0, playCount: cached?.play_count ?? 0 });
      }
    }
    // Sort by play count + rating (popularity), take top 25
    allSongs.sort((a, b) => {
      const scoreA = (a.playCount ?? 0) * 2 + (a.userRating ?? 0);
      const scoreB = (b.playCount ?? 0) * 2 + (b.userRating ?? 0);
      return scoreB - scoreA;
    });
    const topTracks = allSongs.slice(0, 25);
    // Get similar songs for discovery
    let discovery: any[] = [];
    if (topTracks.length > 0) {
      try {
        const similar = await subsonicClient.getSimilarSongs2(topTracks[0].id, 5);
        // Filter out songs already in topTracks
        const existingIds = new Set(topTracks.map(s => s.id));
        discovery = similar.filter(s => !existingIds.has(s.id)).slice(0, 5);
      } catch { /* ignore */ }
    }
    res.json({
      artist: { id: artistId, name: artist.name, coverArt: artist.coverArt },
      tracks: [...topTracks, ...discovery],
      trackCount: topTracks.length + discovery.length,
    });
  } catch (err: any) {
    Sentry.captureException(err); res.status(500).json({ error: err.message });
  }
});

// ── Genre Mix endpoints ──

app.get('/api/genres', sessionMiddleware, (req, res) => {
  const genres = db.getGenres();
  res.json({ genres });
});

app.get('/api/genre-mix/:genre', sessionMiddleware, (req, res) => {
  const genre = decodeURIComponent(req.params.genre);
  const songs = db.getSongsByGenre(genre, 50);
  // Normalize to SubsonicSong format + enrich with cached data
  const enriched = songs.map(s => {
    const apiSong = CompanionDB.toApiSong(s);
    const cached = db.getSongById(s.id);
    return { ...apiSong, userRating: cached?.user_rating ?? 0 };
  });
  // Sort by rating desc, then random
  enriched.sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0));
  // Shuffle top half, keep order for bottom half
  const midpoint = Math.floor(enriched.length / 2);
  const top = enriched.slice(0, midpoint).sort(() => Math.random() - 0.5);
  const bottom = enriched.slice(midpoint);
  res.json({ songs: [...top, ...bottom], genre });
});

// ── Playlist cover endpoint ──

app.get('/api/playlist-cover/:id', sessionMiddleware, async (req, res) => {
  const id = req.params.id;
  // Try to get cached cover
  const cached = db.getPlaylistCover(id);
  if (cached) {
    res.set('Content-Type', cached.contentType);
    return res.send(Buffer.from(cached.data, 'base64'));
  }
  // Generate a mosaic cover from song cover art
  // For now, return a simple SVG placeholder with gradient
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue1},60%,30%)"/>
        <stop offset="100%" style="stop-color:hsl(${hue2},60%,20%)"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <text x="150" y="150" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.3)" font-size="48" font-family="sans-serif" font-weight="bold">♪</text>
  </svg>`;
  const data = Buffer.from(svg).toString('base64');
  db.savePlaylistCover(id, data, 'image/svg+xml');
  res.set('Content-Type', 'image/svg+xml');
  res.send(Buffer.from(data, 'base64'));
});

// ── Artist image fallback ──
// Navidrome has no upload API and the music library isn't writable from this
// server, so we can't persist artist art into Navidrome itself. Instead, the
// frontend asks this endpoint for artists without art; we look the artist up
// on Deezer (free, no API key), cache the image on disk, and serve it.
// A 404 means "no image found" — the frontend falls back to an initials avatar.

const ARTIST_IMAGE_DIR = path.join(dataDir, 'artist-images');
if (!existsSync(ARTIST_IMAGE_DIR)) mkdirSync(ARTIST_IMAGE_DIR, { recursive: true });

// In-memory negative cache: don't re-hit Deezer for known imageless artists
// (resets on restart — acceptable, keeps the code simple).
const artistImageMisses = new Set<string>();
const artistImageInflight = new Map<string, Promise<string | null>>();

function artistImageFile(artistId: string): string {
  // artistId comes from a URL param — restrict to safe filename characters
  const safe = artistId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(ARTIST_IMAGE_DIR, `${safe}.jpg`);
}

async function fetchArtistImage(artistId: string, name: string): Promise<string | null> {
  const file = artistImageFile(artistId);
  if (!artistId || !name) return null;
  if (existsSync(file)) return file;
  if (artistImageMisses.has(artistId)) return null;

  let inflight = artistImageInflight.get(artistId);
  if (!inflight) {
    inflight = (async () => {
      try {
        const q = encodeURIComponent(name);
        const searchRes = await fetch(`https://api.deezer.com/search/artist?q=${q}&limit=1`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!searchRes.ok) return null;
        const search = await searchRes.json() as { data?: { picture_big?: string; picture_medium?: string }[] };
        const url = search.data?.[0]?.picture_big || search.data?.[0]?.picture_medium;
        if (!url) return null;

        const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!imgRes.ok) return null;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        // Tiny responses are Deezer's generic grey placeholder — treat as "no image"
        if (buf.length < 2000) return null;
        writeFileSync(file, buf);
        return file;
      } catch (err) {
        Sentry.captureException(err);
        return null;
      } finally {
        artistImageInflight.delete(artistId);
      }
    })();
    artistImageInflight.set(artistId, inflight);
  }

  const result = await inflight;
  if (!result) artistImageMisses.add(artistId);
  return result;
}

app.get('/api/artist-image/:artistId', sessionMiddleware, async (req, res) => {
  const artistId = req.params.artistId.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = String(req.query.name || '').slice(0, 200);
  if (!artistId) return res.status(400).json({ error: 'Invalid artist id' });

  const file = await fetchArtistImage(artistId, name);
  if (!file) return res.status(404).json({ error: 'No artist image found' });

  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  return res.sendFile(file);
});

// ── Sonos endpoints (/api/sonos/*) ──

const SONOS_SSDP_ADDR = '239.255.255.250';
const SONOS_SSDP_PORT = 1900;
const SONOS_PORT = 1400;

function discoverSonosDevices(timeoutMs = 3000): Promise<any[]> {
  return new Promise((resolve) => {
    const devices = new Map<string, any>();
    const socket = dgram.createSocket('udp4');

    const searchMessage = [
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SONOS_SSDP_ADDR}:${SONOS_SSDP_PORT}`,
      'MAN: "ssdp:discover"',
      'MX: 1',
      'ST: urn:schemas-upnp-org:device:ZonePlayer:1',
      '', '',
    ].join('\r\n');

    const timer = setTimeout(() => {
      socket.close();
      resolve([...devices.values()]);
    }, timeoutMs);

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString();
      const locationMatch = text.match(/LOCATION:\s*(http:\/\/[^\s]+)/i);
      if (!locationMatch) return;

      const location = locationMatch[1];
      const ip = rinfo.address;
      if (devices.has(ip)) return;

      http.get(location, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const nameMatch = data.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
          const modelMatch = data.match(/<modelName>([^<]+)<\/modelName>/i);
          const roomMatch = data.match(/<roomName>([^<]+)<\/roomName>/i);
          const udnMatch = data.match(/<UDN>([^<]+)<\/UDN>/i);

          devices.set(ip, {
            ip,
            udn: udnMatch?.[1] || '',
            roomName: roomMatch?.[1] || nameMatch?.[1] || `Sonos @ ${ip}`,
            name: nameMatch?.[1] || roomMatch?.[1] || `Sonos @ ${ip}`,
            model: modelMatch?.[1] || 'Sonos',
          });
        });
      }).on('error', () => {
        devices.set(ip, { ip, udn: '', roomName: `Sonos @ ${ip}`, name: `Sonos @ ${ip}`, model: 'Sonos' });
      });
    });

    socket.on('error', () => {
      socket.close();
      clearTimeout(timer);
      resolve([...devices.values()]);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      const buf = Buffer.from(searchMessage);
      socket.send(buf, 0, buf.length, SONOS_SSDP_PORT, SONOS_SSDP_ADDR);
    });
  });
}

function soapCall(ip: string, endpoint: string, serviceType: string, action: string, params = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body>
<u:${action} xmlns:u="${serviceType}">
${params}
</u:${action}>
</s:Body>
</s:Envelope>`;

    const req = http.request({
      hostname: ip,
      port: SONOS_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': `"${serviceType}#${action}"`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`SOAP ${action} failed: HTTP ${res.statusCode}`));
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('SOAP request timeout')));
    req.write(body);
    req.end();
  });
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  return match?.[1] ?? '';
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function formatTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function getZoneGroupState(ip: string): Promise<string | null> {
  const xml = await soapCall(ip, '/ZoneGroupTopology/Control', 'urn:schemas-upnp-org:service:ZoneGroupTopology:1', 'GetZoneGroupState', '<InstanceID>0</InstanceID>');
  const stateMatch = xml.match(/<ZoneGroupState>([^<]*)<\/ZoneGroupState>/i);
  if (!stateMatch) return null;
  let decoded = decodeURIComponent(stateMatch[1]);
  decoded = decoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return decoded;
}

function parseZoneGroups(zoneGroupXml: string, devices: any[]): any[] {
  const groups: any[] = [];
  const groupRegex = /<ZoneGroup\b([^>]*)>([\s\S]*?)<\/ZoneGroup>/gs;
  let groupMatch;

  while ((groupMatch = groupRegex.exec(zoneGroupXml)) !== null) {
    const groupAttrs = groupMatch[1];
    const memberXml = groupMatch[2];
    const coordinatorUuid = groupAttrs.match(/Coordinator="([^"]+)"/)?.[1] || '';
    const members: any[] = [];

    const memberRegex = /<ZoneGroupMember\b([^>]*?)>([\s\S]*?)<\/ZoneGroupMember>/g;
    let memberMatch;
    while ((memberMatch = memberRegex.exec(memberXml)) !== null) {
      const attrs = memberMatch[1];
      const uuid = attrs.match(/UUID="([^"]+)"/)?.[1] || '';
      const zoneName = attrs.match(/ZoneName="([^"]+)"/)?.[1] || '';
      if (uuid) members.push({ uuid, roomName: zoneName, zoneName, isCoordinator: uuid === coordinatorUuid, channel: '' });

      const satRegex = /<Satellite\b([^>]*?)[\s\/]*>/g;
      let satMatch;
      while ((satMatch = satRegex.exec(memberMatch[2])) !== null) {
        const satUuid = satMatch[1].match(/UUID="([^"]+)"/)?.[1] || '';
        const satZoneName = satMatch[1].match(/ZoneName="([^"]+)"/)?.[1] || '';
        if (satUuid) members.push({ uuid: satUuid, roomName: satZoneName, zoneName: satZoneName, isCoordinator: false, channel: '', invisible: true });
      }
    }

    const selfClosingRegex = /<ZoneGroupMember\b([^>]*?)\/>/g;
    let scMatch;
    while ((scMatch = selfClosingRegex.exec(memberXml)) !== null) {
      const attrs = scMatch[1];
      const uuid = attrs.match(/UUID="([^"]+)"/)?.[1] || '';
      const zoneName = attrs.match(/ZoneName="([^"]+)"/)?.[1] || '';
      if (members.some(m => m.uuid === uuid)) continue;
      if (uuid) members.push({ uuid, roomName: zoneName, zoneName, isCoordinator: uuid === coordinatorUuid, channel: '' });
    }

    if (members.length === 0) continue;

    const coordinatorDevice = devices.find(d => {
      const cleanUdn = d.udn?.replace(/^uuid:/, '') || '';
      return cleanUdn === coordinatorUuid || d.udn === coordinatorUuid;
    });
    const coordinatorMember = members.find(m => m.uuid === coordinatorUuid) || members[0];
    const groupName = coordinatorMember?.zoneName || coordinatorMember?.roomName || 'Sonos';

    groups.push({
      id: coordinatorUuid,
      name: groupName,
      coordinatorIp: coordinatorDevice?.ip || null,
      members: members.map(m => ({
        uuid: m.uuid,
        roomName: m.roomName,
        channel: m.channel || undefined,
        invisible: m.invisible || false,
      })),
    });
  }

  return groups;
}

async function discoverSonosGroups(): Promise<{ groups: any[]; devices: any[] }> {
  const devices = await discoverSonosDevices();
  if (devices.length === 0) return { groups: [], devices };

  let zoneGroupXml: string | null = null;
  for (const device of devices) {
    try {
      zoneGroupXml = await getZoneGroupState(device.ip);
      if (zoneGroupXml) break;
    } catch { /* try next */ }
  }

  if (!zoneGroupXml) {
    return {
      groups: devices.map(d => ({
        id: d.udn || d.ip,
        name: d.roomName || d.name,
        coordinatorIp: d.ip,
        members: [{ uuid: d.udn, roomName: d.roomName }],
      })),
      devices,
    };
  }

  const groups = parseZoneGroups(zoneGroupXml, devices);
  return { groups, devices };
}

app.get('/api/sonos/discover', async (req, res) => {
  try {
    const { groups } = await discoverSonosGroups();
    res.json({ speakers: groups });
  } catch (err: any) {
    Sentry.captureException(err); res.status(500).json({ error: err.message });
  }
});

app.get('/api/sonos/status', async (req, res) => {
  const ip = req.query.ip as string;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    const transportXml = await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'GetTransportInfo', '<InstanceID>0</InstanceID>');
    const posXml = await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'GetPositionInfo', '<InstanceID>0</InstanceID>');
    res.json({
      ip,
      state: extractTag(transportXml, 'CurrentTransportState'),
      status: extractTag(transportXml, 'CurrentTransportStatus'),
      trackURI: extractTag(posXml, 'TrackURI'),
      position: extractTag(posXml, 'RelTime'),
      duration: extractTag(posXml, 'TrackDuration'),
      isPlaying: extractTag(transportXml, 'CurrentTransportState') === 'PLAYING',
    });
  } catch (err: any) {
    Sentry.captureException(err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/sonos/cast', sessionMiddleware, async (req, res) => {
  let { ip, streamUrl, title, artist } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (!streamUrl) return res.status(400).json({ error: 'Missing streamUrl' });

  // Rewrite URL for LAN access if configured
  if (NAVIDROME_LAN_URL) {
    try {
      const parsed = new URL(streamUrl);
      const lanParsed = new URL(NAVIDROME_LAN_URL);
      parsed.protocol = lanParsed.protocol;
      parsed.host = lanParsed.host;
      streamUrl = parsed.toString();
    } catch { /* leave as-is */ }
  }

  try {
    const didlLite = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="1" parentID="0" restricted="true"><res protocolInfo="http-get:*:audio/mpeg:*">${escapeXml(streamUrl)}</res><dc:title>${escapeXml(title || 'Unknown')}</dc:title><dc:creator>${escapeXml(artist || '')}</dc:creator><upnp:class>object.item.audioItem.musicTrack</upnp:class></item></DIDL-Lite>`;

    const serviceType = 'urn:schemas-upnp-org:service:AVTransport:1';
    const endpoint = '/MediaRenderer/AVTransport/Control';

    await soapCall(ip, endpoint, serviceType, 'SetAVTransportURI',
      `<InstanceID>0</InstanceID><CurrentURI>${escapeXml(streamUrl)}</CurrentURI><CurrentURIMetaData>${escapeXml(didlLite)}</CurrentURIMetaData>`);
    await soapCall(ip, endpoint, serviceType, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>');

    res.json({ ok: true, message: `Casting to ${ip}` });
  } catch (err: any) {
    Sentry.captureException(err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/sonos/pause', sessionMiddleware, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Pause', '<InstanceID>0</InstanceID>');
    res.json({ ok: true });
  } catch (err: any) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/sonos/resume', sessionMiddleware, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>');
    res.json({ ok: true });
  } catch (err: any) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/sonos/stop', sessionMiddleware, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Stop', '<InstanceID>0</InstanceID>');
    res.json({ ok: true });
  } catch (err: any) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/sonos/seek', sessionMiddleware, async (req, res) => {
  const { ip, positionSec } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (positionSec === undefined) return res.status(400).json({ error: 'Missing positionSec' });
  try {
    await soapCall(ip, '/MediaRenderer/AVTransport/Control', 'urn:schemas-upnp-org:service:AVTransport:1', 'Seek',
      `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>${formatTimecode(positionSec)}</Target>`);
    res.json({ ok: true });
  } catch (err: any) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

app.post('/api/sonos/volume', sessionMiddleware, async (req, res) => {
  const { ip, volume } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing or invalid ip' });
  if (volume === undefined || volume < 0 || volume > 100) return res.status(400).json({ error: 'Invalid volume (0-100)' });
  try {
    await soapCall(ip, '/MediaRenderer/RenderingControl/Control', 'urn:schemas-upnp-org:service:RenderingControl:1', 'SetVolume',
      `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${Math.round(volume)}</DesiredVolume>`);
    res.json({ ok: true });
  } catch (err: any) { Sentry.captureException(err); res.status(500).json({ error: err.message }); }
});

// ── Static frontend ──
// Serve the built React app from player/dist. In dev, Vite handles this.

// Express error handler — reports uncaught route errors to Sentry (no-op when
// Sentry.init was skipped) and returns a 500.
Sentry.setupExpressErrorHandler(app);

// Container: server at /app/dist, frontend at /app/player/dist.
// Dev (tsx): server at server/src, frontend at project/player/dist.
const frontendDist = [
  path.resolve(__dirname, '../player/dist'),
  path.resolve(__dirname, '../../player/dist'),
].find(p => existsSync(p));
if (frontendDist) {
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API, non-/rest routes serve index.html
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return next();
    if (req.method === 'GET' && existsSync(path.join(frontendDist, req.path === '/' ? 'index.html' : req.path))) {
      return res.sendFile(path.join(frontendDist, req.path === '/' ? 'index.html' : req.path));
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log(`[hifi] Frontend: serving from ${frontendDist}`);
} else {
  console.warn('[hifi] Frontend: player/dist not found — build the player first');
}

// ── Start ──

app.listen(PORT, () => {
  console.log(`🎵 hifi server on http://0.0.0.0:${PORT}`);
  console.log(`   Navidrome: ${NAVIDROME_URL || 'not configured'}`);
  console.log(`   Companion: ${subsonicClient ? 'configured' : 'not configured'}`);
  console.log(`   Last.fm: ${LASTFM_API_KEY ? 'configured' : 'not configured'}`);
  console.log(`   Sonos: proxy ready (requires host network for SSDP)`);
  console.log(`   API key auth: ${API_KEY ? 'enabled' : 'disabled'}`);
});
