/**
 * Mock data and helpers for Subsonic API + Companion API.
 * Intercepts network requests at the Playwright route layer.
 *
 * MOCK_SONGS covers all quality tiers:
 *   song-1: FLAC 1411kbps → CD Quality
 *   song-2: MP3 320kbps  → High Quality
 *   song-3: FLAC 96kbps   → Lossless (downsampled)
 *   song-4: OGG 190kbps  → Standard
 *   song-5: MP3 128kbps  → Low
 *   song-6: FLAC 4608kbps → Hi-Res
 *   song-7: OGG 256kbps  → High Quality (OGG)
 */

export const MOCK_SONGS = [
  {
    id: 'song-1',
    title: 'CD Quality Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumId: 'album-1',
    coverArt: 'cover-1',
    duration: 180,
    suffix: 'flac',
    bitRate: 1411,
    starred: undefined,
    track: 1,
  },
  {
    id: 'song-2',
    title: 'High Quality MP3',
    artist: 'Another Artist',
    album: 'Another Album',
    albumId: 'album-2',
    coverArt: 'cover-2',
    duration: 240,
    suffix: 'mp3',
    bitRate: 320,
    starred: undefined,
    track: 2,
  },
  {
    id: 'song-3',
    title: 'Lossless FLAC',
    artist: 'Third Artist',
    album: 'Third Album',
    albumId: 'album-3',
    coverArt: 'cover-3',
    duration: 200,
    suffix: 'flac',
    bitRate: 96,
    starred: undefined,
    track: 3,
  },
  {
    id: 'song-4',
    title: 'Standard OGG',
    artist: 'Fourth Artist',
    album: 'Fourth Album',
    albumId: 'album-4',
    coverArt: 'cover-4',
    duration: 300,
    suffix: 'ogg',
    bitRate: 190,
    starred: undefined,
    track: 4,
  },
  {
    id: 'song-5',
    title: 'Low Quality MP3',
    artist: 'Fifth Artist',
    album: 'Fifth Album',
    albumId: 'album-5',
    coverArt: 'cover-5',
    duration: 210,
    suffix: 'mp3',
    bitRate: 128,
    starred: undefined,
    track: 5,
  },
  {
    id: 'song-6',
    title: 'Hi-Res FLAC',
    artist: 'Sixth Artist',
    album: 'Sixth Album',
    albumId: 'album-6',
    coverArt: 'cover-6',
    duration: 350,
    suffix: 'flac',
    bitRate: 4608,
    starred: undefined,
    track: 6,
  },
  {
    id: 'song-7',
    title: 'High Quality OGG',
    artist: 'Seventh Artist',
    album: 'Seventh Album',
    albumId: 'album-7',
    coverArt: 'cover-7',
    duration: 195,
    suffix: 'ogg',
    bitRate: 256,
    starred: undefined,
    track: 7,
  },
];

export const MOCK_ALBUMS = [
  {
    id: 'album-1',
    name: 'Test Album',
    artist: 'Test Artist',
    artistId: 'artist-1',
    coverArt: 'cover-1',
    songCount: 2,
    year: 2024,
  },
  {
    id: 'album-2',
    name: 'Another Album',
    artist: 'Another Artist',
    artistId: 'artist-2',
    coverArt: 'cover-2',
    songCount: 3,
    year: 2023,
  },
  {
    id: 'album-3',
    name: 'Third Album',
    artist: 'Third Artist',
    artistId: 'artist-3',
    coverArt: 'cover-3',
    songCount: 1,
    year: 2022,
  },
  {
    id: 'album-4',
    name: 'Fourth Album',
    artist: 'Fourth Artist',
    artistId: 'artist-4',
    coverArt: 'cover-4',
    songCount: 1,
    year: 2021,
  },
];

export const MOCK_ARTISTS = [
  { id: 'artist-1', name: 'Test Artist', albumCount: 1, coverArt: 'cover-1' },
  { id: 'artist-2', name: 'Another Artist', albumCount: 1, coverArt: 'cover-2' },
  { id: 'artist-3', name: 'Third Artist', albumCount: 1, coverArt: 'cover-3' },
  { id: 'artist-4', name: 'Fourth Artist', albumCount: 1, coverArt: 'cover-4' },
];

/**
 * Mock ratings returned by the companion /api/song/:id/rating endpoint.
 * song-1 has a 5-star rating and is hot.
 * song-2 has a 3-star rating.
 * Others have 0 rating.
 */
