"use client";

// Question of the Day: data loading, the offline write path, and the rules
// about who can see and edit what.
//
// Everything here is written so the feature works with no connection: answers
// are queued, the day is computed locally from the couple's timezone, and the
// screen renders from the last cached bundle.

import { supabase } from "./supabase";
import { addDays, deviceZone, todayIn } from "./day";
import { patchCache, readCache, settled, writeCache } from "./offline/cache";
import {
  AlreadyAppliedError, PermanentOpError, enqueue, pendingOps, registerOp,
} from "./offline/outbox";
import { isTransportError } from "./offline/net";
import type { Answer, DailyQuestion, Person, Question } from "./types";

export interface DQRow extends DailyQuestion {
  question: Question | null;
}

export interface QuestionPack {
  id: string;
  name: string;
  description: string | null;
  created_by: Person;
  shared: boolean;
  created_at: string;
}

export interface QuestionStats {
  current_streak: number;
  longest_streak: number;
  both_days: number;
  my_answers: number;
  total_answers: number;
  answered_today: boolean;
  partner_answered_today: boolean;
}

export interface QuestionMilestone {
  key: string;
  label: string;
  reached_on: string;
}

export interface QuestionsBundle {
  today: DQRow | null;
  history: DQRow[];
  answers: Answer[];
  questions: Question[];
  favorites: string[];
  packs: QuestionPack[];
  stats: QuestionStats;
  milestones: QuestionMilestone[];
  fetchedFor: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  memories: "Memories",
  favorites: "Favorites",
  future: "Future",
  communication: "Communication",
  appreciation: "Appreciation",
  fun: "Fun",
  funny: "Funny",
  dreams: "Dreams",
  everyday: "Everyday",
  date_ideas: "Date ideas",
  getting_to_know: "Getting to know",
  romantic: "Romantic",
  serious: "Serious",
  personal_growth: "Personal growth",
  relationship: "Relationship",
  preferences: "Preferences",
  random: "Random",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export const BUNDLE_KEY = "questions:bundle";

/* ------------------------------------------------------------------ */
/* Streak milestones                                                   */
/* ------------------------------------------------------------------ */

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365, 500, 1000];

