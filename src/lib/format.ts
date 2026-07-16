import {
  differenceInCalendarDays, format, isSameDay, isSameYear, isToday, isYesterday,
} from "date-fns";

export function formatTime(date: string | Date): string {
  return format(new Date(date), "h:mm a");
}

export function formatDay(date: string | Date): string {
  const d = new Date(date);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isSameYear(d, new Date())) return format(d, "EEEE, MMMM d");
  return format(d, "MMMM d, yyyy");
}

export function formatShortDate(date: string | Date): string {
  const d = new Date(date);
  if (isSameYear(d, new Date())) return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}

export function formatRelative(date: string | Date): string {
  const d = new Date(date);
  const seconds = (Date.now() - d.getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400 && isToday(d)) return `${Math.floor(seconds / 3600)}h ago`;
  if (isYesterday(d)) return "yesterday";
  return formatShortDate(d);
}

export function sameDay(a: string | Date, b: string | Date): boolean {
  return isSameDay(new Date(a), new Date(b));
}

/** Days since the relationship start date, counting day one as day 1. */
export function relationshipDays(startDate: string): number {
  return differenceInCalendarDays(new Date(), new Date(startDate + "T00:00:00")) + 1;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Distance between two coordinates in kilometers (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  const miles = km * 0.621371;
  if (miles < 0.2) return "right nearby";
  if (miles < 10) return `${miles.toFixed(1)} miles apart`;
  return `${Math.round(miles)} miles apart`;
}
