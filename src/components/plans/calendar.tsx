"use client";

// Calendar tab: compact month grid plus an agenda of upcoming events with
// a countdown card for the next special occasion and RSVP rows.

import { useMemo, useState } from "react";
import {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, format,
  getDate, getDay, isSameDay, startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, MapPin, Repeat } from "lucide-react";
import { EmptyState, IconButton } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatDay, formatTime } from "@/lib/format";
import { displayName, partnerOf, type CoupleEvent, type EventKind, type EventRsvp, type Person } from "@/lib/types";
import { useNames } from "@/lib/couple-context";
import { expandOccurrences, type Occurrence } from "./occurrences";

const KIND_LABELS: Record<EventKind, string> = {
  date: "Date",
  call: "Call",
  anniversary: "Anniversary",
  birthday: "Birthday",
  trip: "Trip",
  reminder: "Reminder",
  custom: "Plan",
};

const SPECIAL_KINDS: EventKind[] = ["date", "anniversary", "birthday", "trip"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RSVP_CHOICES: { value: EventRsvp["status"]; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

function whenLabel(occ: Occurrence): string {
  const dayPart = formatDay(occ.at);
  if (occ.event.all_day) return dayPart;
  let label = `${dayPart}, ${formatTime(occ.at)}`;
  if (occ.event.ends_at) label += ` to ${formatTime(occ.event.ends_at)}`;
  return label;
}

function RsvpRow({
  event,
  rsvps,
  me,
  onRsvp,
}: {
  event: CoupleEvent;
  rsvps: EventRsvp[];
  me: Person;
  onRsvp: (eventId: string, status: EventRsvp["status"]) => void;
}) {
  const names = useNames();
  const mine = rsvps.find((r) => r.event_id === event.id && r.person === me);
  const partner = partnerOf(me);
  const theirs = rsvps.find((r) => r.event_id === event.id && r.person === partner);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
      <span className="text-xs font-semibold text-berry-soft">Going?</span>
      <div className="flex gap-1" role="radiogroup" aria-label="Your RSVP">
        {RSVP_CHOICES.map((c) => (
          <button
            key={c.value}
            role="radio"
            aria-checked={mine?.status === c.value}
            onClick={() => onRsvp(event.id, c.value)}
            className={`pressable min-h-9 rounded-full px-3.5 text-xs font-semibold ${
              mine?.status === c.value
                ? c.value === "no"
                  ? "bg-berry text-white"
                  : "bg-rose-dark text-white"
                : "bg-blush/60 text-berry-soft"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <span className="ml-auto text-xs text-berry-soft">
        {names[partner]}: {theirs ? theirs.status : "no reply yet"}
      </span>
    </div>
  );
}

export function CalendarTab({
  events,
  rsvps,
  me,
  onEdit,
  onRsvp,
  onAdd,
}: {
  events: CoupleEvent[];
  rsvps: EventRsvp[];
  me: Person;
  onEdit: (event: CoupleEvent) => void;
  onRsvp: (eventId: string, status: EventRsvp["status"]) => void;
  onAdd: () => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const today = new Date();

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const monthOccurrences = useMemo(
    () => expandOccurrences(events, monthStart, monthEnd),
    [events, monthStart, monthEnd],
  );
  const dottedDays = useMemo(
    () => new Set(monthOccurrences.map((o) => format(o.at, "yyyy-MM-dd"))),
    [monthOccurrences],
  );

  const agenda = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return expandOccurrences(events, start, addDays(start, 60));
  }, [events]);

  const nextSpecial = useMemo(() => {
    const now = new Date();
    return agenda.find((o) => {
      if (!SPECIAL_KINDS.includes(o.event.kind)) return false;
      const inDays = differenceInCalendarDays(o.at, now);
      return o.at >= now && inDays <= 30;
    }) ?? null;
  }, [agenda]);

  // Build the month grid, Monday first.
  const cells: (Date | null)[] = useMemo(() => {
    const offset = (getDay(monthStart) + 6) % 7;
    const total = getDate(monthEnd);
    const out: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= total; d++) {
      out.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [monthStart, monthEnd]);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-white p-4 shadow-soft">
        <div className="mb-2 flex items-center justify-between">
          <IconButton label="Previous month" onClick={() => setCursor((c) => addMonths(c, -1))}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <p className="font-display text-xl font-semibold text-plum">
            {format(cursor, "MMMM yyyy")}
          </p>
          <IconButton label="Next month" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-berry-soft">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => (
            <div key={i} className="flex h-10 flex-col items-center justify-center">
              {day && (
                <>
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isSameDay(day, today) ? "bg-plum font-bold text-white" : "text-berry"
                    }`}
                  >
                    {getDate(day)}
                  </span>
                  <span
                    className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                      dottedDays.has(format(day, "yyyy-MM-dd")) ? "bg-rose-dark" : "bg-transparent"
                    }`}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {nextSpecial && (
        <button
          className="pressable block w-full rounded-card border border-blush-deep bg-blush p-4 text-left shadow-soft"
          onClick={() => onEdit(nextSpecial.event)}
        >
          <div className="flex items-center gap-3">
            <HeartIcon className="heart-pulse h-6 w-6 shrink-0 text-rose-dark" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-semibold text-plum">
                {nextSpecial.event.title}
              </p>
              <p className="text-xs text-berry-soft">{whenLabel(nextSpecial)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-rose-dark">
              {differenceInCalendarDays(nextSpecial.at, today) === 0
                ? "today"
                : `in ${differenceInCalendarDays(nextSpecial.at, today)} ${
                    differenceInCalendarDays(nextSpecial.at, today) === 1 ? "day" : "days"
                  }`}
            </span>
          </div>
        </button>
      )}

      <h3 className="font-display text-lg font-semibold text-plum">Coming up</h3>
      {agenda.length === 0 ? (
        <EmptyState
          title="Nothing planned yet"
          hint="Add a date night, a call, or a trip and it will show up here for both of you."
        />
      ) : (
        <div className="space-y-3 pb-4">
          {agenda.map((occ) => {
            const inDays = differenceInCalendarDays(occ.at, today);
            return (
              <div
                key={`${occ.event.id}-${occ.at.toISOString()}`}
                className="rounded-card border border-line bg-white p-4 shadow-soft"
              >
                <button className="pressable block w-full text-left" onClick={() => onEdit(occ.event)}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-lavender-deep">
                      {KIND_LABELS[occ.event.kind]}
                    </span>
                    {occ.event.recurrence !== "none" && (
                      <Repeat className="h-3.5 w-3.5 text-berry-soft" aria-label="Repeats" />
                    )}
                    <span className="flex-1" />
                    {inDays >= 0 && inDays <= 30 && (
                      <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-rose-dark">
                        {inDays === 0 ? "today" : `in ${inDays} ${inDays === 1 ? "day" : "days"}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-display text-lg font-semibold text-plum">
                    {occ.event.title}
                  </p>
                  <p className="text-sm text-berry-soft">{whenLabel(occ)}</p>
                  {occ.event.location && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-berry-soft">
                      <MapPin className="h-3 w-3" />
                      {occ.event.location}
                    </p>
                  )}
                  {occ.event.notes && (
                    <p className="clamp-2 mt-1 text-sm text-berry">{occ.event.notes}</p>
                  )}
                </button>
                <RsvpRow event={occ.event} rsvps={rsvps} me={me} onRsvp={onRsvp} />
              </div>
            );
          })}
        </div>
      )}
      {agenda.length === 0 && (
        <button
          className="pressable mx-auto block min-h-11 rounded-full bg-rose-dark px-6 font-semibold text-white"
          onClick={onAdd}
        >
          Plan something
        </button>
      )}
    </div>
  );
}
