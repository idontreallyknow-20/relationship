"use client";

// Telling the other person something, but only when it is worth telling.
//
// The rule, and the only rule: a nudge is sent when the partner can do
// something they would want to do, and never otherwise. No streak reminders,
// no "come back and play", nothing on a timer. If there is nothing for them to
// act on, the app stays quiet.
//
// There are three of them.

import { notifyPartner } from "@/lib/notify";
import type { GameState } from "./types";

/** At most one nudge of a kind per day, whatever else happens. */
const SENT_PREFIX = "nudge:";

function alreadySent(state: GameState, kind: string, day: string): boolean {
  return state.storyProgress[`${SENT_PREFIX}${kind}:${day}`] === 1;
}

function markSent(state: GameState, kind: string, day: string): void {
  state.storyProgress[`${SENT_PREFIX}${kind}:${day}`] = 1;
}

export interface NudgeContext {
  /** True when the partner has a gift sitting uncollected. */
  giftWaitingForThem: boolean;
  /** True when both of you have played today and the bonus is unclaimed. */
  bothHereUnclaimed: boolean;
  /** True when they answered the daily question and you have not. */
  theyAnsweredYouDidNot: boolean;
}

/**
 * Send whatever is worth sending.
 *
 * Deliberately narrow. Each of these is the partner being able to gain
 * something by opening the app right now, which is the only thing that earns
 * an interruption.
 */
export async function sendNudges(
  state: GameState,
  day: string,
  context: NudgeContext,
): Promise<void> {
  const send = async (kind: string, body: string, url: string) => {
    if (alreadySent(state, kind, day)) return;
    markSent(state, kind, day);
    await notifyPartner("thinking_of_you", `${kind}:${day}`, { body, url });
  };

  if (context.giftWaitingForThem) {
    await send("gift", "There is something waiting in the jar for you", "/jar");
  }
  if (context.bothHereUnclaimed) {
    await send("evening", "You are both here. Everything doubles for a few hours", "/jar");
  }
  if (context.theyAnsweredYouDidNot) {
    // Their answer is sitting unread, which is the one thing only you can fix.
    await send("question", "Their answer is waiting for yours", "/questions");
  }
}

/**
 * Old nudge marks, cleared so `storyProgress` does not grow without bound.
 * Anything older than a week can never be checked again.
 */
export function pruneNudges(state: GameState, day: string): void {
  for (const key of Object.keys(state.storyProgress)) {
    if (!key.startsWith(SENT_PREFIX)) continue;
    const when = key.split(":")[2];
    if (when && when < day) delete state.storyProgress[key];
  }
}
