/**
 * Sonos cast provider — talks to the hifi cast proxy backend.
 *
 * The proxy handles SSDP discovery and SOAP/UPnP communication with Sonos
 * speakers on the local network. The browser can't do this directly
 * (no UDP multicast, no CORS, mixed content restrictions).
 *
 * When casting, we send the Navidrome stream URL to Sonos via SetAVTransportURI.
 * Sonos then streams directly from Navidrome — the browser is no longer in the
 * audio path. This is similar to how Spotify Connect works.
 */

import type { CastProvider, CastTarget } from './types';

let PROXY_URL = resolveProxyUrl();
let PROXY_API_KEY = resolveApiKey();

function resolveProxyUrl(): string {
  // Explicit proxy URL from Settings wins — e.g. https://sonos.example for a
  // remote Sonos proxy (must be HTTPS: the player page is HTTPS, and browsers
  // block mixed-content HTTP calls). Empty → same-origin /api/sonos, i.e. the
  // Sonos control built into the hifi server (works only when it runs on the
  // speakers' LAN).
  try {
    const raw = localStorage.getItem('hifi_settings');
    if (raw) {
      const settings = JSON.parse(raw);
      const url = (settings.sonosProxyUrl || '').trim().replace(/\/+$/, '');
      if (url) return url;
    }
  } catch { /* fall through to same-origin */ }
  return '/api/sonos';
}

function resolveApiKey(): string {
  try {
    const raw = localStorage.getItem('hifi_settings');
    if (raw) {
      const settings = JSON.parse(raw);
      return settings.sonosProxyApiKey || '';
    }
  } catch {}
  return '';
}

/** Standard fetch headers for proxy API calls */
export function proxyApiHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PROXY_API_KEY) h['X-API-Key'] = PROXY_API_KEY;
  return h;
}

export function getProxyUrl(): string {
  return PROXY_URL;
}

// Module-level state for the sonos provider
let currentTarget: CastTarget | null = null;
let stateCallback: ((s: { connected: boolean; target: CastTarget | null }) => void) | null = null;

function notifyStateChange() {
  if (stateCallback) stateCallback({ connected: !!currentTarget, target: currentTarget });
}

/** Reload proxy URL and API key from settings */
export function reloadProxyUrl() {
  PROXY_URL = resolveProxyUrl();
  PROXY_API_KEY = resolveApiKey();
}

export const sonosProvider: CastProvider = {
  name: 'sonos',

  async discover(): Promise<CastTarget[]> {
    try {
      const res = await fetch(`${PROXY_URL}/discover`, {
        headers: proxyApiHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const speakers = data.speakers ?? [];
      return speakers.map((s: any) => ({
        id: s.id || s.ip,
        name: s.name,
        type: 'sonos' as const,
        ...s,
      }));
    } catch {
      return [];
    }
  },

  async connect(target: CastTarget): Promise<void> {
    currentTarget = target;
    notifyStateChange();
  },

  disconnect(): void {
    if (currentTarget) {
      fetch(`${PROXY_URL}/stop`, {
        method: 'POST',
        headers: proxyApiHeaders(),
        body: JSON.stringify({ ip: currentTarget.ip }),
      }).catch(() => {});
    }
    currentTarget = null;
    notifyStateChange();
  },

  cast(streamUrl: string, metadata?: { title: string; artist: string }): void {
    if (!currentTarget) return;
    fetch(`${PROXY_URL}/cast`, {
      method: 'POST',
      headers: proxyApiHeaders(),
      body: JSON.stringify({
        ip: currentTarget.ip,
        streamUrl,
        title: metadata?.title,
        artist: metadata?.artist,
      }),
    }).catch(() => {});
  },

  getStatus(): { connected: boolean; target: CastTarget | null } {
    return {
      connected: !!currentTarget,
      target: currentTarget,
    };
  },

  onStateChange(cb: (state: { connected: boolean; target: CastTarget | null }) => void): () => void {
    stateCallback = cb;
    return () => { stateCallback = null; };
  },
};

export const sonosControls = {
  async pause(ip: string) {
    await fetch(`${PROXY_URL}/pause`, {
      method: 'POST', headers: proxyApiHeaders(),
      body: JSON.stringify({ ip }),
    });
  },
  async resume(ip: string) {
    await fetch(`${PROXY_URL}/resume`, {
      method: 'POST', headers: proxyApiHeaders(),
      body: JSON.stringify({ ip }),
    });
  },
  async stop(ip: string) {
    await fetch(`${PROXY_URL}/stop`, {
      method: 'POST', headers: proxyApiHeaders(),
      body: JSON.stringify({ ip }),
    });
  },
  async seek(ip: string, positionSec: number) {
    await fetch(`${PROXY_URL}/seek`, {
      method: 'POST', headers: proxyApiHeaders(),
      body: JSON.stringify({ ip, positionSec }),
    });
  },
  async setVolume(ip: string, volume: number) {
    await fetch(`${PROXY_URL}/volume`, {
      method: 'POST', headers: proxyApiHeaders(),
      body: JSON.stringify({ ip, volume }),
    });
  },
  async getStatus(ip: string) {
    try {
      const res = await fetch(`${PROXY_URL}/status?ip=${encodeURIComponent(ip)}`, {
        headers: proxyApiHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },
};
