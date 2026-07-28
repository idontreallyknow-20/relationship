"use client";

// Focus mode: hide the relationship half of the app and leave the jar.
//
// This cannot live in the game save. `BottomNav` renders outside
// `GameProvider` (the game only mounts on /jar), so the nav could never read
// it from there. It is also a per-device preference rather than shared
// progress: wanting to play the game on your phone tonight says nothing about
// what your partner wants on theirs.
//
// So: local storage, exposed as an external store, read with
// `useSyncExternalStore` exactly like the network state in `offline/net.ts`.

import { useSyncExternalStore } from "react";

const KEY = "cj_focus_mode";

type Listener = () => void;

let focused = false;
let loaded = false;
const listeners = new Set<Listener>();

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    focused = window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private browsing with storage denied. Focus mode simply stays off.
  }
}

export function isFocusMode(): boolean {
  load();
  return focused;
}

export function setFocusMode(next: boolean): void {
  load();
  if (next === focused) return;
  focused = next;
  try {
    if (next) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Not being able to remember it is survivable; the toggle still works
    // for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: Listener): () => void {
  load();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * True when the app should show only the jar.
 *
 * Server rendering always reports false so the full navigation is in the
 * markup; if focus mode is on, the client corrects it on hydration.
 */
export function useFocusMode(): boolean {
  return useSyncExternalStore(subscribe, isFocusMode, () => false);
}
