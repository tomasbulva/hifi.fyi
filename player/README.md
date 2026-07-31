# hifi — Web Music Player for Navidrome

A skinnable, open-source web music player built for [Navidrome](https://www.navidrome.org/) (Subsonic API compatible). Designed to work everywhere — desktop, phone, and Tesla browser.

## Features

- **🎨 Skinnable** — CSS custom properties power the theme system. Drop a `skin.json` + theme file into `/skins/`.
- **🎵 Full music browser** — Artists → Albums → Songs, with search
- **📊 Audio visualization** — Bars, waveform, and particles via Web Audio API
- **📡 Cast support** — Pluggable cast providers (browser built-in, external speakers via custom providers)
- **🏷️ Codec/quality badge** — Shows FLAC vs MP3, bitrate, lossless indicator
- **📻 Now playing** — Cover art, progress bar with buffer, queue management
- **🔐 No secrets in code** — Enter your own server URL + credentials, stored in `localStorage`
- **🚗 Tesla-ready** — Includes a "Tesla Touch" skin with larger targets and higher contrast

## Quick Start

```bash
npm install
npm run dev      # dev server on :5173
npm run build    # production build in dist/
```

## Connecting

1. Open the app
2. Enter your Navidrome server URL (e.g. `https://music.hifi.fyi`)
3. Enter your Navidrome username and password
4. Start browsing and playing

## Skin System

Skins live in `public/skins/<name>/` and contain:

- `skin.json` — manifest with color/font/sizing tokens
- Optional component overrides (future)

### Creating a Skin

Copy `public/skins/default/skin.json`, tweak the tokens, and add your own folder.

```json
{
  "name": "My Awesome Skin",
  "version": "1.0.0",
  "author": "you",
  "description": "...",
  "tokens": {
    "colors": { "background": "#000", ... },
    "fonts": { "ui": "...", ... },
    "sizing": { "touchTarget": "48px", ... },
    "visualization": { "barColor": "#f00", ... }
  }
}
```

All UI components use `var(--color-*)`, `var(--font-*)`, etc. — switching skins swaps all CSS custom properties instantly.

## Architecture

```
src/
├── core/           # API client, AudioEngine, contexts (auth, music, cast, skin)
├── features/       # Self-contained view folders
│   ├── player/     # CoverArt, ProgressBar, QualityBadge, Controls
│   ├── library/    # Browse, search, song lists
│   ├── visualization/ # Audio-reactive canvas rendering
│   ├── cast/       # CastButton, CastStatusBar
│   └── auth/       # Login form
├── components/     # Shared: TopBar, ViewSwitcher
└── hooks/          # Reusable hooks (future)
```

**No backend.** Pure static SPA. Talks directly to Navidrome's Subsonic API.

## Deploying

### Cloudflare Pages (recommended)

1. Push to GitHub
2. Connect repo to Cloudflare Pages
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add custom domain: `my.hifi.fyi`

### Any static host

Just serve the `dist/` folder.

## Tech

- React 18 + TypeScript
- Vite
- CSS custom properties (theme system)
- Web Audio API (visualization)
- Subsonic REST API

## License

MIT — open source, no secrets, no keys.
