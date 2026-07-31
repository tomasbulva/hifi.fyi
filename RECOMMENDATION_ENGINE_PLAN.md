# Recommendation Engine — Architecture Plan

## Goal

Automatic playlist generation and song recommendations based on:
- User ratings (star rating 0-5 via Subsonic API `setRating`)
- Mood/genre tags (via Last.fm API)
- What you are listening the most
- Similar to what you like but never listen
- Time period (decade/year from file metadata)
- Artist introduction (10 best songs from the artist)
- Seed artist/album/song ("radio" mode)
- Listening history (scrobbles via Navidrome → Last.fm)
- On-the-fly "up next" suggestions when queue is empty
- AI-generated playlists (future augmentation)

## Tech Stack

- **Language:** TypeScript (Node.js)
- **Framework:** Express
- **Database:** SQLite (via better-sqlite3)
- **Last.fm:** lastfm-node-client or direct fetch
- **AI:** Pluggable interface for future LLM-based playlist generation

---

## Key Constraints & Discoveries

1. **Navidrome already supports `setRating`** — Subsonic API has `setRating` endpoint, Navidrome implements it. Ratings are stored per-user in Navidrome's database. No need to augment Navidrome metadata directly.

2. **Navidrome already integrates with Last.fm** — Built-in scrobbling and `getSimilarSongs` / `getTopSongs` / `getArtistInfo` endpoints work when Last.fm integration is configured. Navidrome uses its own Last.fm API key (server-side config).

3. **Subsonic API has `getStarred` / `getStarred2`** — Returns starred/favorited items. But there is **no `getRated` endpoint** — you can set ratings but can't query by rating via the API. This is a gap.

4. **`getSongsByGenre`** exists — Returns songs by genre tag.

5. **`getRandomSongs`** supports `genre` and `fromYear`/`toYear` filters — This gives us decade/era filtering for free.

6. **`getSimilarSongs` / `getSimilarSongs2`** — Returns similar songs to a given artist/song. Requires Last.fm integration on Navidrome.

7. **Genre tags come from file metadata** — Navidrome reads ID3/FLAC tags. Last.fm can supplement with additional tags (mood, era, style).

8. **The player is a pure frontend** (no backend). Adding a backend is a significant architectural change. The Sonos proxy proved the pattern works — an optional sidecar service.

---

## Architecture: "hifi Companion" — Optional Backend Service

### Why a backend?

- Querying ratings requires scanning the entire library song-by-song (no `getRated` API). A backend can cache this.
- Last.fm tag enrichment needs an API key that shouldn't be in the browser.
- Recommendation algorithms (similarity scoring, mood matching) need processing power.
- Background processing: refreshing ratings, fetching tags, building playlists — shouldn't block the UI.

### Why optional?

- The player works perfectly without it.
- Users who just want basic Last.fm radio can use Navidrome's built-in `getSimilarSongs` directly from the frontend.
- The companion service adds the "smart" features (auto-playlists, ratings cache, tag enrichment, on-the-fly recommendations).

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  Browser (hifi player)                              │
│  ┌─────────-─┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Player UI │  │ Library  │  │ Smart Playlists  │  │
│  │           │  │ Browse   │  │ (auto-generated) │  │
│  └─────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│        │             │                 │            │
│        │   Subsonic  │   Companion API │            │
│        │   API calls │   (REST)        │            │
└────────┼─────────────┼─────────────────┼────────────┘
         │             │                 │
         ▼             ▼                 ▼
   ┌─────────-─┐  ┌──────────────┐  ┌───────────-───┐
   │ Navidrome │  │ Last.fm API  │  │ hifi Companion│
   │ (Subsonic)│  │ (tags, sim.) │  │ (Node.js)     │
   └─────────-─┘  └──────────────┘  └──────────-────┘
                                          │
                                    ┌─────┴──────┐
                                    │ SQLite     │
                                    │ (cache)    │
                                    └────────────┘
