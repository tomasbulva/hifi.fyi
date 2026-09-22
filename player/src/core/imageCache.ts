/**
 * Client-side image cache — fetches cover art once and stores as blob URLs.
 * Solves the problem where Navidrome serves images with no-cache headers,
 * causing every tab switch to re-fetch all images from scratch.
 */

const cache = new Map<string, string>(); // original URL → blob URL
const pending = new Map<string, Promise<string | null>>(); // deduplicate in-flight requests

// Blob URLs are retained by the renderer until revoked — an unbounded cache
// of cover art (38k songs) grew to hundreds of MB and OOM'd the renderer.
// LRU cap + revokeObjectURL on eviction keeps it bounded; a still-rendered
// evicted image just re-fetches on the next mount.
const MAX_CACHE_ENTRIES = 500;
const insertionOrder: string[] = [];

function evictIfNeeded(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = insertionOrder.shift();
    if (oldest === undefined) break;
    const blobUrl = cache.get(oldest);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    cache.delete(oldest);
  }
}

/** Get a cached blob URL for a given cover art URL. Fetches once, caches forever. */
async function fetchAndCache(url: string): Promise<string | null> {
  // Already cached
  if (cache.has(url)) return cache.get(url)!;

  // Already fetching — wait for the in-flight request
  if (pending.has(url)) return pending.get(url)!;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`imageCache: fetch failed for ${url.slice(0, 80)}… → HTTP ${res.status}`);
        return null;
      }
      const blob = await res.blob();
      if (blob.size === 0) {
        console.warn(`imageCache: empty blob for ${url.slice(0, 80)}…`);
        return null;
      }
      const blobUrl = URL.createObjectURL(blob);
      if (cache.has(url)) URL.revokeObjectURL(cache.get(url)!);
      cache.set(url, blobUrl);
      const idx = insertionOrder.indexOf(url);
      if (idx !== -1) insertionOrder.splice(idx, 1);
      insertionOrder.push(url);
      evictIfNeeded();
      return blobUrl;
    } catch (e) {
      console.warn(`imageCache: error fetching ${url.slice(0, 80)}…`, e);
      return null;
    }
  })();

  pending.set(url, promise);
  const result = await promise;
  pending.delete(url);
  return result;
}

/** Get a cached URL synchronously (null if not cached yet). */
function getCached(url: string): string | null {
  const blobUrl = cache.get(url);
  if (blobUrl === undefined) return null;
  // Touch LRU order so actively displayed images are evicted last
  const idx = insertionOrder.indexOf(url);
  if (idx !== -1) { insertionOrder.splice(idx, 1); insertionOrder.push(url); }
  return blobUrl;
}

/** Preload a list of URLs in the background. Returns a promise that resolves when all are done. */
function preload(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter(u => u && !cache.has(u)))];
  if (unique.length === 0) return Promise.resolve();
  return Promise.all(unique.map(u => fetchAndCache(u))).then(() => {});
}

export const imageCache = {
  get: getCached,
  fetch: fetchAndCache,
  preload,
};
