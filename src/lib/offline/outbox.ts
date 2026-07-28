"use client";

// Durable write queue. Every action that changes shared data is written here
// first, applied to the local cache immediately, and only then sent. The queue
// survives reloads and crashes because it lives in IndexedDB.
//
// Duplicate protection: an operation carries a client generated id which the
// handler uses as the row's primary key or client_id. If a send actually
// reached the server but the response was lost, the retry hits a unique
// violation, which we treat as success.

import { idbDelete, idbGetAll, idbPut, STORE_OUTBOX } from "./db";
import { isOnline, isTransportError, reportOffline, reportOnline } from "./net";

export type OpStatus = "pending" | "failed";

export interface OutboxOp<P = unknown> {
  id: string;
  type: string;
  payload: P;
  /** Shown in the sync sheet, for example "Answer to today's question". */
  label: string;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  status: OpStatus;
}

export type OpHandler<P = never> = (payload: P, op: OutboxOp<P>) => Promise<void>;

const handlers = new Map<string, OpHandler<never>>();

export function registerOp<P>(type: string, handler: OpHandler<P>): void {
  handlers.set(type, handler as OpHandler<never>);
}

/**
 * Thrown by a handler when the server rejected the operation for good and
 * retrying can never help. The op is dropped and reported to the user.
 */
export class PermanentOpError extends Error {}

/**
 * Thrown by a handler when the server already has this operation. Treated as
 * a clean success so reconnects never double apply anything.
 */
export class AlreadyAppliedError extends Error {}

const MAX_ATTEMPTS = 8;
const BACKOFF_MS = [0, 2_000, 5_000, 15_000, 45_000, 120_000, 300_000, 900_000];

/* ------------------------------------------------------------------ */
/* Queue state and subscriptions                                       */
/* ------------------------------------------------------------------ */

export interface SyncState {
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncedAt: number | null;
}

let cachedOps: OutboxOp[] = [];
let loaded = false;
let syncing = false;
let lastSyncedAt: number | null = null;

type Listener = (state: SyncState, ops: OutboxOp[]) => void;
const listeners = new Set<Listener>();

function snapshot(): SyncState {
  return {
    pending: cachedOps.filter((o) => o.status === "pending").length,
    failed: cachedOps.filter((o) => o.status === "failed").length,
    syncing,
    lastSyncedAt,
  };
}

function emit() {
  const state = snapshot();
  const ops = [...cachedOps].sort((a, b) => a.created_at - b.created_at);
  for (const listener of listeners) listener(state, ops);
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot(), [...cachedOps]);
  return () => listeners.delete(listener);
}

export function outboxSnapshot(): SyncState {
  return snapshot();
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  cachedOps = await idbGetAll<OutboxOp>(STORE_OUTBOX);
  loaded = true;
  emit();
}

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

export async function enqueue<P>(
  type: string,
  payload: P,
  options: { id?: string; label?: string } = {},
): Promise<OutboxOp<P>> {
  await ensureLoaded();
  const op: OutboxOp<P> = {
    id: options.id ?? crypto.randomUUID(),
    type,
    payload,
    label: options.label ?? type,
    created_at: Date.now(),
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
    status: "pending",
  };
  cachedOps = [...cachedOps.filter((o) => o.id !== op.id), op as OutboxOp];
  await idbPut(STORE_OUTBOX, op);
  emit();
  void drain();
  return op;
}

/** Remove a queued operation, for example when the user cancels a draft. */
export async function cancelOp(id: string): Promise<void> {
  await ensureLoaded();
  cachedOps = cachedOps.filter((o) => o.id !== id);
  await idbDelete(STORE_OUTBOX, id);
  emit();
}

/** Push every failed operation back into the queue for another try. */
export async function retryFailed(): Promise<void> {
  await ensureLoaded();
  const now = Date.now();
  for (const op of cachedOps) {
    if (op.status !== "failed") continue;
    op.status = "pending";
    op.attempts = 0;
    op.next_attempt_at = now;
    op.last_error = null;
    await idbPut(STORE_OUTBOX, op);
  }
  emit();
  void drain();
}

