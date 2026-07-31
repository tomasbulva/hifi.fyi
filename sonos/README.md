# hifi Sonos Proxy

Bridges the hifi web player to Sonos speakers on the local network.

Browsers can't do UDP multicast (SSDP) or SOAP/UPnP directly. This proxy handles:

- **SSDP discovery** — finds Sonos devices on the LAN
- **Zone Group Topology** — resolves devices into rooms/groups
- **SOAP/UPnP control** — play, pause, stop, seek, volume
- **Stream handoff** — sends the Navidrome stream URL to Sonos via `SetAVTransportURI`; Sonos streams directly from Navidrome (browser is no longer in the audio path)

## Requirements

- Must run on the **same network** as the Sonos speakers (SSDP uses multicast)
- Node.js 18+ (or Docker)

## Running directly

```bash
cd sonos
npm install
npm start
# → http://0.0.0.0:4321
```

## Running with Docker

```bash
docker build -t hifi-sonos-proxy .
docker run -d --name hifi-sonos-proxy --network host hifi-sonos-proxy
```

> `--network host` is required — the proxy needs UDP multicast (port 1900) to discover Sonos devices and TCP access to Sonos speakers (port 1400) on the LAN.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CAST_PROXY_PORT` | `4321` | HTTP port for the proxy API |
| `NAVIDROME_LAN_URL` | _(empty)_ | LAN URL for Navidrome, used to rewrite stream URLs so Sonos can reach them. Example: `http://192.168.68.10:4533` |
| `PROXY_API_KEY` | _(empty)_ | Shared secret for API authentication. Player must be configured with the same key in settings |
| `CORS_ORIGIN` | `*` | Restrict CORS to a specific origin for security |

## REST API

| Method | Path | Body / Query | Auth | Description |
|--------|------|-------------|------|-------------|
| GET | `/health` | — | No | Health check |
| GET | `/discover` | — | No | List Sonos speaker groups |
| GET | `/status` | `?ip=<ip>` | No | Current playback state |
| POST | `/cast` | `{ ip, streamUrl, title, artist }` | API Key | Start streaming |
| POST | `/pause` | `{ ip }` | API Key | Pause playback |
| POST | `/resume` | `{ ip }` | API Key | Resume playback |
| POST | `/stop` | `{ ip }` | API Key | Stop playback |
| POST | `/seek` | `{ ip, positionSec }` | API Key | Seek to position |
| POST | `/volume` | `{ ip, volume }` | API Key | Set volume (0–100) |

## Security

- Set `PROXY_API_KEY` to a random string to protect mutating endpoints
- Set `CORS_ORIGIN` to the player's origin to prevent cross-origin access
- The `/discover`, `/status`, and `/health` endpoints remain public (no auth)
- Container runs as `node` user (not root)
