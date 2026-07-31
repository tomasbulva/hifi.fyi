import { useState, useEffect, useRef } from 'react';
import { imageCache } from '../core/imageCache';

interface CachedCoverProps {
  url: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Cover art image component with client-side caching.
 * Fetches the image once, converts to blob URL, and reuses it across
 * all instances. Eliminates re-fetching when switching tabs/views.
 */
export function CachedCover({ url, alt, className, fallback }: CachedCoverProps) {
  const [cachedUrl, setCachedUrl] = useState<string | null>(() => imageCache.get(url));
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!url) {
      setError(true);
      return;
    }

    // Already cached
    const cached = imageCache.get(url);
    if (cached) {
      setCachedUrl(cached);
      setError(false);
      return;
    }

    // Fetch and cache
    imageCache.fetch(url).then(result => {
      if (!mountedRef.current) return;
      if (result) {
        setCachedUrl(result);
        setError(false);
      } else {
        setError(true);
      }
    });
  }, [url]);

  if (error || !cachedUrl) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className={`flex items-center justify-center bg-surface-container ${className ?? ''}`}>
        <span className="material-symbols-outlined text-2xl text-on-surface-variant">music_note</span>
      </div>
    );
  }

  return <img src={cachedUrl} alt={alt} className={className} />;
}