export const MOCK_RATINGS: Record<string, { id: string; rating: number; starred: boolean; playCount: number; genre: string; mood: string }> = {
  'song-1': { id: 'song-1', rating: 5, starred: true, playCount: 42, genre: 'rock', mood: 'energetic' },
  'song-2': { id: 'song-2', rating: 3, starred: false, playCount: 10, genre: 'pop', mood: 'happy' },
  'song-3': { id: 'song-3', rating: 0, starred: false, playCount: 1, genre: 'jazz', mood: 'chill' },
  'song-4': { id: 'song-4', rating: 0, starred: false, playCount: 2, genre: 'electronic', mood: 'neutral' },
  'song-5': { id: 'song-5', rating: 0, starred: false, playCount: 1, genre: 'folk', mood: 'sad' },
  'song-6': { id: 'song-6', rating: 4, starred: true, playCount: 25, genre: 'classical', mood: 'epic' },
  'song-7': { id: 'song-7', rating: 0, starred: false, playCount: 3, genre: 'indie', mood: 'neutral' },
};

// 1x1 transparent PNG (used for cover art and playlist covers)
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Set up API mocks for a Playwright page.
 * Intercepts all /rest/* and /api/* calls and returns mock data.
 */
export async function setupApiMocks(page: import('@playwright/test').Page) {
  // Track starred songs for star/unstar endpoints
  const starred = new Set<string>();

  // Mock Subsonic ping
  await page.route('**/rest/ping.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1' } }),
    });
  });

  // Mock Subsonic getArtists
  await page.route('**/rest/getArtists.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          artists: { index: [{ name: 'T', artist: MOCK_ARTISTS }] },
        },
      }),
    });
  });

  // Mock Subsonic getAlbumList2
  await page.route('**/rest/getAlbumList2.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          albumList2: { album: MOCK_ALBUMS },
        },
      }),
    });
  });

  // Mock Subsonic getAlbum (with songs)
  await page.route('**/rest/getAlbum.view**', (route) => {
    const url = new URL(route.request().url());
    const albumId = url.searchParams.get('id');
    const album = MOCK_ALBUMS.find((a) => a.id === albumId) ?? MOCK_ALBUMS[0];
    const songs = MOCK_SONGS.filter((s) => s.albumId === albumId);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          album: { ...album, song: songs.length > 0 ? songs : MOCK_SONGS.slice(0, 2) },
        },
      }),
    });
  });

  // Mock Subsonic getArtist
  await page.route('**/rest/getArtist.view**', (route) => {
    const url = new URL(route.request().url());
    const artistId = url.searchParams.get('id');
    const artist = MOCK_ARTISTS.find(a => a.id === artistId) ?? MOCK_ARTISTS[0];
    const albums = MOCK_ALBUMS.filter(a => a.artistId === artistId);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          artist: { ...artist, album: albums },
        },
      }),
    });
  });

  // Mock Subsonic getPlaylist
  await page.route('**/rest/getPlaylist.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: 'pl-1', name: 'Test Playlist', songCount: 2, entry: MOCK_SONGS.slice(0, 2) },
        },
      }),
    });
  });

  // Mock Subsonic search3 (for getSongs and general search)
  await page.route('**/rest/search3.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          searchResult3: { song: MOCK_SONGS, artist: MOCK_ARTISTS, album: MOCK_ALBUMS },
        },
      }),
    });
  });

  // Mock Subsonic getPlaylists
  await page.route('**/rest/getPlaylists.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlists: { playlist: [] },
        },
      }),
    });
  });

  // Mock Subsonic getInternetRadioStations
  await page.route('**/rest/getInternetRadioStations.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          internetRadioStations: { internetRadioStation: [] },
        },
      }),
    });
  });

  // Mock Subsonic stream (return a tiny silent audio file)
  await page.route('**/rest/stream.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: Buffer.from([]), // empty body — audio element will handle gracefully
    });
  });

  // Mock Subsonic getCoverArt (return a 1x1 PNG)
  await page.route('**/rest/getCoverArt.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_1x1,
    });
  });

  // Mock Subsonic star/unstar
  await page.route('**/rest/star.view**', (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id');
    if (id) starred.add(id);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'subsonic-response': { status: 'ok' } }),
    });
  });

  await page.route('**/rest/unstar.view**', (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id');
    if (id) starred.delete(id);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'subsonic-response': { status: 'ok' } }),
    });
  });

  // Mock Subsonic getStarred
  await page.route('**/rest/getStarred.view**', (route) => {
    const starredSongs = MOCK_SONGS.filter((s) => starred.has(s.id));
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          starred: { artist: [], album: [], song: starredSongs },
        },
      }),
    });
  });

  // Mock Subsonic createPlaylist
  await page.route('**/rest/createPlaylist.view**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: 'pl-new', name: 'New Playlist', songCount: 0 },
        },
      }),
    });
  });

  // ── Companion API mocks ──

  // Mock Companion API health
  await page.route('**/api/health**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Mock Companion API hot tracks — song-1 and song-6 are hot
  await page.route('**/api/hot**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ songs: ['song-1', 'song-6'] }),
    });
  });

  // Mock Companion API status
  await page.route('**/api/status**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ scanning: false, total_songs: 7, progress: 100, last_scan: '2026-07-01' }),
    });
  });

  // Mock Companion API song rating
  await page.route('**/api/song/*/rating**', (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/api\/song\/(.+)\/rating/);
    const songId = match ? decodeURIComponent(match[1]) : '';
    const rating = MOCK_RATINGS[songId] ?? { id: songId, rating: 0, starred: false, playCount: 0, genre: 'unknown', mood: 'unknown' };
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rating),
    });
  });

  // Mock Companion API smart playlist
  await page.route('**/api/playlist**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ songs: MOCK_SONGS.slice(0, 3) }),
    });
  });

  // Mock Companion API radio
  await page.route('**/api/radio**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ songs: MOCK_SONGS.slice(0, 5) }),
    });
  });

  // Mock Companion API next recommendation
  await page.route('**/api/next**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ song: MOCK_SONGS[1] }),
    });
  });

  // Mock Companion API batch ratings
  await page.route('**/api/ratings**', (route) => {
    const ratings: Record<string, { rating: number; starred: boolean }> = {};
    for (const [id, data] of Object.entries(MOCK_RATINGS)) {
      ratings[id] = { rating: data.rating, starred: data.starred };
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ratings }),
    });
  });

  // Mock Companion API refresh (scan trigger)
  await page.route('**/api/refresh**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Mock Companion API daily-mixes
  await page.route('**/api/daily-mixes**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mixes: [{
          id: 'daily-mix-1',
          title: 'Daily Mix 1',
          subtitle: 'Top played',
          icon: 'trending_up',
          song_ids: '["song-1","song-2"]',
          generated_at: '2026-07-31',
          expires_at: '2026-08-01',
        }],
      }),
    });
  });

  // Mock Companion API daily-mix detail
  await page.route('**/api/daily-mix/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'daily-mix-1',
        title: 'Daily Mix 1',
        subtitle: 'Top played',
        songs: MOCK_SONGS.slice(0, 3),
      }),
    });
  });

  // Mock Companion API genres
  await page.route('**/api/genres**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        genres: [
          { genre: 'rock', count: 10 },
          { genre: 'jazz', count: 5 },
        ],
      }),
    });
  });

  // Mock Companion API genre-mix
  await page.route('**/api/genre-mix/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        songs: MOCK_SONGS.slice(0, 3),
        genre: 'rock',
      }),
    });
  });

  // Mock Companion API artist-intro
  await page.route('**/api/artist-intro/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        artist: { id: 'artist-1', name: 'Test Artist' },
        tracks: MOCK_SONGS.slice(0, 5),
        trackCount: 5,
      }),
    });
  });

  // Mock Companion API playlist-cover
  await page.route('**/api/playlist-cover/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_1x1,
    });
  });

  // Mock auth ban-status
  await page.route('**/api/auth/ban-status**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ banned: false }),
    });
  });

  // Mock auth success/failed
  await page.route('**/api/auth/success**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/auth/failed**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ banned: false }),
    });
  });

  return { starred };
}

