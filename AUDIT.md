# hifi Player — Codebase Audit & Improvement Plan

**Date:** 2026-07-31  
**Reviewer:** web_developer agent  
**Scope:** Full review of `player/` and `server/` source code

---

## 1. BUGS

### 1.1 🔴 Search breaks library browsing (known bug)

**Symptom:** After using the inline search in the Library view, switching tabs doesn't show tab content — the search results persist.

**Root cause:** `MusicContext.search()` sets `searchResults` state. `LibraryView.tsx` renders the search results block whenever `searchResults` is truthy (line ~470: `if (searchResults) { ... }`). Switching tabs via `setTab()` calls `navigate('/library/<newtab>')` but never clears `searchResults`. The search results block short-circuits before the tab content renders.

**Fix:** In `setTab`, clear search before navigating:
```typescript
const setTab = useCallback((newTab: string) => {
  setFilter('all');
  clearSearch();  // ← clears query + searchResults
  navigate(`/library/${newTab}`);
}, [navigate, clearSearch]);
```

Also clear search when clicking the breadcrumb back to Library root.

### 1.2 🔴 Two competing search systems

**Problem:** There are two independent search UIs:
- `SearchView.tsx` at `/search` (dedicated page)
- Inline search in `LibraryView.tsx` (hijacks the tab content)

Both write to the same `searchResults` in MusicContext. Using one leaves stale state for the other.

**Fix:** Pick one approach. Recommendation: **remove inline search from LibraryView**. Keep the dedicated `/search` route. Add a search icon in the library header that navigates to `/search` instead of rendering inline results. This is simpler, avoids the browsing bug, and matches Spotify's pattern.

### 1.3 🟡 `replaceQueue` ignores cast state

```typescript
const replaceQueue = useCallback((tracks: SubsonicSong[]) => {
  engine.stop();           // ← always local engine
  engine.play(tracks[0]);  // ← always local engine
  ...
}, [engine]);
```

When casting to Sonos/Google Cast, `replaceQueue` still plays locally. The cast target is not updated.

**Fix:** Check `isCasting()` and route through `castStreamUrl()` like `play()` and `playNow()` do.

### 1.4 🟡 `albumsHasMore` logic is incorrect

```typescript
return offset > 0 && loaded >= offset;
```

After the initial load of 48 albums, offset=48, loaded=48 → `true`. But if Navidrome only has 10 albums total, offset=10, loaded=10 → `true` (should be `false`). The logic can't distinguish "full page returned" from "partial page returned".

**Fix:** Track whether the last fetch returned a full page:
```typescript
const albumsHasMore = useCallback((type: AlbumListType) => {
  const loaded = (albumsByType[type] ?? []).length;
  const lastPageSize = albumsLastPageSize[type] ?? 0;
  return lastPageSize >= 48;  // full page = maybe more
}, [albumsByType, albumsLastPageSize]);
```

### 1.5 🟡 `SongList.tsx` has hardcoded `isPlaying = false`

```typescript
const isPlaying = false; // TODO: compare with playback.currentTrack?.id
```

The playing indicator never shows in `SongList`. (Low impact since `SongList` is only used by dead code — see below.)

### 1.6 🟡 Volume slider thumb invisible on touch devices

CSS hides range input thumbs (`opacity: 0`) by default, only showing on `:hover`. Touch devices have no hover.

**Fix:** Use `@media (hover: none)` to always show the thumb, or use `opacity: 0.3` as default instead of `0`.

---

## 2. DEAD CODE & ARCHITECTURE ISSUES

### 2.1 Dead files (440+ lines)

| File | Lines | Status |
|------|-------|--------|
| `Tabs.tsx` | 339 | **Unused** — LibraryView renders its own tab content inline |
| `SongList.tsx` | 237 | **Unused** — only imported by dead `Tabs.tsx` |
| `SearchBar.tsx` | 65 | **Unused** — both LibraryView and SearchView have inline inputs |
| `useViewNavigation.ts` | 22 | **Unused** — components use `useNavigate` directly |

**Action:** Delete all four files. ~660 lines of dead code removed.

### 2.2 Dead state in MusicContext

`selectedArtist`, `selectedAlbum`, `selectedPlaylist`, `browsePath`, `goBack`, `goBackToRoot` — all set by `selectArtist()`, `selectAlbum()`, `selectPlaylist()` which are **never called** by active components. LibraryView uses URL params + `navigate()` instead.

**Action:** Remove these from MusicContext. Saves ~50 lines and eliminates confusion about which navigation system is "real".

### 2.3 Duplicated components

- **`PlayingBars`** — 3 copies (PlayerView, SongTable, SongList). All slightly different.
- **`CodecPill`** — 2 copies (SongTable, SongList). Different styling.
- **`PlaylistDescription`** — could be reused but is inline in LibraryView.
- **Search input** — 3 copies (LibraryView inline, SearchView, search results section in LibraryView).

**Action:** Extract to shared components in `components/`.

### 2.4 Inconsistent styling approach

Mix of:
- Tailwind theme classes: `bg-surface`, `text-on-surface-variant`, `text-primary`
- Inline hex styles: `style={{ color: '#D0BCFF' }}`
- CSS custom properties via SkinContext

