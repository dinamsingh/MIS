/**
 * Generic stale-while-revalidate data cache hook.
 *
 * Uses a module-level Map so cached data persists across route navigations
 * within the same session. Supports configurable TTL, background revalidation,
 * concurrent fetch deduplication, and manual cache invalidation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCacheOptions<T> {
  /** Unique cache key. */
  key: string;
  /** Async data fetcher. */
  fetcher: () => Promise<T>;
  /** Time-to-live in ms (default 60000 = 1 min). */
  ttlMs?: number;
}

export interface UseCacheResult<T> {
  /** Cached or freshly-fetched data (null until first successful fetch). */
  data: T | null;
  /** True on initial fetch when no cached data is available. */
  isLoading: boolean;
  /** True when showing cached data while revalidating in background. */
  isStale: boolean;
  /** Last fetch error, if any. */
  error: Error | null;
  /** Manually trigger a refetch (ignores TTL). */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Module-level cache store
// ---------------------------------------------------------------------------

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const cacheStore = new Map<string, CacheEntry>();

/**
 * In-flight fetch promises keyed by cache key.
 * Used to deduplicate concurrent fetches for the same key.
 */
const inflightFetches = new Map<string, Promise<unknown>>();

// ---------------------------------------------------------------------------
// Public utility
// ---------------------------------------------------------------------------

/**
 * Manually clear cached data.
 * @param key - If provided, clears only that key. Otherwise clears all.
 */
export function clearCache(key?: string): void {
  if (key) {
    cacheStore.delete(key);
  } else {
    cacheStore.clear();
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 60_000;

export function useDataCache<T>(options: UseCacheOptions<T>): UseCacheResult<T> {
  const { key, fetcher, ttlMs = DEFAULT_TTL_MS } = options;

  // Resolve initial state from cache synchronously
  const cached = cacheStore.get(key) as CacheEntry<T> | undefined;
  const hasValidCache = cached !== undefined;
  const isCacheExpired = hasValidCache && Date.now() - cached.timestamp > ttlMs;

  const [data, setData] = useState<T | null>(hasValidCache ? cached.data : null);
  const [isLoading, setIsLoading] = useState(!hasValidCache);
  const [isStale, setIsStale] = useState(hasValidCache && isCacheExpired);
  const [error, setError] = useState<Error | null>(null);

  // Keep latest fetcher in a ref to avoid stale closures
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const keyRef = useRef(key);
  keyRef.current = key;

  const ttlRef = useRef(ttlMs);
  ttlRef.current = ttlMs;

  // Track whether the component is still mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(async (background: boolean) => {
    const currentKey = keyRef.current;

    // Deduplicate: reuse in-flight promise for the same key
    let promise = inflightFetches.get(currentKey) as Promise<T> | undefined;
    if (!promise) {
      promise = fetcherRef.current();
      inflightFetches.set(currentKey, promise);
    }

    if (!background) {
      setIsLoading(true);
    } else {
      setIsStale(true);
    }

    try {
      const result = await promise;
      // Store in cache
      cacheStore.set(currentKey, { data: result, timestamp: Date.now() });
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setIsStale(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsStale(false);
      }
    } finally {
      inflightFetches.delete(currentKey);
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial fetch on mount / key change
  useEffect(() => {
    const entry = cacheStore.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      // We have cache — serve it immediately
      setData(entry.data);
      setIsLoading(false);

      const expired = Date.now() - entry.timestamp > ttlMs;
      if (expired) {
        // Revalidate in background
        void doFetch(true);
      } else {
        setIsStale(false);
      }
    } else {
      // No cache — full fetch
      void doFetch(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refetch = useCallback(() => {
    void doFetch(false);
  }, [doFetch]);

  return { data, isLoading, isStale, error, refetch };
}
