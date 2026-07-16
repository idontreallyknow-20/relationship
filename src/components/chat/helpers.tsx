"use client";

// Shared bits for the chat feature: local message shape, reaction metadata,
// signed URL hook, touch detection, and search match highlighting.

import { useEffect, useState } from "react";
import {
  HandHeart, Heart, HeartCrack, HeartHandshake, HeartPulse, type LucideIcon,
} from "lucide-react";
import { signedUrl } from "@/lib/media";
import type { Message, Reaction } from "@/lib/types";

export type PendingState = "sending" | "failed";

/** A message row plus local-only state for optimistic sends. */
export interface ChatMessage extends Message {
  /** Present only on rows that have not been confirmed by the server. */
  pending?: PendingState;
  /** Object URL for instant media preview before upload completes. */
  localUrl?: string;
}

export const REACTIONS: { value: Reaction; label: string; Icon: LucideIcon; fill?: boolean }[] = [
  { value: "love", label: "Love", Icon: Heart, fill: true },
  { value: "adore", label: "Adore", Icon: HandHeart },
  { value: "laugh", label: "Laugh", Icon: HeartPulse },
  { value: "sad", label: "Sad", Icon: HeartCrack },
  { value: "support", label: "Support", Icon: HeartHandshake },
];

/** One-line description of a message, used for previews and quotes. */
export function kindPreview(m: Pick<Message, "kind" | "body" | "deleted_at">): string {
  if (m.deleted_at) return "This message was removed";
  switch (m.kind) {
    case "image": return "Sent a photo";
    case "video": return "Sent a video";
    case "audio": return "Sent a voice note";
    case "drawing": return "Sent a drawing";
    default: return m.body ?? "";
  }
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if ("ontouchstart" in window) return true;
  return window.matchMedia?.("(pointer: coarse)").matches === true;
}

/** Resolve a storage path to a signed URL (cached by the media lib). */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

/** Wrap case-insensitive matches of query in a soft highlight. */
export function highlightMatches(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needle);
  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={key++} className="rounded bg-lavender px-0.5 text-plum">
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    cursor = idx + needle.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (parts.length === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
