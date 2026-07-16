// Row types matching the database schema.

export type Person = "cami" | "joseph";

export const PEOPLE: Person[] = ["cami", "joseph"];

export function partnerOf(person: Person): Person {
  return person === "cami" ? "joseph" : "cami";
}

export function displayName(person: Person): string {
  return person === "cami" ? "Cami" : "Joseph";
}

export interface Profile {
  id: string;
  person: Person;
  display_name: string;
  avatar_path: string | null;
  birthday: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Couple {
  id: number;
  start_date: string | null;
  timezone: string;
  welcome_dismissed_by: Person[];
  created_at: string;
}

export interface Device {
  id: string;
  person: Person;
  name: string;
  platform: string | null;
  user_agent: string | null;
  paired_at: string;
  last_active_at: string;
  revoked_at: string | null;
}

export type MessageKind = "text" | "image" | "video" | "audio" | "drawing";
export type Reaction = "love" | "adore" | "laugh" | "sad" | "support";

export interface Message {
  id: string;
  client_id: string;
  sender: Person;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  media_meta: { duration?: number; width?: number; height?: number; size?: number; mime?: string } | null;
  drawing_id: string | null;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

export interface MessageReaction {
  message_id: string;
  person: Person;
  reaction: Reaction;
  created_at: string;
}

export type Mood =
  | "great" | "happy" | "calm" | "tired" | "stressed"
  | "sad" | "upset" | "need_comfort" | "need_space" | "custom";

export interface MoodEntry {
  id: string;
  person: Person;
  mood: Mood;
  custom_label: string | null;
  intensity: number;
  note: string | null;
  would_help: string | null;
  visible: boolean;
  expires_at: string | null;
  cleared_at: string | null;
  created_at: string;
}

export type QuestionKind = "open" | "this_or_that" | "guess_mine";

export interface Question {
  id: string;
  category: string;
  prompt: string;
  kind: QuestionKind;
  option_a: string | null;
  option_b: string | null;
  created_by: Person | null;
  created_at: string;
}

export interface DailyQuestion {
  id: string;
  question_id: string;
  for_date: string;
  skipped: boolean;
  created_at: string;
}

export interface Answer {
  id: string;
  daily_question_id: string;
  person: Person;
  answer: string;
  guess: string | null;
  revealed_early: boolean;
  created_at: string;
}

export type MemoryKind =
  | "photo" | "video" | "drawing" | "letter" | "note"
  | "milestone" | "date" | "mood_highlight" | "plan";

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string | null;
  caption: string | null;
  media_path: string | null;
  media_meta: { width?: number; height?: number; mime?: string } | null;
  drawing_id: string | null;
  letter_id: string | null;
  happened_on: string | null;
  location: string | null;
  created_by: Person;
  created_at: string;
  edited_at: string | null;
}

export interface MemoryComment {
  id: string;
  memory_id: string;
  person: Person;
  body: string;
  created_at: string;
}

export type LetterKind = "instant" | "scheduled" | "open_when" | "compliment" | "appreciation";

export interface Letter {
  id: string;
  author: Person;
  kind: LetterKind;
  title: string | null;
  body: string;
  open_when_label: string | null;
  unlock_at: string | null;
  unlock_notified: boolean;
  opened_at: string | null;
  created_at: string;
}

export type SignalKind =
  | "thinking_of_you" | "check_in" | "made_it_home"
  | "arrived" | "send_support" | "give_space";

export interface Signal {
  id: string;
  from_person: Person;
  kind: SignalKind;
  note: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface Gratitude {
  id: string;
  person: Person;
  body: string;
  created_at: string;
}

export type EventKind = "date" | "call" | "anniversary" | "birthday" | "trip" | "reminder" | "custom";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface CoupleEvent {
  id: string;
  title: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  attachment_path: string | null;
  recurrence: Recurrence;
  remind_minutes: number | null;
  reminded_at: string | null;
  created_by: Person;
  created_at: string;
}

export interface EventRsvp {
  event_id: string;
  person: Person;
  status: "yes" | "no" | "maybe";
  created_at: string;
}

export type ListCategory = "bucket" | "date_idea" | "todo";
export type ListStatus = "idea" | "planned" | "completed";

export interface ListItem {
  id: string;
  category: ListCategory;
  title: string;
  notes: string | null;
  status: ListStatus;
  planned_event_id: string | null;
  completed_at: string | null;
  created_by: Person;
  created_at: string;
}

export type LocationMode = "once" | "hour" | "tonight" | "while_using";

export interface LocationShare {
  id: string;
  person: Person;
  lat: number;
  lng: number;
  accuracy: number | null;
  mode: LocationMode;
  label: string | null;
  shared_at: string;
  expires_at: string;
}

export interface NotificationPrefs {
  person: Person;
  categories: Record<string, boolean>;
  quiet_start: string | null;
  quiet_end: string | null;
  private_previews: boolean;
  updated_at: string;
}

export interface Drawing {
  id: string;
  caption: string | null;
  strokes: Stroke[];
  background: "plain" | "lined" | "grid";
  preview_path: string | null;
  created_by: Person;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stroke {
  color: string;
  size: number;
  erase?: boolean;
  points: [number, number][];
}
