/**
 * Client-side image cache — fetches cover art once and stores as blob URLs.
 * Solves the problem where Navidrome serves images with no-cache headers,
 * causing every tab switch to re-fetch all images from scratch.
 */

const cache = new Map<string, string>(); // original URL → blob URL
const pending = new Map<string, Promise<string | null>>(); // deduplicate in-flight requests

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
      cache.set(url, blobUrl);
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
  return cache.get(url) ?? null;
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