/**
 * Log in the player via the login form.
 * Must be called after setupApiMocks.
 */
export async function loginPlayer(page: import('@playwright/test').Page) {
  await page.goto('/');
  // Fill login form — only username and password (serverUrl field is hidden)
  await page.fill('input[type="text"]', 'testuser');
  await page.fill('input[type="password"]', 'testpass');
  await page.click('button[type="submit"]');
  // Wait for navigation to player
  await page.waitForURL('**/player', { timeout: 10_000 });
  // Wait for the app to settle
  await page.waitForTimeout(500);
}

/**
 * Inject a track into the player's localStorage so it appears as "current track"
 * after page load. This simulates having a track playing without needing audio playback.
 */
export async function injectPlayingTrack(
  page: import('@playwright/test').Page,
  songId: string = 'song-1',
) {
  const song = MOCK_SONGS.find(s => s.id === songId) ?? MOCK_SONGS[0];
  await page.evaluate((track) => {
    localStorage.setItem('hifi_last_track', JSON.stringify(track));
    localStorage.setItem('hifi_codec_info', JSON.stringify({
      codec: track.suffix,
      bitRate: track.bitRate,
      lossless: ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsf', 'dff'].includes(track.suffix.toLowerCase()),
    }));
    // Also inject a queue so queue-related features work
    localStorage.setItem('hifi_queue', JSON.stringify([
      { song: track, queuedAt: Date.now() },
      { song: { ...track, id: 'song-2', title: 'Next Song', artist: 'Next Artist' }, queuedAt: Date.now() },
    ]));
  }, song);
}

/**
 * Set companion settings so the companion client is configured.
 */
export async function enableCompanionSettings(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem('hifi_settings');
    const settings = raw ? JSON.parse(raw) : {};
    settings.companionUrl = '/api';
    settings.companionApiKey = 'test-key';
    localStorage.setItem('hifi_settings', JSON.stringify(settings));
  });
}
