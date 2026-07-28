"use client";

// Saving. Local first, always: the game writes to IndexedDB after every
// meaningful action and never waits for the network. The server copy is a
// backup and the way the two of you see each other's jar.
//
// There is no validation layer any more. This is a game for two people who
// share an account boundary; the only person anyone could cheat is
// themselves, and the tables that used to police it were pure overhead.

import { supabase } from "@/lib/supabase";
import { idbGet, idbPut, STORE_META } from "@/lib/offline/db";
import { AlreadyAppliedError, enqueue, PermanentOpError, registerOp } from "@/lib/offline/outbox";
import { isTransportError } from "@/lib/offline/net";
import type { Person } from "@/lib/types";
import type { GameState } from "./types";
import { migrateSave, RESET_SAVES_BEFORE, SAVE_VERSION } from "./state";
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
  return migrateSave(stored.state, person);
}

export async function saveLocal(person: Person, state: GameState): Promise<void> {
  await idbPut(STORE_META, {
    key: localKey(person),
    person,
    version: SAVE_VERSION,
    state,
    savedAt: Date.now(),
  } satisfies StoredSave);
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

export interface ServerSave {
  person: Person;
  state: unknown;
  hearts: number;
  lifetime_hearts: number;
  tide_changes: number;
  new_waters: number;
  creatures: number;
  legacy_claimed: boolean;
  updated_at: string;
}

export async function loadServer(person: Person): Promise<ServerSave | null> {
  const { data, error } = await supabase()
    .from("game_saves")
    .select("person, state, hearts, lifetime_hearts, tide_changes, new_waters, creatures, legacy_claimed, updated_at")
    .eq("person", person)
    .maybeSingle();
  if (error) throw error;
  return (data as ServerSave | null) ?? null;
}

/** Both partners' rows, for the shared jar and the same-evening check. */
export async function loadBothSaves(): Promise<ServerSave[]> {
  const { data, error } = await supabase()
    .from("game_saves")
    .select("person, state, hearts, lifetime_hearts, tide_changes, new_waters, creatures, legacy_claimed, updated_at");
  if (error) throw error;
  return (data ?? []) as ServerSave[];
}

/**
 * Their jar, to look at.
 *
 * The whole state blob is already in the row and already readable, so watching
 * how the other one is getting on needs no new table, no new column and no new
 * permission: it is the save that was going to be fetched anyway, migrated the
 * same way, and never written back. Returns null rather than throwing when
 * they have not started, which on a fresh pair is most of the time.
 */
export async function loadPartnerSave(
  partner: Person,
): Promise<{ state: GameState; updatedAt: number } | null> {
  const row = await loadServer(partner);
  if (!row || serverIsStale(row)) return null;
  const state = migrateSave(row.state, partner);
  return { state, updatedAt: Date.parse(row.updated_at) || 0 };
}

/** True when this server row predates the reset and has nothing to offer. */
function serverIsStale(server: ServerSave): boolean {
  const version = (server.state as { version?: number } | null)?.version ?? 0;
  return version < RESET_SAVES_BEFORE;
}

/**
 * Pick between the local save and the server save.
 *
 * Same person, different devices, so the rule is simply "whichever has seen
 * more life". Permanent counters are then floored to the larger of the two.
 */
export function reconcile(local: GameState | null, server: ServerSave | null, person: Person): GameState | null {
  // A row written before the reset is not a save any more, whatever its
  // columns say. Discarding it here as well as in `migrateSave` matters,
  // because the high water marks below are read from the columns rather than
  // from the state, and would otherwise hand back the very numbers the reset
  // exists to remove.
  if (server && serverIsStale(server)) server = null;

  if (!local && !server) return null;
  if (!local) return migrateSave(server!.state, person);
  if (!server) return local;

  const serverState = migrateSave(server.state, person);
  const chosen = Number(server.lifetime_hearts) > local.lifetime.hearts ? serverState : local;

  // Settings belong to this device, not to the save.
  //
  // Whichever save wins takes its settings with it, and that is wrong for every
  // field in there: reduced motion, sound, haptics, battery saver and the
  // number format are all statements about the phone in your hand, not about
  // the jar. `tutorialDone` is the one that shows: a server save arriving with
  // a higher lifetime total would replay the first-run tour on a device that
  // had already finished it, which is exactly how it was found.
  if (chosen !== local) chosen.settings = { ...local.settings };

  chosen.lifetime.hearts = Math.max(chosen.lifetime.hearts, Number(server.lifetime_hearts) || 0);
  chosen.tideChanges = Math.max(chosen.tideChanges, Number(server.tide_changes) || 0);
  chosen.newWaters = Math.max(chosen.newWaters, Number(server.new_waters) || 0);
  chosen.legacyClaimed = chosen.legacyClaimed || server.legacy_claimed;
  return chosen;
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

export interface SyncPayload {
  person: Person;
  state: GameState;
  day: string;
}

registerOp<SyncPayload>("game.sync", async (payload) => {
  const { state } = payload;
  const { error } = await supabase().rpc("game_save", {
    p_state: state,
    p_hearts: Math.min(state.wallet.hearts, 1e300),
    p_lifetime: Math.min(state.lifetime.hearts, 1e300),
    p_tide_changes: state.tideChanges,
    p_new_waters: state.newWaters,
    p_creatures: Object.keys(state.creatures).length,
    p_day: payload.day,
    p_day_hearts: Math.max(0, state.stats.history.at(-1)?.hearts ?? 0),
  });
  if (error) {
    if (isTransportError(error)) throw error;
    if (error.code === "23505") throw new AlreadyAppliedError("already saved");
    throw new PermanentOpError(error.message);
  }
});

/** Queue a save. Safe to call while offline. */
export async function queueSync(person: Person, state: GameState, day: string): Promise<void> {
  await enqueue<SyncPayload>(
    "game.sync",
    { person, state: JSON.parse(JSON.stringify(state)) as GameState, day },
    // One pending save at a time: a newer one replaces an older one rather
    // than queueing a backlog of stale snapshots.
    { id: `game.sync:${person}`, label: "Love Jar progress" },
  );
}

/* ------------------------------------------------------------------ */
/* Legacy                                                              */
/* ------------------------------------------------------------------ */

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
/* The shared view                                                     */
/* ------------------------------------------------------------------ */

export interface DailyRow {
  person: Person;
  day: string;
  hearts: number;
}

export async function loadDailyScores(since: string): Promise<DailyRow[]> {
  const { data, error } = await supabase()
    .from("game_daily")
    .select("person, day, hearts")
    .gte("day", since)
    .order("day", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DailyRow[];
}

/** True when the other person has been in the jar in the last few hours. */
export function partnerIsAround(saves: ServerSave[], me: Person, withinMs = 4 * 3_600_000): boolean {
  const theirs = saves.find((s) => s.person !== me);
  if (!theirs?.updated_at) return false;
  return Date.now() - Date.parse(theirs.updated_at) < withinMs;
}
