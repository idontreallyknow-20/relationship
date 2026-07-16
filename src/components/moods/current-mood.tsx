"use client";

// Side by side "right now" cards: my latest mood and my partner's latest
// visible mood, with gentle response actions on the partner card.

import { Button, Card } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatRelative } from "@/lib/format";
import type { MoodEntry } from "@/lib/types";
import { IntensityHearts, moodColor, moodLabel } from "./meta";

export function CurrentMoodCard({
  title,
  entry,
  mine,
  emptyHint,
  onUpdate,
  onClear,
  onSupport,
  onSpace,
}: {
  title: string;
  entry: MoodEntry | null;
  mine: boolean;
  emptyHint: string;
  onUpdate?: () => void;
  onClear?: () => void;
  onSupport?: () => void;
  onSpace?: () => void;
}) {
  return (
    <Card className="flex flex-col gap-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-berry-soft">{title}</p>

      {entry ? (
        <>
          <div className="flex items-center gap-2.5">
            <HeartIcon className={`h-7 w-7 shrink-0 ${moodColor(entry.mood)}`} />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-semibold text-plum">
                {moodLabel(entry)}
              </p>
              <IntensityHearts intensity={entry.intensity} color={moodColor(entry.mood)} />
            </div>
          </div>

          {entry.note && <p className="text-sm text-berry">{entry.note}</p>}
          {entry.would_help && (
            <p className="text-sm text-berry-soft">
              <span className="font-semibold text-berry">Would help:</span> {entry.would_help}
            </p>
          )}
          <p className="text-xs text-berry-soft">{formatRelative(entry.created_at)}</p>

          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {mine ? (
              <>
                <Button size="sm" variant="secondary" onClick={onUpdate}>
                  Update
                </Button>
                <Button size="sm" variant="ghost" onClick={onClear}>
                  Clear
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={onSupport}>
                  Send support
                </Button>
                <Button size="sm" variant="ghost" onClick={onSpace}>
                  Give space
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-start gap-2 py-1">
          <HeartIcon className="h-6 w-6 text-blush-deep" filled={false} />
          <p className="text-sm text-berry-soft">{emptyHint}</p>
          {mine && (
            <Button size="sm" variant="secondary" onClick={onUpdate} className="mt-auto">
              Check in
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
