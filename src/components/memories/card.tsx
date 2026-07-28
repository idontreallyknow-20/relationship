"use client";

// One memory in the timeline list. Layout varies by kind.

import { MapPin } from "lucide-react";
import { Avatar } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatShortDate } from "@/lib/format";
import { displayName, type Memory, type Person } from "@/lib/types";
import { useNames } from "@/lib/couple-context";
import { MemoryMedia } from "./media";

export const KIND_LABELS: Record<Memory["kind"], string> = {
  photo: "Photo",
  video: "Video",
  drawing: "Drawing",
  letter: "Letter",
  note: "Note",
  milestone: "Milestone",
  date: "Date",
  mood_highlight: "Moment",
  plan: "Plan",
};

export function memoryDate(m: Memory): string {
  return m.happened_on ? m.happened_on + "T00:00:00" : m.created_at;
}

export function FavoriteHearts({
  count,
  mine,
  onToggle,
}: {
  count: number;
  mine: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={mine ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={mine}
      className="pressable flex min-h-11 min-w-11 items-center justify-end gap-0.5 px-1"
    >
      {count === 0 ? (
        <HeartIcon className="h-5 w-5 text-berry-soft" filled={false} />
      ) : (
        Array.from({ length: Math.min(count, 2) }).map((_, i) => (
          <HeartIcon key={i} className="h-4 w-4 text-rose-dark" />
        ))
      )}
    </button>
  );
}

export function MemoryCard({
  memory,
  favoritedBy,
  me,
  onOpen,
  onToggleFavorite,
}: {
  memory: Memory;
  favoritedBy: Person[];
  me: Person;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const names = useNames();
  const hasMedia =
    (memory.kind === "photo" || memory.kind === "video" || memory.kind === "drawing") &&
    memory.media_path;
  const isMilestone = memory.kind === "milestone";
  const isTexty = memory.kind === "letter" || memory.kind === "note";

  return (
    <article className="overflow-hidden rounded-card border border-line bg-white shadow-soft">
      <button className="pressable block w-full text-left" onClick={onOpen}>
        {hasMedia && <MemoryMedia memory={memory} className="max-h-80" />}
        {isMilestone && (
          <div className="flex flex-col items-center gap-2 bg-blush px-4 py-6 text-center">
            <HeartIcon className="heart-pulse h-7 w-7 text-rose-dark" />
            <p className="font-display text-2xl font-semibold text-plum">
              {memory.title ?? "A milestone"}
            </p>
            <span className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-rose-dark">
              Milestone
            </span>
          </div>
        )}
        <div className="px-4 pt-3">
          {!isMilestone && memory.title && (
            <h3 className="font-display text-lg font-semibold text-plum">{memory.title}</h3>
          )}
          {memory.caption && (
            <p className={`text-sm text-berry ${isTexty ? "" : "clamp-2"} whitespace-pre-line`}>
              {isTexty && memory.caption.length > 220
                ? memory.caption.slice(0, 220) + "..."
                : memory.caption}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center gap-2 px-4 pb-3 pt-2">
        <Avatar name={names[memory.created_by]} size="sm" />
        {memory.happened_on && (
          <span className="text-xs text-berry-soft">{formatShortDate(memoryDate(memory))}</span>
        )}
        {memory.location && (
          <span className="flex items-center gap-1 rounded-full bg-lavender px-2 py-0.5 text-xs font-semibold text-lavender-deep">
            <MapPin className="h-3 w-3" />
            {memory.location}
          </span>
        )}
        <span className="flex-1" />
        <FavoriteHearts
          count={favoritedBy.length}
          mine={favoritedBy.includes(me)}
          onToggle={onToggleFavorite}
        />
      </div>
    </article>
  );
}
