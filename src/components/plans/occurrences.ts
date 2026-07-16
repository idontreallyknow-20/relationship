// Client-side expansion of recurring events into concrete occurrences
// within a visible window.

import {
  addDays, addMonths, addWeeks, addYears,
  differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears,
} from "date-fns";
import type { CoupleEvent, Recurrence } from "@/lib/types";

export interface Occurrence {
  event: CoupleEvent;
  at: Date;
}

function step(recurrence: Recurrence, base: Date, k: number): Date {
  switch (recurrence) {
    case "daily": return addDays(base, k);
    case "weekly": return addWeeks(base, k);
    case "monthly": return addMonths(base, k);
    case "yearly": return addYears(base, k);
    default: return base;
  }
}

/** A conservative starting step so we do not iterate from a far-past base. */
function initialStep(recurrence: Recurrence, base: Date, windowStart: Date): number {
  let k = 0;
  switch (recurrence) {
    case "daily": k = differenceInCalendarDays(windowStart, base) - 1; break;
    case "weekly": k = Math.floor(differenceInCalendarDays(windowStart, base) / 7) - 1; break;
    case "monthly": k = differenceInCalendarMonths(windowStart, base) - 1; break;
    case "yearly": k = differenceInCalendarYears(windowStart, base) - 1; break;
  }
  return Math.max(0, k);
}

export function expandOccurrences(
  events: CoupleEvent[],
  windowStart: Date,
  windowEnd: Date,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const event of events) {
    const base = new Date(event.starts_at);
    if (event.recurrence === "none") {
      if (base >= windowStart && base <= windowEnd) out.push({ event, at: base });
      continue;
    }
    let k = initialStep(event.recurrence, base, windowStart);
    for (let i = 0; i < 800; i++) {
      const at = step(event.recurrence, base, k);
      if (at > windowEnd) break;
      if (at >= windowStart) out.push({ event, at });
      k++;
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out;
}
