"use client";

// The shared streak, the last week at a glance, and the milestones you have
// passed together.

import { Flame } from "lucide-react";
import { labelDay } from "@/lib/day";
import type { DayView, QuestionMilestone, QuestionStats } from "@/lib/questions";
import { Card } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";

export function StreakCard({
  stats,
  days,
  milestones,
  timezone,
  partnerName,
}: {
  stats: QuestionStats;
  days: DayView[];
  milestones: QuestionMilestone[];
  timezone: string;
  partnerName: string;
}) {
  const latest = milestones[0];

  return (
    <Card className="flex flex-col gap-3 py-3.5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blush text-rose-dark">
            <Flame className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold leading-none text-plum">
              {stats.current_streak}
            </p>
            <p className="text-xs text-berry-soft">day streak</p>
          </div>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-x-4 text-right">
          <div>
            <p className="text-sm font-bold text-berry">{stats.longest_streak}</p>
            <p className="text-[0.65rem] text-berry-soft">best</p>
          </div>
          <div>
            <p className="text-sm font-bold text-berry">{stats.both_days}</p>
            <p className="text-[0.65rem] text-berry-soft">answered</p>
          </div>
        </div>
      </div>

      <ul className="flex items-center justify-between gap-1">
        {days.map((day) => {
          const both = Boolean(day.mine && day.theirs);
          const half = Boolean(day.mine) !== Boolean(day.theirs);
          return (
            <li key={day.dq.for_date} className="flex flex-1 flex-col items-center gap-1">
              <span
                title={`${labelDay(timezone, day.dq.for_date)}: ${
                  both ? "both answered" : half ? "one answer" : "no answers"
                }`}
                className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                  both
                    ? "border-rose-dark bg-rose-dark text-white"
                    : half
                      ? "border-rose bg-blush text-rose-dark"
                      : "border-line bg-white text-line"
                }`}
              >
                <HeartIcon className="h-3.5 w-3.5" filled={both} />
              </span>
              <span className="text-[0.6rem] text-berry-soft">
                {new Date(`${day.dq.for_date}T12:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: "UTC",
                  weekday: "narrow",
                })}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-berry-soft">
        {stats.answered_today && stats.partner_answered_today
          ? "Both of you answered today."
          : stats.answered_today
            ? `Waiting on ${partnerName} to keep the streak going.`
            : stats.partner_answered_today
              ? `${partnerName} answered. Your turn.`
              : "Nobody has answered yet today."}
        {latest && ` Last milestone: ${latest.label}.`}
      </p>
    </Card>
  );
}
