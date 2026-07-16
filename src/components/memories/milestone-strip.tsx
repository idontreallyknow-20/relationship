"use client";

// "Day N together" strip with the next upcoming milestone.

import { addMonths, differenceInCalendarDays } from "date-fns";
import { HeartIcon } from "@/components/hearts";
import { relationshipDays } from "@/lib/format";

const DAY_MARKS = [50, 100, 200, 300, 365, 500, 730, 1000];

export function nextMilestone(
  startDate: string,
): { label: string; inDays: number } | null {
  const start = new Date(startDate + "T00:00:00");
  const today = new Date();
  const days = relationshipDays(startDate);
  if (days < 1) return null;
  const candidates: { label: string; inDays: number }[] = [];

  const mark = DAY_MARKS.find((m) => m > days);
  if (mark) candidates.push({ label: `${mark} days together`, inDays: mark - days });

  // Next month or year anniversary of the start date.
  for (let k = 1; k <= 1200; k++) {
    const d = addMonths(start, k);
    const inDays = differenceInCalendarDays(d, today);
    if (inDays > 0) {
      const label =
        k % 12 === 0
          ? `${k / 12} year anniversary`
          : `${k} month anniversary`;
      candidates.push({ label, inDays });
      break;
    }
  }

  candidates.sort((a, b) => a.inDays - b.inDays);
  return candidates[0] ?? null;
}

export function MilestoneStrip({ startDate }: { startDate: string }) {
  const days = relationshipDays(startDate);
  if (days < 1) return null;
  const next = nextMilestone(startDate);
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush">
          <HeartIcon className="h-5 w-5 text-rose-dark" />
        </span>
        <p className="font-display text-xl font-semibold text-plum">
          Day {days} together
        </p>
      </div>
      {next && (
        <p className="text-right text-xs text-berry-soft">
          <span className="block font-semibold text-berry">{next.label}</span>
          in {next.inDays} {next.inDays === 1 ? "day" : "days"}
        </p>
      )}
    </div>
  );
}
