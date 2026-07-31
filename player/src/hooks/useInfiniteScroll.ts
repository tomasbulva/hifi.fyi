import { useEffect, useRef, useCallback } from 'react';

/**
 * Infinite scroll hook — calls `onLoadMore` when the sentinel element
 * scrolls into view. Returns a ref to attach to a sentinel div at the
 * bottom of your list.
 */
export function useInfiniteScroll(onLoadMore: () => void, hasMore: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const checkAndLoad = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    onLoadMore();
    // Reset loading flag after a short delay to allow state updates
    setTimeout(() => { loadingRef.current = false; }, 500);
  }, [onLoadMore, hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          checkAndLoad();
        }
      },
      { rootMargin: '200px' } // start loading before sentinel is visible
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [checkAndLoad]);

  return sentinelRef;
}