```

### What the Companion Service Does

1. **Ratings Cache** — Scans all songs via Subsonic API, caches `userRating` in SQLite. Refreshes periodically. Provides `GET /songs?minRating=5` query. This solves the "no getRated API" gap.

2. **Last.fm Tag Enrichment** — Fetches top tags for each artist/track from Last.fm API, stores mood/genre/era tags in SQLite. Maps Last.fm tags to normalized moods (e.g., "chill", "energetic", "dark", "happy").

3. **Recommendation Engine** — Generates playlists based on:
   - **Mood playlists**: `GET /playlist?mood=chill&limit=50`
   - **Era playlists**: `GET /playlist?decade=1980&limit=50`
   - **Radio mode**: `GET /radio?seed=artist:<id>` or `seed=song:<id>` — uses Last.fm `getSimilarSongs` + own rating data to rank
   - **On-the-fly**: `GET /next?currentSong=<id>&queueLength=0` — returns next recommended song
   - **Top rated**: `GET /songs?minRating=5&sort=random` — "Hot Tracks" playlist

4. **"Hot" Track Marking** — Exposes `GET /hot` endpoint returning song IDs with rating ≥ 5 (or configurable threshold). Player fetches this on load and marks tracks with flame icon.

5. **Auto-Playlist Management** — Creates and caches generated playlists. Can save them back to Navidrome via `createPlaylist` API so they appear in other Subsonic clients too.

### What the Player Frontend Does

1. **Settings** — New "Smart Features" section:
   - Enable/disable companion service
   - Companion service URL
   - Last.fm API key (optional, for tag enrichment — or use Navidrome's built-in)
   - "Hot" rating threshold (default: 5 stars)
   - Toggle on-the-fly recommendations

2. **Library** — Flame icon on "hot" tracks (fetched from companion's `/hot` endpoint, cached in memory)

3. **Browse** — New "Smart Playlists" section at top of library:
   - Mood mixes (Chill, Energetic, Focus, Dark, Happy)
   - Era mixes (80s, 90s, 2000s, 2010s)
   - Top Rated
   - Recently Played
   - Similar to currently playing

4. **Player** — "Radio" button: when clicked on a song/artist/album, starts a radio station seeded from that item. Companion service generates the track list.

5. **Queue** — When queue is empty and on-the-fly is enabled, companion suggests next song (shown with a "recommended" badge in the queue).

### Data Flow

```
1. Library scan (background):
   Companion → Navidrome getAlbumList2 → getAlbum → songs[]
   → cache all songs with ratings in SQLite

2. Tag enrichment (background):
   Companion → Last.fm track.getInfo + artist.getTopTags
   → store normalized tags in SQLite

3. Hot tracks (on load):
   Player → Companion GET /hot
   → set of song IDs with rating ≥ threshold

4. Mood playlist (on demand):
   Player → Companion GET /playlist?mood=chill&limit=50
   → Companion queries SQLite for songs matching mood tag
   → ranks by rating + play count + randomness
   → returns SubsonicSong[]

5. Radio mode (on click):
   Player → Companion GET /radio?seed=song:<id>&limit=50
   → Companion calls Navidrome getSimilarSongs2(id)
   → merges with own tag/rating data
   → returns ranked SubsonicSong[]

6. On-the-fly next (queue empty):
   Player → Companion GET /next?currentSong=<id>
   → Companion uses listening history + ratings + tags
   → returns single SubsonicSong
```

### SQLite Schema

```sql
CREATE TABLE songs (
  id TEXT PRIMARY KEY,          -- Subsonic song ID
  title TEXT,
  artist TEXT,
  album TEXT,
  album_id TEXT,
  duration INTEGER,
  suffix TEXT,                  -- mp3, flac, etc.
  bit_rate INTEGER,
  cover_art TEXT,
  year INTEGER,
  genre TEXT,                   -- from file metadata
  user_rating INTEGER DEFAULT 0, -- 0-5
  starred INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  last_played TEXT,             -- ISO timestamp
  lastfm_tags TEXT,             -- JSON array of tags
  mood TEXT,                    -- normalized: chill, energetic, dark, happy, focus
  updated_at TEXT               -- ISO timestamp
);

