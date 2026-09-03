/**
 * Analytics — privacy-friendly event tracking via Umami.
 *
 * Config comes from GET /api/analytics-config at startup (see main.tsx).
 * Events POST to /api/analytics/send on our own server, which proxies to
 * Umami — same-origin, no CORS, no third-party script tag.
 *
 * Click tracking is a single capture-phase listener: every click on an
 * interactive element (button, link, input, select, [data-track]) is reported
 * automatically. Prefer `data-track="semantic.name"` on important controls
 * for stable, human-readable event names.
 *
 * When no website ID is configured everything is a no-op with zero overhead.
 */

interface AnalyticsConfig {
  websiteId: string;
  endpoint: string;
}

let config: AnalyticsConfig | null = null;
let queue: Array<Record<string, unknown>> = [];
let sessionReferrer: string | null = null;

export function initAnalytics(cfg: { websiteId?: string } | null) {
  if (!cfg?.websiteId) return; // analytics disabled
  config = { websiteId: cfg.websiteId, endpoint: '/api/analytics/send' };
  const pending = queue;
  queue = [];
  pending.forEach(e => send(e));
}

function send(body: Record<string, unknown>) {
  if (!config) return;
  const payload = JSON.stringify({
    type: 'event',
    payload: {
      website: config.websiteId,
      hostname: location.hostname,
      language: navigator.language,
      screen: `${screen.width}x${screen.height}`,
      referrer: sessionReferrer,
      ...body,
    },
  });
  try {
    // sendBeacon survives page unload; fall back to fetch
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(config.endpoint, { method: 'POST', body: payload, keepalive: true });
    }
  } catch {
    // never let analytics break the app
  }
}

/** Track a semantic event, e.g. track('song.play', { title, artist }). */
export function track(name: string, data?: Record<string, unknown>) {
  if (!config) {
    // Buffer events fired before config arrives (max 50)
    if (queue.length < 50) queue.push({ name, data });
    return;
  }
  send({ name, data });
}

/** Track a route/view change. */
export function trackView(path: string) {
  sessionReferrer = sessionReferrer === null ? document.referrer : location.pathname;
  track('view', { path });
}

// ── Global click tracking ──

const INTERACTIVE = 'button, a, [role="button"], [data-track], input, select, textarea, label, summary';

function deriveName(el: HTMLElement): string {
  const explicit = el.getAttribute('data-track');
  if (explicit) return explicit;
  const label =
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40) ||
    '';
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || tag;
  return label ? `${role}.${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)}` : role;
}

/**
 * Attach one document-level capture listener that reports every click on
 * interactive elements. Skip elements marked data-track-ignore and clicks on
 * label elements wrapping inputs (double report).
 */
export function attachGlobalClickTracking() {
  document.addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(INTERACTIVE);
      if (!target || target.closest('[data-track-ignore]')) return;
      if (target.tagName === 'LABEL' && target.querySelector('input, select, textarea')) return;
      track('ui.click', {
        element: deriveName(target),
        path: location.pathname,
      });
    },
    { capture: true },
  );
}
