"use client";

// Chat's offline layer.
//
// The chat page already had an in-memory send queue with client-id
// idempotency, which survives a flaky connection but not a reload. This adds
// the durable half: the last page of messages is cached so opening chat with
// no signal shows the conversation rather than an error, and sends, edits,
// deletions and reactions go into the outbox so they survive being closed.
//
// Media is the exception and stays online-only: an upload is a large binary to
// a separate storage bucket, and queueing one would mean holding the blob in
// IndexedDB indefinitely.

import { readCache, writeCache } from "./offline/cache";
import {
  queueDelete, queueInsert, queueKeyedDelete, queueKeyedInsert, queueKeyedUpsert, queueUpdate,
} from "./offline/ops";
import { pendingOps } from "./offline/outbox";
import type { Message, MessageReaction, Reaction } from "./types";

const MESSAGES_KEY = "chat:messages";
const REACTIONS_KEY = "chat:reactions";

/** The newest page, which is what the screen opens on. */
export async function cacheMessages(rows: Message[]): Promise<void> {
  await writeCache(MESSAGES_KEY, rows);
}

export async function cachedMessages(): Promise<Message[]> {
  const entry = await readCache<Message[]>(MESSAGES_KEY);
  return entry?.data ?? [];
}

export async function cacheReactions(rows: MessageReaction[]): Promise<void> {
  await writeCache(REACTIONS_KEY, rows);
}

export async function cachedReactions(): Promise<MessageReaction[]> {
  const entry = await readCache<MessageReaction[]>(REACTIONS_KEY);
  return entry?.data ?? [];
}

/**
 * Send a text message that outlives the tab.
 *
 * Keyed on `client_id`, which the messages table has a unique index on, so a
 * retry whose response was lost is recognised as already applied rather than
 * inserting a second copy.
 */
export function queueMessage(insert: Record<string, unknown>, clientId: string): Promise<unknown> {
  return queueKeyedInsert("messages", insert, clientId, "Message");
}

/** Message ids still waiting to reach the server, so the screen can mark them. */
export function pendingMessageIds(): Set<string> {
  const ids = new Set<string>();
  for (const op of pendingOps<{ table: string; row: { client_id?: string } }>("row.insert")) {
    if (op.payload.table === "messages" && op.payload.row.client_id) {
      ids.add(op.payload.row.client_id);
    }
  }
  return ids;
}

export function queueMessageEdit(id: string, body: string, editedAt: string): Promise<unknown> {
  return queueUpdate("messages", { id }, { body, edited_at: editedAt }, "Message edit");
}

export function queueMessageDelete(id: string, deletedAt: string | null): Promise<unknown> {
  return queueUpdate("messages", { id }, { deleted_at: deletedAt }, deletedAt ? "Remove message" : "Undo remove");
}

export function queueReaction(messageId: string, person: string, reaction: Reaction): Promise<unknown> {
  // One reaction per person per message, and swapping emoji is a change to
  // that row rather than a second one, so this upserts rather than inserts.
  return queueKeyedUpsert(
    "message_reactions",
    { message_id: messageId, person, reaction },
    "message_id,person",
    `${messageId}:${person}`,
    "Reaction",
  );
}

export function queueReactionRemoval(messageId: string, person: string): Promise<unknown> {
  return queueKeyedDelete(
    "message_reactions",
    { message_id: messageId, person },
    `${messageId}:${person}`,
    "Remove reaction",
  );
}

export { queueDelete, queueInsert };
