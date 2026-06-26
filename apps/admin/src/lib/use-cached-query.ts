'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// useCachedQuery — a tiny SWR-style data hook (no dependency).
//
// Why this exists: the app is served from US-East while users are ~235ms away
// in South Africa. Server-rendered dynamic pages wait a full round-trip before
// showing content, which reads as a "freeze" on every navigation.
//
// This hook flips the model for the pages that use it:
//   • The cache is module-level, so it SURVIVES navigation. Revisiting a page
//     you've already seen renders its data INSTANTLY from cache (0ms), then
//     silently revalidates in the background (stale-while-revalidate).
//   • First visit shows a skeleton for one round-trip, then caches.
//   • RLS still applies — the browser Supabase client carries the user's JWT.
//
// Result: the app feels instant for everything you revisit, and only pays the
// network cost once per dataset per session.
// ============================================================================

interface CacheEntry<T> {
  data: T | undefined;
  error: unknown;
  ts: number;                 // when it was fetched
  promise?: Promise<T>;       // in-flight dedupe
}

// Survives route changes (module scope), cleared on full reload / sign-out.
const CACHE = new Map<string, CacheEntry<unknown>>();

/** Clear one key or everything (call on sign-out / after a mutation). */
export function invalidateCache(key?: string) {
  if (key) CACHE.delete(key);
  else CACHE.clear();
}

/** Optimistically seed/replace a cache entry (e.g. after a local mutation). */
export function mutateCache<T>(key: string, data: T) {
  CACHE.set(key, { data, error: undefined, ts: Date.now() });
}

export interface CachedQueryResult<T> {
  data: T | undefined;
  /** True only on the very first load with no cached value to show. */
  loading: boolean;
  /** True while a background revalidation is running (cache already shown). */
  validating: boolean;
  error: unknown;
  refresh: () => void;
}

/**
 * @param key       stable cache key (include all filter/scope params)
 * @param fetcher   async function returning the data
 * @param opts.staleMs  treat cache fresher than this as "no revalidate needed"
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { staleMs?: number } = {},
): CachedQueryResult<T> {
  const { staleMs = 15_000 } = opts;
  const cached = key ? (CACHE.get(key) as CacheEntry<T> | undefined) : undefined;

  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [validating, setValidating] = useState(false);

  const run = useCallback(async () => {
    if (!key) return;
    const existing = CACHE.get(key) as CacheEntry<T> | undefined;
    if (existing?.promise) return existing.promise; // dedupe in-flight

    setValidating(true);
    const p = (async () => {
      try {
        const data = await fetcherRef.current();
        CACHE.set(key, { data, error: undefined, ts: Date.now() });
        return data;
      } catch (error) {
        CACHE.set(key, { data: existing?.data, error, ts: Date.now() });
        throw error;
      }
    })();

    CACHE.set(key, { ...(existing ?? { data: undefined, error: undefined, ts: 0 }), promise: p });
    try { await p; } catch { /* surfaced via error */ }
    finally {
      const e = CACHE.get(key);
      if (e) delete e.promise;
      setValidating(false);
      rerender();
    }
  }, [key, rerender]);

  useEffect(() => {
    if (!key) return;
    const entry = CACHE.get(key) as CacheEntry<T> | undefined;
    const fresh = entry && Date.now() - entry.ts < staleMs && entry.error === undefined;
    // Revalidate unless the cache is still fresh. Always shows cache first.
    if (!fresh) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    data: cached?.data,
    loading: !cached?.data && (validating || !cached),
    validating,
    error: cached?.error,
    refresh: run,
  };
}