export async function discardFailed(): Promise<void> {
  await ensureLoaded();
  const failed = cachedOps.filter((o) => o.status === "failed");
  cachedOps = cachedOps.filter((o) => o.status !== "failed");
  for (const op of failed) await idbDelete(STORE_OUTBOX, op.id);
  emit();
}

/** Queued operations of a given type, so a screen can render pending rows. */
export function pendingOps<P>(type: string): OutboxOp<P>[] {
  return cachedOps.filter((o) => o.type === type) as OutboxOp<P>[];
}

/* ------------------------------------------------------------------ */
/* Drain                                                               */
/* ------------------------------------------------------------------ */

let drainTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDrain(delay: number) {
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(() => {
    drainTimer = null;
    void drain();
  }, Math.max(500, delay));
}

async function drainInner(): Promise<void> {
  await ensureLoaded();
  const now = Date.now();
  const ready = cachedOps
    .filter((o) => o.status === "pending" && o.next_attempt_at <= now)
    .sort((a, b) => a.created_at - b.created_at);

  if (ready.length === 0) {
    const soonest = cachedOps
      .filter((o) => o.status === "pending")
      .reduce<number | null>((min, o) => (min === null || o.next_attempt_at < min ? o.next_attempt_at : min), null);
    if (soonest !== null) scheduleDrain(soonest - now);
    return;
  }

  syncing = true;
  emit();

  for (const op of ready) {
    if (!isOnline()) break;
    const handler = handlers.get(op.type);
    if (!handler) {
      // A build removed this operation type. Drop it rather than blocking
      // everything behind it forever.
      cachedOps = cachedOps.filter((o) => o.id !== op.id);
      await idbDelete(STORE_OUTBOX, op.id);
      continue;
    }
    try {
      await (handler as OpHandler<unknown>)(op.payload, op);
      reportOnline();
      cachedOps = cachedOps.filter((o) => o.id !== op.id);
      await idbDelete(STORE_OUTBOX, op.id);
      lastSyncedAt = Date.now();
    } catch (err) {
      if (err instanceof AlreadyAppliedError) {
        cachedOps = cachedOps.filter((o) => o.id !== op.id);
        await idbDelete(STORE_OUTBOX, op.id);
        lastSyncedAt = Date.now();
        continue;
      }
      const permanent = err instanceof PermanentOpError;
      const transport = !permanent && isTransportError(err);
      if (transport) {
        reportOffline();
        op.attempts += 1;
        op.next_attempt_at = Date.now() + BACKOFF_MS[Math.min(op.attempts, BACKOFF_MS.length - 1)];
        op.last_error = (err as Error)?.message ?? "Network error";
        await idbPut(STORE_OUTBOX, op);
        break; // no point trying the rest while the link is down
      }
      op.attempts += 1;
      op.last_error = (err as Error)?.message ?? "Failed";
      if (permanent || op.attempts >= MAX_ATTEMPTS) {
        op.status = "failed";
      } else {
        op.next_attempt_at = Date.now() + BACKOFF_MS[Math.min(op.attempts, BACKOFF_MS.length - 1)];
      }
      await idbPut(STORE_OUTBOX, op);
    }
    emit();
  }

  syncing = false;
  emit();

  const stillPending = cachedOps.filter((o) => o.status === "pending");
  if (stillPending.length > 0) {
    const soonest = Math.min(...stillPending.map((o) => o.next_attempt_at));
    scheduleDrain(soonest - Date.now());
  }
}

let inFlight: Promise<void> | null = null;

/** Send everything that is ready. Safe to call from anywhere, at any time. */
export function drain(): Promise<void> {
  if (inFlight) return inFlight;
  const work = async () => {
    try {
      // Cross tab guard so two open tabs never send the same op twice.
      if (typeof navigator !== "undefined" && navigator.locks) {
        await navigator.locks.request("cj-outbox", { ifAvailable: true }, async (lock) => {
          if (!lock) return;
          await drainInner();
        });
      } else {
        await drainInner();
      }
    } finally {
      inFlight = null;
    }
  };
  inFlight = work();
  return inFlight;
}
