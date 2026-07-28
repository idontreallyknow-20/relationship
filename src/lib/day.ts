// Day boundaries in the couple's timezone.
//
// The daily question rolls over at midnight in the timezone stored on the
// couple row, not in whichever timezone a phone happens to be in. Before this
// existed the client asked for "today" using the device's local date while the
// server created the row using the couple's date, so a partner travelling one
// timezone east saw "today's question arrives soon" all day.

const DAY_MS = 86_400_000;

/** The couple timezone we fall back to if the row has not loaded yet. */
export const DEFAULT_TIMEZONE = "America/New_York";

function safeZone(timezone: string | null | undefined): string {
  const zone = timezone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Calendar date in `timezone` for an instant, as `yyyy-MM-dd`. */
export function dayIn(timezone: string | null | undefined, at: Date | number = Date.now()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(at));
}

export function todayIn(timezone: string | null | undefined): string {
  return dayIn(timezone);
}

/** How far `timezone` is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(timezone: string, at: number): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - at;
}

/**
 * The instant at which `day` begins in `timezone`. Resolved iteratively so
 * daylight saving transitions land on the right side of the boundary.
 */
export function startOfDayIn(timezone: string | null | undefined, day: string): Date {
  const zone = safeZone(timezone);
  const naive = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(naive)) return new Date(NaN);
  let guess = naive - zoneOffsetMs(zone, naive);
  // One correction pass handles the case where the first guess fell on the
  // other side of a DST change.
  guess = naive - zoneOffsetMs(zone, guess);
  return new Date(guess);
}

/** The instant at which `day` ends (exclusive) in `timezone`. */
export function endOfDayIn(timezone: string | null | undefined, day: string): Date {
  return startOfDayIn(timezone, addDays(day, 1));
}

/** Shift a `yyyy-MM-dd` string by whole days. */
export function addDays(day: string, delta: number): string {
  const base = Date.parse(`${day}T00:00:00Z`);
  return new Date(base + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `yyyy-MM-dd`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Milliseconds until the next midnight in `timezone`. */
export function msUntilNextDay(timezone: string | null | undefined, at: number = Date.now()): number {
  const tomorrow = addDays(dayIn(timezone, at), 1);
  return Math.max(1000, startOfDayIn(timezone, tomorrow).getTime() - at);
}

/**
 * True when the device's own timezone disagrees with the couple's. Used to
 * tell a travelling partner why the question rolls over when it does.
 */
export function deviceZoneDiffers(timezone: string | null | undefined): boolean {
  try {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device) return false;
    return dayIn(device) !== dayIn(timezone);
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Friendly label for a `yyyy-MM-dd` string relative to today in `timezone`. */
export function labelDay(timezone: string | null | undefined, day: string): string {
  const today = todayIn(timezone);
  const diff = daysBetween(day, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const date = new Date(`${day}T12:00:00Z`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: diff < 7 ? "long" : undefined,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