All three approaches appear in the same file, sometimes the same component. The `index.css` defines a full theme via `@theme`, but half the components bypass it with hardcoded hex values.

**Action:** Pick one approach. Either use the Tailwind theme classes everywhere (preferred — enables skinning), or use inline styles everywhere. Don't mix.

### 2.5 `MusicContext` is too large (868 lines)

It handles playback, queue, library, search, cast, star/favorite, and view state. This is a "god context" — every re-render of any sub-value re-renders all consumers.

**Action:** Split into focused contexts:
- `PlaybackContext` — play/pause/seek/volume/queue
- `LibraryContext` — artists/albums/songs/playlists/radios
- `SearchContext` — search query/results (or just use a hook)
- Keep `CastContext`, `CompanionContext`, `AuthContext`, `SettingsContext` as-is

### 2.6 `FeaturedSection` is defined inside LibraryView

The `FeaturedSection` component is defined at the top of `LibraryView.tsx` but it's generic. It should be a shared component.

### 2.7 `LibraryView.tsx` is 797 lines

This single file handles:
- Album detail view
- Artist detail view  
- Playlist detail view
- Search results view
- Main library tab view (4 tabs)
- Breadcrumb navigation
- Infinite scroll
- Inline search

**Action:** Split each detail view into its own file: `AlbumDetail.tsx`, `ArtistDetail.tsx`, `PlaylistDetail.tsx`. Keep `LibraryView.tsx` as the tab container.

---

## 3. UI/UX POLISH OPPORTUNITIES

### 3.1 Missing animations

| Area | Current | Improvement |
|------|---------|-------------|
| View transitions | Instant swap | Fade/slide between views |
| Queue items appearing | Instant | Slide-in animation for new queue items |
| Album art on play | Instant swap | Crossfade between covers |
| Tab switching | Instant | Subtle slide/fade |
| Mini player | Always visible | Slide up when track starts, slide down when queue cleared |
| Heart/favorite click | Instant fill | Scale bounce + particle burst |
| Shuffle/repeat toggle | Color change only | Icon rotation (shuffle) or pulse (repeat) |
| Progress bar | Linear fill | Smooth transition + glow on hover |
| Search results | Instant | Stagger fade-in for results |
| Loading states | "Loading…" text | Skeleton screens with shimmer |

### 3.2 Missing quality-of-life features

- **Drag-to-seek on progress bar** — currently click-only
- **Keyboard volume control** — arrows when focused on player
- **Queue reordering** — drag to reorder queue items
- **Swipe gestures** — swipe left/right for next/prev track (mobile)
- **Now Playing bar on mobile** — the MiniPlayer is cramped on mobile
- **Context menus** — right-click / long-press on songs for "Add to queue", "Add to playlist", "Go to artist", etc.
- **"Added to queue" toast** — only some actions show a toast
- **Empty state illustrations** — "No playlists yet" could have artwork
- **Recently played** — quick access to recently played albums/artists on home
- **Lyrics display** — show synced lyrics if available (Navidrome supports this)
- **Sleep timer** — stop playback after X minutes
- **Crossfade** — configurable crossfade between tracks
- **Gapless playback** — preload next track

### 3.3 Progress bar improvements

Current: A div with click handler. No drag, no hover preview.

Target:
- Draggable thumb
- Hover shows timestamp preview
- Buffered range shown as lighter overlay
- Smooth transition on seek

### 3.4 Player view layout

Current album art is always 288-320px. On large screens this looks small. Consider:
- Responsive sizing (larger on desktop)
- Blurred background of album art as page backdrop (like Spotify)
- Vinyl record animation option (spinning disc)

---

## 4. PLAYLIST FEATURE EXTENSIONS

### 4.1 Current state

- **Smart playlists:** 8 hardcoded cards (Top Rated, Chill, Energetic, Focus, Dark, 80s, 90s, 2000s)
- **Backend:** `/api/playlist` with mood/era/topRated filters
- **Radio:** `/api/radio?seed=song:<id>` — similar songs via Subsonic `getSimilarSongs2`
- **Next recommendation:** `/api/next?currentSong=<id>` — random similar song
- **No auto-generated covers** — smart playlists show generic icons
- **No "Keep Playing"** — queue ends, playback stops
- **No Daily Mix** — no per-user personalized mixes
- **No artist intro playlists** — no "This is <artist>" feature

### 4.2 Proposed features (Spotify-parity roadmap)

#### Phase 1: Keep Playing (Autoplay)
**Backend:** Already has `/api/next`. Needs enhancement:
- When queue reaches end, auto-fetch next song via `/api/next`
- Add to queue and continue playing
- Show "Playing next: <title>" toast/animation
- User can disable in settings

**Frontend:** In `MusicContext`'s `ended` event handler:
```typescript
engine.on('ended', () => {
  if (queue.length > 0 && queueIndex >= queue.length - 1) {
    // Queue ended — fetch recommendation
    if (settings.autoplay && companionEnabled) {
      getNext(currentTrack.id).then(song => {
        if (song) { addToQueue(song); nextTrack(); }
      });
    }
  }
});
```

