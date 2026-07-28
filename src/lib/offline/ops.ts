"use client";

// The three shapes every offline write in this app takes: insert a row,
// update some columns of a row, delete a row.
//
// `src/lib/questions.ts` hand-wrote each of its operations because each one
// has a genuinely different failure story (an edit can lose a race with the
// partner reading it, an answer can collide with one already given that day).
// Everything else is ordinary, so it goes through here instead of repeating
// forty lines of error triage per table.

import { supabase } from "@/lib/supabase";
import { isTransportError } from "./net";
import { AlreadyAppliedError, PermanentOpError, enqueue, registerOp } from "./outbox";

type Row = Record<string, unknown>;

interface InsertPayload {
  table: string;
  row: Row;
}

interface UpdatePayload {
  table: string;
  /** Columns to match on. Usually `{ id }`, sometimes a composite key. */
  match: Row;
  patch: Row;
}

interface DeletePayload {
  table: string;
  match: Row;
}

/**
 * Insert.
 *
 * The row carries a client-generated `id`, so a retry whose response was lost
 * hits the primary key and comes back as a unique violation. That is success,
 * not failure: the row is already there.
 */
registerOp<InsertPayload>("row.insert", async (payload) => {
  const { error } = await supabase().from(payload.table).insert(payload.row);
  if (!error) return;
  if (isTransportError(error)) throw error;
  if (error.code === "23505") throw new AlreadyAppliedError("row already inserted");
  throw new PermanentOpError(error.message);
});

interface UpsertPayload {
  table: string;
  row: Row;
  onConflict: string;
}

/**
 * Upsert.
 *
 * For rows keyed by a natural composite key where re-submitting means
 * "make it this instead", not "there is already one". Changing a reaction
 * from one emoji to another is the same row with a different value, so a
 * unique violation would be the wrong answer.
 */
registerOp<UpsertPayload>("row.upsert", async (payload) => {
  const { error } = await supabase()
    .from(payload.table)
    .upsert(payload.row, { onConflict: payload.onConflict });
  if (!error) return;
  if (isTransportError(error)) throw error;
  throw new PermanentOpError(error.message);
});

/**
 * Update.
 *
 * Idempotent by nature: applying the same patch twice lands in the same
 * place. A row that has since been deleted is not an error worth surfacing,
 * because the user's intent (that row should look like this) is moot.
 */
registerOp<UpdatePayload>("row.update", async (payload) => {
  let query = supabase().from(payload.table).update(payload.patch);
  for (const [column, value] of Object.entries(payload.match)) query = query.eq(column, value);
  const { error } = await query;
  if (!error) return;
  if (isTransportError(error)) throw error;
  throw new PermanentOpError(error.message);
});

/** Delete. Deleting something already gone is the outcome that was wanted. */
registerOp<DeletePayload>("row.delete", async (payload) => {
  let query = supabase().from(payload.table).delete();
  for (const [column, value] of Object.entries(payload.match)) query = query.eq(column, value);
  const { error } = await query;
  if (!error) return;
  if (isTransportError(error)) throw error;
  throw new PermanentOpError(error.message);
});

/* ------------------------------------------------------------------ */
/* What screens call                                                   */
/* ------------------------------------------------------------------ */

export function queueInsert(table: string, row: Row & { id?: string }, label: string): Promise<unknown> {
  return enqueue<InsertPayload>("row.insert", { table, row }, {
    id: typeof row.id === "string" ? row.id : undefined,
    label,
  });
}

export function queueUpdate(table: string, match: Row, patch: Row, label: string): Promise<unknown> {
  return enqueue<UpdatePayload>("row.update", { table, match, patch }, { label });
}

export function queueDelete(table: string, match: Row, label: string): Promise<unknown> {
  return enqueue<DeletePayload>("row.delete", { table, match }, { label });
}

/**
 * Insert a row that has no id of its own, keyed by its natural key instead.
 *
 * Favourites, votes and RSVPs are all "this person, that thing" rows with a
 * composite primary key and nothing else to deduplicate on. Passing the key
 * as the operation id means queueing the same toggle twice replaces rather
 * than stacks, so a double tap offline cannot insert twice.
 */
export function queueKeyedInsert(table: string, row: Row, key: string, label: string): Promise<unknown> {
  return enqueue<InsertPayload>("row.insert", { table, row }, { id: `${table}:${key}`, label });
}

export function queueKeyedDelete(table: string, match: Row, key: string, label: string): Promise<unknown> {
  return enqueue<DeletePayload>("row.delete", { table, match }, { id: `${table}:del:${key}`, label });
}

/** Keyed upsert, for "set this to that" rows like reactions and RSVPs. */
export function queueKeyedUpsert(
  table: string,
  row: Row,
  onConflict: string,
  key: string,
  label: string,
): Promise<unknown> {
  return enqueue<UpsertPayload>("row.upsert", { table, row, onConflict }, { id: `${table}:${key}`, label });
}
