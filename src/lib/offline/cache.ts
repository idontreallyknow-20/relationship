"use client";

// Read cache. Every screen that reads from Supabase goes through this so it
// can paint from the last known good data instantly, then reconcile with the
// server. When the server is unreachable we keep showing the cached copy
// rather than replacing the page with a "no internet" screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { idbDelete, idbGet, idbPut, STORE_CACHE } from "./db";
import { isTransportError, reportOffline, reportOnline, subscribeNet, useOnline } from "./net";

interface CacheEntry<T> {
  key: string;
  data: T;
  at: number;
}

/** In-memory mirror so repeat mounts in a session are instant. */
const memory = new Map<string, CacheEntry<unknown>>();

export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const hot = memory.get(key);
  if (hot) return hot as CacheEntry<T>;
  const stored = await idbGet<CacheEntry<T>>(STORE_CACHE, key);
  if (stored) memory.set(key, stored as CacheEntry<unknown>);
  return stored;
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { key, data, at: Date.now() };
  memory.set(key, entry as CacheEntry<unknown>);
  await idbPut(STORE_CACHE, entry);
}

export async function dropCache(key: string): Promise<void> {
  memory.delete(key);
  await idbDelete(STORE_CACHE, key);
}

/**
 * Mutate a cached value in place. Used for optimistic updates so a screen
 * that is remounted while an action is still queued shows the new state.
 */
export async function patchCache<T>(key: string, update: (current: T | null) => T): Promise<void> {
  const current = await readCache<T>(key);
  await writeCache(key, update(current ? current.data : null));
}

/** Long enough not to trip a slow connection, short enough not to feel stuck. */
export const DEFAULT_QUERY_TIMEOUT_MS = 8_000;

/**
 * Run a Supabase query without it throwing.
 *
 * A query that reaches the server resolves with `{ data, error }` even when
 * the server says no. A query that cannot reach it at all rejects instead, so
 * code that only checks `.error` sees neither branch and hangs on whatever it
 * was showing. This flattens the two into the one shape.
 */
export async function settled<T extends { error: unknown }>(
  query: PromiseLike<T>,
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T | { data: null; error: unknown; count: null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A dead socket, a captive portal, or a connection dropped mid-flight can
    // leave a request neither resolving nor rejecting. Without a deadline the
    // caller waits on it forever, which on a screen that gates its render is
    // an app stuck on a spinner with no way out.
    const result = await Promise.race([
      query,
      new Promise<{ data: null; error: unknown; count: null }>((resolve) => {
        timer = setTimeout(
          // "timed out", not "timeout", used to be the whole bug: this is the
          // only place a deadline error is minted, and `isTransportError`
          // matches on the substring "timeout", which "timed out" does not
          // contain. A hung socket therefore looked like an ordinary failure.
          () => resolve({ data: null, error: new Error("Request timeout"), count: null }),
          timeoutMs,
        );
      }),
    ]);
    // And say so. `settled` is the only path that can produce a deadline, and
    // it never told the network watcher anything, so a dead socket left
    // `useOnline()` returning true: no sync badge, no offline notice, and the
    // outbox draining into nothing while the user was told all was well.
    if (result.error) {
      if (isTransportError(result.error)) reportOffline();
    } else {
      reportOnline();
    }
    return result;
  } catch (error) {
    if (isTransportError(error)) reportOffline();
    return { data: null, error, count: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type QueryStatus = "loading" | "cached" | "fresh" | "empty" | "error";

export interface QueryResult<T> {
  data: T | null;
  status: QueryStatus;
  /** True when what you see came from the cache and the server has not confirmed it yet. */
  stale: boolean;
  /** Timestamp of the cached copy, if any. */
  cachedAt: number | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** Replace the local copy without a round trip (optimistic update). */
  set: (updater: (current: T | null) => T) => void;
}

/**
 * Cache-then-network query.
 *
 * `fetcher` should throw on failure. Permanent failures surface as an error;
 * transport failures keep the cached data on screen and flip the app to its
 * offline state.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<QueryStatus>("loading");
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const alive = useRef(true);
  const fetcherRef = useRef(fetcher);

  // Declared first so the latest fetcher is in place before the hydrate
  // effect below runs.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!key) return;
    try {
      const fresh = await fetcherRef.current();
      if (!alive.current) return;
      reportOnline();
      setData(fresh);
      setStatus("fresh");
      setCachedAt(Date.now());
      setError(null);
      await writeCache(key, fresh);
    } catch (err) {
      if (!alive.current) return;
      if (isTransportError(err)) {
        reportOffline();
        // Keep whatever is on screen. Only show an empty state if we never
        // had anything cached to begin with.
        setStatus((prev) => (prev === "loading" ? "empty" : prev));
      } else {
        setError((err as Error)?.message ?? "Something went wrong");
        setStatus((prev) => (prev === "loading" ? "error" : prev));
      }
    }
  }, [key]);

  // Hydrate from cache, then go to the network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!key) return;
      setStatus("loading");
      const cached = await readCache<T>(key);
      if (cancelled || !alive.current) return;
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.at);
        setStatus("cached");
      }
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh, ...deps]);

  // Refetch as soon as the connection comes back.
  useEffect(() => {
    return subscribeNet((next) => {
      if (next) void refresh();
    });
  }, [refresh]);

  const set = useCallback(
    (updater: (current: T | null) => T) => {
      setData((current) => {
        const next = updater(current);
        if (key) void writeCache(key, next);
        return next;
      });
    },
    [key],
  );

  // With no key there is nothing to fetch, so the query is simply empty.
  const effective: QueryStatus = key ? status : "empty";

  return {
    data,
    status: effective,
    stale: effective === "cached" || (effective !== "fresh" && !online),
    cachedAt,
    error,
    refresh,
    set,
  };
}
