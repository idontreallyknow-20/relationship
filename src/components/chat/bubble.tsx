"use client";

// A single chat bubble: text or media content, reply quote, delivery status,
// reactions, and the long-press or button entry to the message action sheet.

import { useRef } from "react";
import { MoreHorizontal, RotateCcw } from "lucide-react";
import { HeartIcon } from "@/components/hearts";
import { formatTime } from "@/lib/format";
import type { MessageReaction, Person, Reaction } from "@/lib/types";
import {
  REACTIONS, highlightMatches, kindPreview, type ChatMessage,
} from "./helpers";
import { ImageBody, VideoBody } from "./media";
import { AudioPlayer } from "./voice";
import { DrawingBody } from "./drawing";

/** Delivery state rendered as tiny hearts on own bubbles. */
function StatusHeart({ m }: { m: ChatMessage }) {
  if (m.pending === "sending") {
    return <HeartIcon filled={false} className="heart-pulse h-3 w-3 text-white/80" />;
  }
  if (m.pending === "failed") return null;
  if (m.read_at) return <HeartIcon filled className="h-3 w-3 text-rose" />;
  if (m.delivered_at) return <HeartIcon filled={false} className="h-3 w-3 text-white/90" />;
  return <HeartIcon filled={false} className="h-3 w-3 text-white/50" />;
}

function useLongPress(onFire: () => void, enabled: boolean) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        onFire();
      }, 450);
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onPointerMove: (e: React.PointerEvent) => {
      if (!origin.current) return;
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      if (dx * dx + dy * dy > 144) clear();
    },
  };
}

export function MessageBubble({
  m,
  own,
  meP,
  meName,
  partnerName,
  repliedTo,
  reactions,
  query,
  flash,
  onOpenMenu,
  onOpenImage,
  onQuoteTap,
  onToggleReaction,
  onRetry,
}: {
  m: ChatMessage;
  own: boolean;
  meP: Person;
  meName: string;
  partnerName: string;
  repliedTo: ChatMessage | null;
  reactions: MessageReaction[];
  query: string;
  flash: boolean;
  onOpenMenu: (m: ChatMessage) => void;
  onOpenImage: (url: string) => void;
  onQuoteTap: (id: string) => void;
  onToggleReaction: (m: ChatMessage, reaction: Reaction) => void;
  onRetry: (m: ChatMessage) => void;
}) {
  const deleted = !!m.deleted_at;
  const canMenu = !m.pending && !deleted;
  const press = useLongPress(() => onOpenMenu(m), canMenu);
  const isMedia = !deleted && (m.kind === "image" || m.kind === "video" || m.kind === "drawing");

  // Group reactions by type, keeping the canonical order.
  const grouped = REACTIONS.map((def) => {
    const list = reactions.filter((r) => r.reaction === def.value);
    return { ...def, count: list.length, mine: list.some((r) => r.person === meP) };
  }).filter((g) => g.count > 0);

  const bubbleShape = own
    ? "rounded-2xl rounded-br-md bg-rose-dark text-white"
    : "rounded-2xl rounded-bl-md border border-line bg-white text-berry shadow-soft";

  return (
    <div id={`msg-${m.id}`} className={`flex px-4 ${own ? "justify-end" : "justify-start"}`}>
      <div className={`relative flex max-w-[78%] flex-col ${own ? "items-end" : "items-start"}`}>
        <div
          {...press}
          onContextMenu={(e) => {
            if (!canMenu) return;
            e.preventDefault();
            onOpenMenu(m);
          }}
          className={`relative ${bubbleShape} ${isMedia ? "p-1.5" : "px-3.5 py-2"} ${
            flash ? "ring-2 ring-rose ring-offset-2 ring-offset-cream" : ""
          }`}
        >
          {m.reply_to && !deleted && (
            <button
              type="button"
              onClick={() => onQuoteTap(m.reply_to!)}
              className={`mb-1.5 block w-full min-w-36 rounded-lg border-l-2 px-2.5 py-1.5 text-left text-xs ${
                own
                  ? "border-white/60 bg-white/15 text-white/85"
                  : "border-rose bg-blush/50 text-berry-soft"
              }`}
            >
              <span className="block font-semibold">
                {repliedTo ? (repliedTo.sender === meP ? meName : partnerName) : "Earlier message"}
              </span>
              <span className="line-clamp-2 break-words">
                {repliedTo ? kindPreview(repliedTo) : "Tap to view"}
              </span>
            </button>
          )}

          {deleted ? (
            <p className={`text-sm italic ${own ? "text-white/70" : "text-berry-soft"}`}>
              This message was removed
            </p>
          ) : m.kind === "image" ? (
            <ImageBody m={m} onOpen={onOpenImage} />
          ) : m.kind === "video" ? (
            <VideoBody m={m} />
          ) : m.kind === "audio" ? (
            <AudioPlayer m={m} own={own} />
          ) : m.kind === "drawing" ? (
            <DrawingBody m={m} own={own} />
          ) : (
            <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-snug">
              {highlightMatches(m.body ?? "", query)}
            </p>
          )}

          <div
            className={`flex items-center justify-end gap-1 ${
              isMedia ? "px-1 pb-0.5 pt-1" : "pt-0.5"
            }`}
          >
            {m.edited_at && !deleted && (
              <span className={`text-[0.62rem] ${own ? "text-white/60" : "text-berry-soft/80"}`}>
                edited
              </span>
            )}
            <span className={`text-[0.65rem] ${own ? "text-white/70" : "text-berry-soft"}`}>
              {formatTime(m.created_at)}
            </span>
            {own && <StatusHeart m={m} />}
          </div>
        </div>

        {canMenu && (
          <button
            type="button"
            aria-label="Message options"
            onClick={() => onOpenMenu(m)}
            className={`absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-berry-soft/50 hover:bg-blush/60 hover:text-berry-soft ${
              own ? "-left-8" : "-right-8"
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}

        {grouped.length > 0 && (
          <div className={`z-[1] -mt-2 flex gap-1 ${own ? "pr-2" : "pl-2"}`}>
            {grouped.map((g) => (
              <button
                key={g.value}
                type="button"
                aria-label={`${g.label} reaction${g.mine ? ", tap to remove yours" : ""}`}
                onClick={() => onToggleReaction(m, g.value)}
                className={`pressable flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold shadow-soft ${
                  g.mine
                    ? "border-rose bg-blush text-rose-dark"
                    : "border-line bg-white text-berry-soft"
                }`}
              >
                <g.Icon className="h-3 w-3" fill={g.fill ? "currentColor" : "none"} />
                {g.count > 1 && g.count}
              </button>
            ))}
          </div>
        )}

        {m.pending === "failed" && (
          <button
            type="button"
            onClick={() => onRetry(m)}
            className="pressable mt-1 flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-danger"
          >
            <RotateCcw className="h-3 w-3" />
            Not sent. Tap to retry
          </button>
        )}
      </div>
    </div>
  );
}