#### Phase 2: Daily Mix (3-5 mixes)
**Backend:** New endpoint `/api/daily-mix`:
- Generate 3-5 mixes based on listening history, genres, and ratings
- Mix 1: Top played artists
- Mix 2: Genre-based (e.g., "Rock Mix")
- Mix 3: Discovery (low play count, high rating)
- Mix 4: Mood-based (based on time of day)
- Mix 5: Recent additions

**Cache:** Generate once per day, cache in SQLite (playlists_cache table already exists)

**Frontend:** New section on home/library page above playlists:
```
[Daily Mix 1] [Daily Mix 2] [Daily Mix 3] [Daily Mix 4] [Daily Mix 5]
```
Each card shows a generated cover (see 4.3).

#### Phase 3: Artist Intro Playlists ("This is ...")
**Backend:** New endpoint `/api/artist-intro/:artistId`:
- Fetch artist's top tracks (by play count / rating)
- Add a few similar artist tracks at the end
- Include bio/description from Last.fm
- 25-30 tracks, ordered by popularity

**Frontend:** 
- "This is <Artist>" card on artist detail page
- Special playlist detail view with artist bio header
- Generated cover using artist image + gradient overlay

#### Phase 4: Genre Mixes
**Backend:** New endpoint `/api/genre-mix`:
- List all genres in library
- For each genre, create a mix of top tracks + discovery
- Cache genre lists

**Frontend:**
- "Your Genre Mixes" section on library page
- Horizontal scrollable row of genre cards
- Each card has a unique color gradient based on genre

#### Phase 5: Auto-Generated Playlist Covers
**Problem:** Smart playlists currently show generic icons. Need album-art-quality covers.

**Approach A: Mosaic (server-side, no AI)**
- Take 4 album covers from the playlist
- Arrange in 2×2 grid
- Add gradient overlay + playlist name
- Generate as JPEG/PNG using `sharp` or `canvas`
- Cache in `playlists_cache` table

**Approach B: Gradient + Icon (client-side)**
- Hash playlist name → deterministic color
- Generate CSS gradient
- Overlay playlist icon + name
- No server processing needed

**Approach C: AI-generated (optional, future)**
- Use image generation API to create unique covers
- Based on mood/genre keywords
- Cache permanently

**Recommendation:** Start with Approach A (mosaic). It's Spotify's approach, looks professional, and requires no external APIs.

#### Phase 6: Collaborative & Shared Playlists
- Share playlist via link
- Collaborative editing (multiple users)
- Playlist followers

### 4.3 Backend changes needed

| Feature | New endpoints | DB changes |
|--------|--------------|------------|
| Keep Playing | None (use existing `/api/next`) | None |
| Daily Mix | `GET /api/daily-mix`, `GET /api/daily-mix/:id` | `daily_mixes` table |
| Artist Intro | `GET /api/artist-intro/:artistId` | None (computed on-the-fly) |
| Genre Mix | `GET /api/genres`, `GET /api/genre-mix/:genre` | `genre_cache` table |
| Cover Art | `GET /api/playlist-cover/:id` (returns image) | `playlist_covers` table |

### 4.4 Frontend changes needed

| Feature | New components | New routes |
|--------|---------------|------------|
| Keep Playing | AutoplayToggle (settings) | None |
| Daily Mix | DailyMixRow, DailyMixCard | None |
| Artist Intro | ArtistIntroCard, ArtistIntroView | `/library/artists/:slug/:id/intro` |
| Genre Mix | GenreMixRow, GenreMixCard | `/library/genres/:name` |
| Cover Art | PlaylistCover (replaces CachedCover for smart playlists) | None |

---

## 5. SUMMARY: Priority Order

### Immediate fixes (bugs)
1. Fix search-browsing bug (clear searchResults on tab switch)
2. Consolidate search (remove inline search from LibraryView)
3. Fix `replaceQueue` cast handling
4. Fix `albumsHasMore` pagination logic

### Cleanup (dead code)
5. Delete `Tabs.tsx`, `SongList.tsx`, `SearchBar.tsx`, `useViewNavigation.ts`
6. Remove dead state from MusicContext (selectedArtist, browsePath, etc.)
7. Extract shared components (PlayingBars, CodecPill, search input)

### UX polish
8. Add view transition animations (fade/slide)
9. Make progress bar draggable with hover preview
10. Add skeleton loading states
11. Fix volume slider for touch devices
12. Add blurred album art backdrop in PlayerView
13. Add "added to queue" toast for all queue actions

### Playlist features
14. Keep Playing (autoplay) — uses existing `/api/next`
15. Auto-generated playlist covers (mosaic approach)
16. Daily Mix (3-5 personalized mixes)
17. Artist Intro playlists
18. Genre Mixes

### Architecture (longer term)
19. Split MusicContext into focused contexts
20. Split LibraryView into separate detail views
21. Standardize styling approach (Tailwind theme classes everywhere)
22. Add error boundaries per view

---

*This audit covers all source files in `player/src/` and `server/src/`. Node_modules, dist, and config files were excluded.*
