"use client";

// Network awareness. `navigator.onLine` only tells us whether the device has
// a link, not whether our backend is reachable, so we combine it with the
// outcome of real requests: anything that reports a transport failure marks
// us offline, and any success marks us online again.

import { useSyncExternalStore } from "react";

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

function set(next: boolean) {
  if (next === online) return;
  online = next;
  for (const listener of listeners) listener(next);
}

export function isOnline(): boolean {
  return online;
}

export function subscribeNet(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by the sync layer when a request fails at the transport level. */
export function reportOffline(): void {
  set(false);
}

/** Called by the sync layer when any request succeeds. */
export function reportOnline(): void {
  set(true);
}

/**
 * Supabase surfaces network problems as a `TypeError: Failed to fetch` or a
 * PostgrestError without a code. Anything that is a real server response (a
 * constraint violation, an RLS denial) is a permanent failure and must not be
 * treated as "offline", otherwise we would retry it forever.
 */
export function isTransportError(error: unknown): boolean {
  if (!error) return false;
  // Being offline is not a reason to call everything a transport error.
  //
  // This used to short-circuit to true whenever the flag was down, which meant
  // that once the app believed it was offline, a real server rejection (an RLS
  // denial, a constraint violation) was classified as retryable. The outbox
  // breaks its drain on a transport error, so a permanently rejected operation
  // at the head of the queue blocked everything behind it forever, with the
  // flag it depended on only clearable by some unrelated request succeeding.
  //
  // The flag still counts, but as a tiebreaker for errors that carry nothing
  // to judge them by, not as an override of the ones that do.
  if (error instanceof TypeError) return true;
  const e = error as { message?: string; code?: string; name?: string };
  if (e.name === "AbortError") return true;
  // A PostgREST error always carries a code; something with neither a code nor
  // a message came from the transport, and if we already believe we are
  // offline that is the likeliest reading.
  const message = (e.message ?? "").toLowerCase();
  if (!message) return !online || e.code === undefined;
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    e.code === "" ||
    e.code === "ENOTFOUND"
  );
}

let started = false;

/** Wire browser events once. Safe to call repeatedly. */
export function startNetWatch(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  online = navigator.onLine !== false;
  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));
}

function subscribe(onChange: () => void): () => void {
  startNetWatch();
  return subscribeNet(onChange);
}

export function useOnline(): boolean {
  // The network state is an external store, so read it as one: no effect, no
  // cascading render on mount, and correct during server rendering.
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
