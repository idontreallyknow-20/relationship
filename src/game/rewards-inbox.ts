"use client";

// The couples app does not know about the game, and should not have to. When
// something worth a bonus happens anywhere in the app, it drops a note here.
// The Love Jar reads the notes the next time it opens and grants the bonus,
// subject to its own daily caps.
//
// This is what keeps the game standalone: nothing outside `src/game` imports
// game state, and the game never requires the rest of the app to have been
// used at all.

import { idbGet, idbPut, STORE_META } from "@/lib/offline/db";
import type { PartnerAction } from "./actions";

const KEY = "game:rewards-inbox";
const MAX_ENTRIES = 60;

export interface RewardNote {
  id: string;
  action: PartnerAction;
  day: string;
  at: number;
}

interface Inbox {
  key: string;
  notes: RewardNote[];
}

async function read(): Promise<RewardNote[]> {
  const stored = await idbGet<Inbox>(STORE_META, KEY);
  return stored?.notes ?? [];
}

async function write(notes: RewardNote[]): Promise<void> {
  await idbPut(STORE_META, { key: KEY, notes: notes.slice(-MAX_ENTRIES) } satisfies Inbox);
}

/**
 * Record that something happened elsewhere in the app.
 *
 * `id` makes it idempotent: answering the same question twice in one day, or
 * a screen re-rendering, will not produce two notes.
 */
export async function noteRewardable(action: PartnerAction, day: string, id: string): Promise<void> {
  const notes = await read();
  if (notes.some((n) => n.id === id)) return;
  await write([...notes, { id, action, day, at: Date.now() }]);
}

/** Take everything waiting. The caller is responsible for applying it. */
export async function drainRewards(): Promise<RewardNote[]> {
  const notes = await read();
  if (notes.length === 0) return [];
  await write([]);
  return notes;
}

export async function peekRewards(): Promise<RewardNote[]> {
  return read();
}