CREATE TABLE artists_cache (
  id TEXT PRIMARY KEY,
  name TEXT,
  cover_art TEXT,
  lastfm_tags TEXT,             -- JSON array
  similar_artists TEXT,         -- JSON array of artist IDs
  updated_at TEXT
);

CREATE TABLE playlists_cache (
  id TEXT PRIMARY KEY,          -- generated playlist key e.g. "mood:chill"
  name TEXT,
  song_ids TEXT,                -- JSON array of song IDs
  generated_at TEXT,
  expires_at TEXT               -- TTL for regeneration
);
```

### API Design (Companion Service)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/hot` | Song IDs with rating ≥ threshold |
| GET | `/songs?minRating=&maxRating=&genre=&decade=&sort=` | Filtered song query |
| GET | `/playlist?mood=&limit=50` | Mood-based playlist |
| GET | `/playlist?era=1980s&limit=50` | Era-based playlist |
| GET | `/playlist?topRated=true&limit=50` | Top rated playlist |
| GET | `/radio?seed=song:<id>&limit=50` | Radio from song |
| GET | `/radio?seed=artist:<id>&limit=50` | Radio from artist |
| GET | `/radio?seed=album:<id>&limit=50` | Radio from album |
| GET | `/next?currentSong=<id>` | On-the-fly next song |
| POST | `/refresh` | Trigger library scan |
| GET | `/status` | Scan progress, last scan time |

### Docker Deployment

```
deploy/docker-compose.full.yml adds:

  hifi-companion:
    build:
      context: ../companion
      dockerfile: Dockerfile
    container_name: hifi-companion
    restart: unless-stopped
    environment:
      - COMPANION_PORT=4322
      - NAVIDROME_URL=http://navidrome:4533
      - NAVIDROME_USER=<username>
      - NAVIDROME_PASSWORD=<password>
      - LASTFM_API_KEY=<optional>
      - HOT_THRESHOLD=5
    ports:
      - "4322:4322"
    volumes:
      - ./companion-data:/data  # SQLite persistence
    networks:
      - internal
```

### Security Considerations

- Companion stores Navidrome credentials for API access — encrypt at rest
- API key auth (same pattern as Sonos proxy)
- CORS restricted to player origin
- No external API exposure needed (runs on LAN)
- Last.fm API key stored server-side, never in browser

### Implementation Phases

**Phase 1 — Companion Core** (MVP)
- Express server with SQLite
- Library scan: pull all songs via Subsonic API, cache with ratings
- `/hot` endpoint: return songs with rating ≥ threshold
- `/status` endpoint: scan progress
- Docker setup

**Phase 2 — Player Integration**
- Settings: companion URL + enable/disable
- Fetch `/hot` on load, mark hot tracks with flame icon in library
- "Top Rated" smart playlist in Browse

**Phase 3 — Mood & Era Playlists**
- Last.fm tag enrichment (background job)
- Mood normalization mapping
- `/playlist?mood=chill` endpoint
- `/playlist?era=1980s` endpoint
- Smart Playlists section in Browse

**Phase 4 — Radio Mode**
- `/radio?seed=song:<id>` endpoint (uses Navidrome's `getSimilarSongs2` + own data)
- Radio button on song/artist/album context menus
- Radio plays in queue with "auto-continue" behavior

**Phase 5 — On-the-Fly Recommendations**
- `/next?currentSong=<id>` endpoint
- Player polls when queue is running low
- Recommended songs appear with badge in queue
- Learning from play history (play count, skip rate)

**Phase 6 — Auto-Playlist Persistence**
- Save generated playlists back to Navidrome via `createPlaylist`
- Schedule periodic regeneration (e.g., refresh "Top Rated" weekly)
- Playlist cover art generation
