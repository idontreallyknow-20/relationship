"use client";

// Saving. Local first, always: the game writes to IndexedDB after every
// meaningful action and never waits for the network. The server copy is a
// durable backup plus the referee for anything permanent or comparable.

import { supabase } from "@/lib/supabase";
import { idbGet, idbPut, STORE_META } from "@/lib/offline/db";
import { AlreadyAppliedError, enqueue, PermanentOpError, registerOp } from "@/lib/offline/outbox";
import { isTransportError } from "@/lib/offline/net";
import type { Person } from "@/lib/types";
import type { GameState } from "./types";
import { migrateSave, SAVE_VERSION } from "./state";
import { applyLegacy } from "./actions";

const localKey = (person: Person) => `game:${person}`;

interface StoredSave {
  key: string;
  person: Person;
  version: number;
  state: GameState;
  savedAt: number;
}

/* ------------------------------------------------------------------ */
/* Local                                                               */
/* ------------------------------------------------------------------ */

export async function loadLocal(person: Person): Promise<GameState | null> {
  const stored = await idbGet<StoredSave>(STORE_META, localKey(person));
  if (!stored?.state) return null;
  return migrateSave(stored.state);
}

export async function saveLocal(person: Person, state: GameState): Promise<void> {
  const payload: StoredSave = {
    key: localKey(person),
    person,
    version: SAVE_VERSION,
    state,
    savedAt: Date.now(),
  };
  await idbPut(STORE_META, payload);
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

export interface ServerSave {
  state: unknown;
  hearts: number;
  lifetime_hearts: number;
  total_clicks: number;
  rebirths: number;
  ascensions: number;
  legacy_claimed: boolean;
  suspicious_batches: number;
  updated_at: string;
}

export async function loadServer(person: Person): Promise<ServerSave | null> {
  const { data, error } = await supabase()
    .from("game_saves")
    .select("state, hearts, lifetime_hearts, total_clicks, rebirths, ascensions, legacy_claimed, suspicious_batches, updated_at")
    .eq("person", person)
    .maybeSingle();
  if (error) throw error;
  return (data as ServerSave | null) ?? null;
}

/**
 * Pick between the local save and the server save.
 *
 * Both are the same person on different devices, so the rule is simply
 * "whichever has seen more life". Permanent counters are then floored to the
 * server's values, because the server never lets them go backwards.
 */
export function reconcile(local: GameState | null, server: ServerSave | null): GameState | null {
  if (!local && !server) return null;
  if (!local) return migrateSave(server!.state);
  if (!server) return local;

  const serverState = migrateSave(server.state);
  const chosen = server.lifetime_hearts > local.lifetime.hearts ? serverState : local;

  chosen.lifetime.hearts = Math.max(chosen.lifetime.hearts, server.lifetime_hearts);
  chosen.stats.totalClicks = Math.max(chosen.stats.totalClicks, server.total_clicks);
  chosen.rebirths = Math.max(chosen.rebirths, server.rebirths);
  chosen.ascensions = Math.max(chosen.ascensions, server.ascensions);
  chosen.legacyClaimed = chosen.legacyClaimed || server.legacy_claimed;
  chosen.syncedLifetime = server.lifetime_hearts;
  chosen.syncedClicks = server.total_clicks;
  return chosen;
}

/* ------------------------------------------------------------------ */
/* The sync operation                                                  */
/* ------------------------------------------------------------------ */

export interface SyncPayload {
  person: Person;
  state: GameState;
  day: string;
}

let lastAcceptedSave: ServerSave | null = null;

export function lastServerSave(): ServerSave | null {
  return lastAcceptedSave;
}

registerOp<SyncPayload>("game.sync", async (payload, op) => {
  const { state } = payload;
  const { data, error } = await supabase().rpc("game_sync", {
    p_batch_id: op.id,
    p_state: state,
    p_hearts: Math.min(state.wallet.hearts, 1e300),
    p_lifetime: Math.min(state.lifetime.hearts, 1e300),
    p_clicks: Math.floor(state.stats.totalClicks),
    p_best_combo: Math.floor(state.stats.bestCombo),
    p_rebirths: state.rebirths,
    p_ascensions: state.ascensions,
    p_pets: Object.keys(state.pets).length,
    p_achievements: state.stats.achievementsUnlocked,
    p_bosses: Math.floor(state.stats.bossesDefeated),
    p_day: payload.day,
  });

  if (error) {
    if (isTransportError(error)) throw error;
    // A duplicate batch id means this exact batch already landed.
    if (error.code === "23505") throw new AlreadyAppliedError("batch already applied");
    throw new PermanentOpError(error.message);
  }
  lastAcceptedSave = (data as ServerSave | null) ?? null;
});

/** Queue a progress batch. Safe to call while offline. */
export async function queueSync(person: Person, state: GameState, day: string): Promise<void> {
  await enqueue<SyncPayload>(
    "game.sync",
    { person, state: JSON.parse(JSON.stringify(state)) as GameState, day },
    { label: "Love Jar progress" },
  );
}

/* ------------------------------------------------------------------ */
/* Legacy claim                                                        */
/* ------------------------------------------------------------------ */

/**
 * Convert the old `love_taps` rows into starting progress. The server records
 * that it happened, so this is safe to call on every load: it only ever does
 * something once.
 */
export async function claimLegacy(state: GameState): Promise<number> {
  if (state.legacyClaimed) return 0;
  const { data, error } = await supabase().rpc("game_claim_legacy");
  if (error) throw error;
  const result = data as { claimed: boolean; taps: number } | null;
  if (!result?.claimed) {
    state.legacyClaimed = true;
    return 0;
  }
  applyLegacy(state, result.taps);
  return result.taps;
}

/* ------------------------------------------------------------------ */
/* Leaderboard reads                                                   */
/* ------------------------------------------------------------------ */

export interface LeaderRow {
  person: Person;
  lifetime_hearts: number;
  best_combo: number;
  rebirths: number;
  ascensions: number;
  pets_collected: number;
  bosses_defeated: number;
  achievements: number;
}

export async function loadLeaderboard(): Promise<LeaderRow[]> {
  const { data, error } = await supabase()
    .from("game_saves")
    .select("person, lifetime_hearts, best_combo, rebirths, ascensions, pets_collected, bosses_defeated, achievements");
  if (error) throw error;
  return (data ?? []) as LeaderRow[];
}

export interface DailyRow {
  person: Person;
  day: string;
  hearts: number;
  clicks: number;
  best_combo: number;
}

export async function loadDailyScores(since: string): Promise<DailyRow[]> {
  const { data, error } = await supabase()
    .from("game_daily")
    .select("person, day, hearts, clicks, best_combo")
    .gte("day", since)
    .order("day", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DailyRow[];
}

export async function recordPersonalBest(
  metric: string,
  value: number,
  lowerIsBetter = false,
): Promise<void> {
  try {
    await supabase().rpc("game_record", {
      p_metric: metric,
      p_value: value,
      p_lower_is_better: lowerIsBetter,
      p_detail: null,
    });
  } catch {
    // Personal bests are decoration; never block play on them.
  }
}