export function milestoneLabel(streak: number): string {
  if (streak === 365) return "A full year of questions";
  if (streak === 1000) return "One thousand days";
  return `${streak} days in a row`;
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

const EMPTY_STATS: QuestionStats = {
  current_streak: 0,
  longest_streak: 0,
  both_days: 0,
  my_answers: 0,
  total_answers: 0,
  answered_today: false,
  partner_answered_today: false,
};

/**
 * Make sure a question exists for today.
 *
 * This used to be the cron's job alone, which meant a missed tick left the day
 * empty. The RPC is idempotent and `for_date` is unique, so a client calling it
 * can never create a second question or race the cron into a duplicate.
 */
export async function ensureToday(day: string, timezone: string): Promise<DQRow | null> {
  const { data, error } = await supabase().rpc("ensure_daily_question", {
    p_date: day,
    p_timezone: timezone,
  });
  if (error) throw error;
  const row = data as DailyQuestion | null;
  if (!row) return null;
  const { data: question } = await supabase()
    .from("questions")
    .select("*")
    .eq("id", row.question_id)
    .maybeSingle();
  return { ...row, question: (question as Question | null) ?? null };
}

export async function loadBundle(person: Person, timezone: string): Promise<QuestionsBundle> {
  const sb = supabase();
  const today = todayIn(timezone);

  // Every one of these goes through `settled`.
  //
  // This was a bare `Promise.all` of seven raw queries, which made Questions
  // the one screen fully on the caching framework and the one screen the eight
  // second deadline did not protect. A request that neither resolves nor
  // rejects (a dead socket, a captive portal) left the page on `loading`
  // forever with no cached copy shown and no error: exactly the failure the
  // rest of this layer exists to prevent.
  const [todayRes, histRes, favRes, questionsRes, packsRes, statsRes, milestonesRes] =
    await Promise.all([
      settled(sb.from("daily_questions").select("*, question:questions(*)").eq("for_date", today).maybeSingle()),
      settled(sb
        .from("daily_questions")
        .select("*, question:questions(*)")
        .lt("for_date", today)
        .order("for_date", { ascending: false })
        .limit(120)),
      settled(sb.from("question_favorites").select("question_id, person")),
      settled(sb.from("questions").select("*").eq("active", true).order("created_at", { ascending: false })),
      settled(sb.from("question_packs").select("*").order("created_at", { ascending: false })),
      settled(sb.rpc("question_stats", { p_today: today })),
      settled(sb.from("question_milestones").select("*").order("reached_on", { ascending: false })),
    ]);

  for (const res of [todayRes, histRes, favRes, questionsRes]) {
    if (res.error) throw res.error;
  }

  let todayRow = (todayRes.data as DQRow | null) ?? null;
  if (!todayRow) {
    // No row for today: mint one rather than showing an empty day.
    todayRow = await ensureToday(today, timezone);
  }

  const history = (histRes.data ?? []) as DQRow[];
  const ids = [...history.map((h) => h.id), ...(todayRow ? [todayRow.id] : [])];
  let answers: Answer[] = [];
  if (ids.length > 0) {
    const answersRes = await sb.from("answers").select("*").in("daily_question_id", ids);
    if (answersRes.error) throw answersRes.error;
    answers = (answersRes.data ?? []) as Answer[];
  }

  const statsRow = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;

  return {
    today: todayRow,
    history,
    answers,
    questions: (questionsRes.data ?? []) as Question[],
    favorites: ((favRes.data ?? []) as { question_id: string; person: string }[])
      .filter((f) => f.person === person)
      .map((f) => f.question_id),
    packs: (packsRes.data ?? []) as QuestionPack[],
    stats: (statsRow as QuestionStats | null) ?? EMPTY_STATS,
    milestones: (milestonesRes.data ?? []) as QuestionMilestone[],
    fetchedFor: today,
  };
}

/* ------------------------------------------------------------------ */
/* Answer rules                                                        */
/* ------------------------------------------------------------------ */

export type AnswerPhase =
  | "unanswered"
  | "waiting"
  | "revealed"
  | "both"
  | "missed";

export interface DayView {
  dq: DQRow;
  question: Question | null;
  mine: Answer | null;
  theirs: Answer | null;
  phase: AnswerPhase;
  /** True while you can still change what you wrote. */
  editable: boolean;
  /** Set once your partner has actually read your answer. */
  seenAt: string | null;
  pending: boolean;
}

export function buildDayView(
  dq: DQRow,
  answers: Answer[],
  me: Person,
  partner: Person,
  today: string,
  pendingIds: Set<string>,
): DayView {
  const mine = answers.find((a) => a.daily_question_id === dq.id && a.person === me) ?? null;
  const theirs = answers.find((a) => a.daily_question_id === dq.id && a.person === partner) ?? null;
  const isToday = dq.for_date === today;

  let phase: AnswerPhase;
  if (mine && theirs) phase = "both";
  else if (mine) phase = "waiting";
  else if (theirs) phase = "revealed";
  else phase = isToday ? "unanswered" : "missed";

  return {
    dq,
    question: dq.question,
    mine,
    theirs,
    phase,
    // The product rule: your answer is yours to change until they have seen it.
    editable: Boolean(mine) && !mine?.seen_by_partner_at,
    seenAt: mine?.seen_by_partner_at ?? null,
    pending: mine ? pendingIds.has(mine.id) : false,
  };
}

/* ------------------------------------------------------------------ */
/* Offline write path                                                  */
/* ------------------------------------------------------------------ */

interface AnswerPayload {
  id: string;
  daily_question_id: string;
  person: Person;
  answer: string;
  guess: string | null;
  revealed_early: boolean;
}

registerOp<AnswerPayload>("question.answer", async (payload) => {
  const { error } = await supabase().from("answers").insert({
    id: payload.id,
    daily_question_id: payload.daily_question_id,
    person: payload.person,
    answer: payload.answer,
    guess: payload.guess,
    revealed_early: payload.revealed_early,
  });
  if (!error) return;
  if (isTransportError(error)) throw error;
  // Already there: either this exact row, or an answer this person had
  // already given for the day. Both mean the work is done.
  if (error.code === "23505") throw new AlreadyAppliedError("answer already saved");
  throw new PermanentOpError(error.message);
});

interface AnswerEditPayload {
  id: string;
  answer: string;
  guess: string | null;
}

registerOp<AnswerEditPayload>("question.answer.edit", async (payload) => {
  const { data, error } = await supabase()
    .from("answers")
    .update({ answer: payload.answer, guess: payload.guess })
    .eq("id", payload.id)
    .select("id");
  if (error) {
    if (isTransportError(error)) throw error;
    throw new PermanentOpError(error.message);
  }
  // No row came back: the partner read it first, so the edit window closed.
  if (!data || data.length === 0) {
    throw new PermanentOpError("Your partner already read that answer, so it stayed as it was");
  }
});

interface RevealPayload {
  id: string;
  revealed: boolean;
}

registerOp<RevealPayload>("question.reveal", async (payload) => {
  const { error } = await supabase()
    .from("answers")
    .update({ revealed_early: payload.revealed })
    .eq("id", payload.id);
  if (error) {
    if (isTransportError(error)) throw error;
    throw new PermanentOpError(error.message);
  }
});

interface FavoritePayload {
  question_id: string;
  person: Person;
  favorite: boolean;
}

registerOp<FavoritePayload>("question.favorite", async (payload) => {
  const sb = supabase();
  const { error } = payload.favorite
    ? await sb.from("question_favorites").upsert({ question_id: payload.question_id, person: payload.person })
    : await sb.from("question_favorites").delete()
        .eq("question_id", payload.question_id).eq("person", payload.person);
  if (error) {
    if (isTransportError(error)) throw error;
    if (error.code === "23505") throw new AlreadyAppliedError("already favorited");
    throw new PermanentOpError(error.message);
  }
});

interface CreateQuestionPayload {
  id: string;
  category: string;
  prompt: string;
  kind: Question["kind"];
  option_a: string | null;
  option_b: string | null;
  created_by: Person;
  pack_id: string | null;
}

registerOp<CreateQuestionPayload>("question.create", async (payload) => {
  const { error } = await supabase().from("questions").insert(payload);
  if (error) {
    if (isTransportError(error)) throw error;
    if (error.code === "23505") throw new AlreadyAppliedError("question already added");
    throw new PermanentOpError(error.message);
  }
});

interface DeleteQuestionPayload {
  id: string;
}

registerOp<DeleteQuestionPayload>("question.delete", async (payload) => {
  const { error } = await supabase().from("questions").delete().eq("id", payload.id);
  if (error) {
    if (isTransportError(error)) throw error;
    throw new PermanentOpError(error.message);
  }
});

interface CreatePackPayload {
  id: string;
  name: string;
  description: string | null;
  created_by: Person;
}

registerOp<CreatePackPayload>("question.pack.create", async (payload) => {
  const { error } = await supabase().from("question_packs").insert(payload);
  if (error) {
    if (isTransportError(error)) throw error;
    if (error.code === "23505") throw new AlreadyAppliedError("pack already created");
    throw new PermanentOpError(error.message);
  }
});

interface MilestonePayload {
  key: string;
  label: string;
  reached_on: string;
}

registerOp<MilestonePayload>("question.milestone", async (payload) => {
  const { error } = await supabase().from("question_milestones").insert(payload);
  if (error) {
    if (isTransportError(error)) throw error;
    if (error.code === "23505") throw new AlreadyAppliedError("milestone already recorded");
    throw new PermanentOpError(error.message);
  }
});

/* ------------------------------------------------------------------ */
/* Public actions. All of these work offline.                          */
/* ------------------------------------------------------------------ */

function cacheKey(person: Person): string {
  return `${BUNDLE_KEY}:${person}`;
}

/** Ids of answers that are still sitting in the outbox. */
export function pendingAnswerIds(): Set<string> {
  const ids = new Set<string>();
  for (const op of pendingOps<AnswerPayload>("question.answer")) ids.add(op.payload.id);
  for (const op of pendingOps<AnswerEditPayload>("question.answer.edit")) ids.add(op.payload.id);
  return ids;
}

export async function submitAnswer(
  person: Person,
  dq: DQRow,
  answer: string,
  guess: string | null,
): Promise<Answer> {
  const row: Answer & { seen_by_partner_at?: string | null } = {
    id: crypto.randomUUID(),
    daily_question_id: dq.id,
    person,
    answer,
    guess,
    revealed_early: false,
    created_at: new Date().toISOString(),
  };

  await patchCache<QuestionsBundle>(cacheKey(person), (current) =>
    current ? { ...current, answers: [...current.answers.filter((a) => a.id !== row.id), row] } : current!,
  );

  await enqueue<AnswerPayload>(
    "question.answer",
    {
      id: row.id,
      daily_question_id: dq.id,
      person,
      answer,
      guess,
      revealed_early: false,
    },
    { id: row.id, label: "Answer to the daily question" },
  );
  return row;
}

export async function editAnswer(
  person: Person,
  answerId: string,
  answer: string,
  guess: string | null,
): Promise<void> {
  await patchCache<QuestionsBundle>(cacheKey(person), (current) =>
    current
      ? {
          ...current,
          answers: current.answers.map((a) => (a.id === answerId ? { ...a, answer, guess } : a)),
        }
      : current!,
  );
  await enqueue<AnswerEditPayload>(
    "question.answer.edit",
    { id: answerId, answer, guess },
    { label: "Edit to your answer" },
  );
}

export async function setRevealedEarly(person: Person, answerId: string, revealed: boolean): Promise<void> {
  await patchCache<QuestionsBundle>(cacheKey(person), (current) =>
    current
      ? {
          ...current,
          answers: current.answers.map((a) =>
            a.id === answerId ? { ...a, revealed_early: revealed } : a,
          ),
        }
      : current!,
  );
  await enqueue<RevealPayload>(
    "question.reveal",
    { id: answerId, revealed },
    { label: revealed ? "Reveal your answer early" : "Hide your answer again" },
  );
}

export async function toggleFavorite(person: Person, questionId: string, favorite: boolean): Promise<void> {
  await patchCache<QuestionsBundle>(cacheKey(person), (current) => {
    if (!current) return current!;
    const favorites = favorite
      ? Array.from(new Set([...current.favorites, questionId]))
      : current.favorites.filter((id) => id !== questionId);
    return { ...current, favorites };
  });
  await enqueue<FavoritePayload>(
    "question.favorite",
    { question_id: questionId, person, favorite },
    { label: favorite ? "Favorite a question" : "Remove a favorite" },
  );
}

export async function createQuestion(
  person: Person,
  input: {
    category: string;
    prompt: string;
    kind: Question["kind"];
    option_a?: string | null;
    option_b?: string | null;
    pack_id?: string | null;
  },
): Promise<Question> {
  const question: Question = {
    id: crypto.randomUUID(),
    category: input.category,
    prompt: input.prompt,
    kind: input.kind,
    option_a: input.option_a ?? null,
    option_b: input.option_b ?? null,
    created_by: person,
    created_at: new Date().toISOString(),
  };
  await patchCache<QuestionsBundle>(cacheKey(person), (current) =>
    current ? { ...current, questions: [question, ...current.questions] } : current!,
  );
  await enqueue<CreateQuestionPayload>(
    "question.create",
    {
      id: question.id,
      category: question.category,
      prompt: question.prompt,
      kind: question.kind,
      option_a: question.option_a,
      option_b: question.option_b,
      created_by: person,
      pack_id: input.pack_id ?? null,
    },
    { id: question.id, label: "New question" },
  );
  return question;
}

export async function deleteQuestion(person: Person, id: string): Promise<void> {
  await patchCache<QuestionsBundle>(cacheKey(person), (current) =>
    current ? { ...current, questions: current.questions.filter((q) => q.id !== id) } : current!,
  );
  await enqueue<DeleteQuestionPayload>("question.delete", { id }, { label: "Remove a question" });
}

export async function createPack(
  person: Person,
  name: string,
  description: string | null,
): Promise<QuestionPack> {
  const pack: QuestionPack = {
    id: crypto.randomUUID(),
    name,
    description,
    created_by: person,
    shared: true,
    created_at: new Date().toISOString(),
  };
  await patchCache<QuestionsBundle>(cacheKey(person), (current) =>
    current ? { ...current, packs: [pack, ...current.packs] } : current!,
  );
  await enqueue<CreatePackPayload>(
    "question.pack.create",
    { id: pack.id, name, description, created_by: person },
    { id: pack.id, label: "New question pack" },
  );
  return pack;
}

/**
 * Mark the partner's answer as read. This is what closes their edit window,
 * so it only fires when the answer is genuinely on screen.
 */
export async function markSeen(dailyQuestionId: string): Promise<void> {
  try {
    await supabase().rpc("mark_answers_seen", { p_daily_question: dailyQuestionId });
  } catch {
    // Best effort. If it fails they simply keep the ability to edit slightly
    // longer, which is the safe direction to fail in.
  }
}

/** Swap today's question. Requires a connection, since it changes shared state. */
export async function swapQuestion(dailyQuestionId: string): Promise<DQRow | null> {
  const { data, error } = await supabase().rpc("swap_daily_question", {
    p_daily_question: dailyQuestionId,
  });
  if (error) throw error;
  const row = data as DailyQuestion | null;
  if (!row) return null;
  const { data: question } = await supabase()
    .from("questions")
    .select("*")
    .eq("id", row.question_id)
    .maybeSingle();
  return { ...row, question: (question as Question | null) ?? null };
}

/** Record a shared streak milestone once, the first time it is reached. */
export async function recordMilestone(streak: number, day: string, existing: QuestionMilestone[]): Promise<QuestionMilestone | null> {
  if (!STREAK_MILESTONES.includes(streak)) return null;
  const key = `streak-${streak}`;
  if (existing.some((m) => m.key === key)) return null;
  const milestone: QuestionMilestone = { key, label: milestoneLabel(streak), reached_on: day };
  await enqueue<MilestonePayload>("question.milestone", milestone, {
    id: key,
    label: "Shared milestone",
  });
  return milestone;
}

/* ------------------------------------------------------------------ */
/* Cache helpers used by the page                                      */
/* ------------------------------------------------------------------ */

export function bundleKey(person: Person): string {
  return cacheKey(person);
}

export async function primeBundle(person: Person, bundle: QuestionsBundle): Promise<void> {
  await writeCache(cacheKey(person), bundle);
}

export async function cachedBundle(person: Person): Promise<QuestionsBundle | null> {
  const entry = await readCache<QuestionsBundle>(cacheKey(person));
  return entry?.data ?? null;
}

/** The last seven days, whether or not they had a question. */
export function recentDays(today: string, count = 7): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -i));
}

export function dayForDevice(timezone: string): { coupleDay: string; deviceDay: string } {
  return { coupleDay: todayIn(timezone), deviceDay: todayIn(deviceZone()) };
}
