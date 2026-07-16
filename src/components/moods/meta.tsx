// Mood definitions: elegant labeled states, each with a heart in its own
// palette tone. No emojis, no scores.

import { HeartIcon } from "@/components/hearts";
import type { Mood, MoodEntry } from "@/lib/types";

export interface MoodOption {
  value: Mood;
  label: string;
  color: string;
}

export const MOOD_OPTIONS: MoodOption[] = [
  { value: "great", label: "Great", color: "text-rose-dark" },
  { value: "happy", label: "Happy", color: "text-rose" },
  { value: "calm", label: "Calm", color: "text-lavender-deep" },
  { value: "tired", label: "Tired", color: "text-plum/60" },
  { value: "stressed", label: "Stressed", color: "text-danger/70" },
  { value: "sad", label: "Sad", color: "text-lavender-deep/70" },
  { value: "upset", label: "Upset", color: "text-danger" },
  { value: "need_comfort", label: "Need comfort", color: "text-rose-deep" },
  { value: "need_space", label: "Need space", color: "text-plum" },
  { value: "custom", label: "Custom", color: "text-berry-soft" },
];

export function moodOption(mood: Mood): MoodOption {
  return MOOD_OPTIONS.find((m) => m.value === mood) ?? MOOD_OPTIONS[MOOD_OPTIONS.length - 1];
}

export function moodColor(mood: Mood): string {
  return moodOption(mood).color;
}

export function moodLabel(entry: Pick<MoodEntry, "mood" | "custom_label">): string {
  if (entry.mood === "custom") return entry.custom_label?.trim() || "Custom";
  return moodOption(entry.mood).label;
}

/** Five small hearts filled up to the intensity. Display only. */
export function IntensityHearts({
  intensity,
  color = "text-rose-deep",
  className = "",
}: {
  intensity: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${color} ${className}`}
      role="img"
      aria-label={`Intensity ${intensity} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <HeartIcon key={i} className="h-3 w-3" filled={i <= intensity} />
      ))}
    </span>
  );
}
