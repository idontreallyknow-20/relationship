"use client";

// Mood history: a weekly grid and a monthly grouped list. Just a gentle
// timeline of check-ins. No scores, no averages, no competition.

import { useMemo, useState } from "react";
import { addDays, format, isToday, startOfWeek } from "date-fns";
import { EmptyState, SegmentedControl } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatDay, formatTime, sameDay } from "@/lib/format";
import type { MoodEntry, Person } from "@/lib/types";
import { displayName } from "@/lib/types";
import { moodColor, moodLabel } from "./meta";

type Range = "week" | "month";
type Filter = "mine" | "both";

export function MoodHistory({ entries, me }: { entries: MoodEntry[]; me: Person }) {
  const [range, setRange] = useState<Range>("week");
  const [filter, setFilter] = useState<Filter>("both");

  const filtered = useMemo(
    () => (filter === "mine" ? entries.filter((e) => e.person === me) : entries),
    [entries, filter, me],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SegmentedControl<Range>
            label="History range"
            value={range}
            onChange={setRange}
            options={[
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        </div>
        <div className="w-36 shrink-0">
          <SegmentedControl<Filter>
            label="Whose moods"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "mine", label: "Mine" },
              { value: "both", label: "Both" },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          hint="Check-ins from this stretch of time will appear here."
        />
      ) : range === "week" ? (
        <WeekGrid entries={filtered} />
      ) : (
        <MonthList entries={filtered} showNames={filter === "both"} />
      )}
    </section>
  );
}

function WeekGrid({ entries }: { entries: MoodEntry[] }) {
  const days = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, []);

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const dayEntries = entries.filter((e) => sameDay(e.created_at, day));
        const today = isToday(day);
        return (
          <div
            key={day.toISOString()}
            className={`flex min-h-28 flex-col items-center gap-1 rounded-xl border p-1.5 ${
              today ? "border-rose bg-blush/40" : "border-line-soft bg-white"
            }`}
          >
            <span className="text-[0.65rem] font-bold uppercase text-berry-soft">
              {format(day, "EEEEE")}
            </span>
            <span className={`text-xs ${today ? "font-bold text-rose-dark" : "text-berry"}`}>
              {format(day, "d")}
            </span>
            <div className="flex flex-col items-center gap-1 pt-0.5">
              {dayEntries.slice(0, 4).map((e) => (
                <span key={e.id} title={`${displayName(e.person)}: ${moodLabel(e)}`}>
                  <HeartIcon className={`h-3.5 w-3.5 ${moodColor(e.mood)}`} />
                </span>
              ))}
              {dayEntries.length > 4 && (
                <span className="text-[0.6rem] font-semibold text-berry-soft">
                  +{dayEntries.length - 4}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthList({ entries, showNames }: { entries: MoodEntry[]; showNames: boolean }) {
  // Entries arrive newest first; group them by calendar day.
  const groups = useMemo(() => {
    const map = new Map<string, MoodEntry[]>();
    for (const e of entries) {
      const key = format(new Date(e.created_at), "yyyy-MM-dd");
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([day, dayEntries]) => (
        <div key={day}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-berry-soft">
            {formatDay(day + "T00:00:00")}
          </p>
          <div className="flex flex-col gap-1.5">
            {dayEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-2.5 rounded-xl border border-line-soft bg-white px-3 py-2.5"
              >
                <HeartIcon className={`mt-0.5 h-4 w-4 shrink-0 ${moodColor(e.mood)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-berry">
                    {moodLabel(e)}
                    {showNames && (
                      <span className="ml-1.5 font-normal text-berry-soft">
                        {displayName(e.person)}
                      </span>
                    )}
                  </p>
                  {e.note && <p className="clamp-2 text-xs text-berry-soft">{e.note}</p>}
                </div>
                <span className="shrink-0 text-xs text-berry-soft">{formatTime(e.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
