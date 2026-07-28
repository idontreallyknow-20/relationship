// How much is on screen, and when.
//
// The complaint this file exists to answer was "too much is thrown right at you
// in the beginning". That had been said before and answered before, by hiding
// everything behind lifetime hearts, and it did not work. So this measures it
// rather than reasoning about it: play the game the way a person plays it, and
// assert what is actually on screen after a minute, five minutes, a quarter of
// an hour and an hour.
//
// The player modelled here only does what the game has shown them. It will not
// buy an upgrade before the upgrade tab exists, and it will not deepen before
// deepening has been revealed, because the whole question is what the reveal
// ladder does, not what an omniscient bot could reach.

import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state";
import { derive } from "@/game/formulas";
import { performClick, tick } from "@/game/engine";
import { buyAll, canDeepen, deepen } from "@/game/actions";
import { featuresAt, stageFor, type Feature } from "@/game/config/stages";
import type { GameState } from "@/game/types";

const TICK_MS = 100;
const TICKS_PER_SECOND = 1000 / TICK_MS;

interface Snapshot {
  at: number;
  stage: number;
  features: Feature[];
  hearts: number;
}

/**
 * Play for `seconds`, taking a snapshot at each mark.
 *
 * `tapsPerSecond` is a person tapping. Zero is the jar left alone on a table,
 * which is the harsher test: if the ladder runs away on its own then nothing
 * the player does or does not do can slow it down.
 */
function play(marks: number[], tapsPerSecond: number): Snapshot[] {
  const state: GameState = createGameState(0);
  const out: Snapshot[] = [];
  const total = Math.max(...marks);
  let now = 0;

  for (let second = 1; second <= total; second++) {
    for (let t = 0; t < TICKS_PER_SECOND; t++) {
      now += TICK_MS;
      tick(state, TICK_MS, now);
    }

    const derived = derive(state, now);
    for (let i = 0; i < tapsPerSecond; i++) {
      performClick(state, derived, { precision: 1, now, x: 50, y: 50 });
    }

    // Only the things the game has actually offered.
    if (derived.features.has("upgrades")) buyAll(state, 8);
    if (derived.features.has("deepen") && canDeepen(state)) deepen(state);

    if (marks.includes(second)) {
      const stage = stageFor(state);
      out.push({
        at: second,
        stage,
        features: [...featuresAt(stage)],
        hearts: state.lifetime.hearts,
      });
    }
  }

  return out;
}

const MINUTE = 60;

describe("the opening", () => {
  it("is a jar and a heart for the first minute, left alone", () => {
    const [first] = play([MINUTE], 0);
    expect(first.features).toEqual([]);
  });

  it("is a jar and a heart for the first minute, tapped hard", () => {
    // Four taps a second is faster than anyone sustains, and it is still one
    // screen. Rungs need a number and a decision, and a minute is not enough
    // of either.
    const [first] = play([MINUTE], 4);
    expect(first.features.length).toBeLessThanOrEqual(1);
    expect(first.features.every((f) => f === "upgrades")).toBe(true);
  });

  it("has not handed over the chain in the first five minutes", () => {
    const [five] = play([5 * MINUTE], 3);
    expect(five.features).not.toContain("chain");
    expect(five.features).not.toContain("deepen");
    expect(five.features).not.toContain("automation");
    expect(five.features).not.toContain("tideChange");
  });

  it("has not handed over rebirth, creatures or abilities in the first hour", () => {
    const [hour] = play([60 * MINUTE], 3);
    // The old ladder reached rebirth, creatures, abilities, vessels, missions
    // and challenges inside the first few minutes. None of them belong in a
    // first sitting.
    expect(hour.features).not.toContain("pets");
    expect(hour.features).not.toContain("abilities");
    expect(hour.features).not.toContain("vessels");
    expect(hour.features).not.toContain("missions");
    expect(hour.features).not.toContain("challenges");
  });

  it("does still give the player somewhere to go inside an hour", () => {
    // The opposite failure is just as real: a first sitting with nothing new in
    // it is not calm, it is empty.
    const [hour] = play([60 * MINUTE], 3);
    expect(hour.features).toContain("upgrades");
    expect(hour.features).toContain("buyAmounts");
    expect(hour.features.length).toBeGreaterThanOrEqual(2);
  });

  it("never opens more than one thing at a time", () => {
    const marks = Array.from({ length: 60 }, (_, i) => (i + 1) * MINUTE);
    const snaps = play(marks, 3);
    let previous = 0;
    for (const snap of snaps) {
      expect(
        snap.features.length - previous,
        `${snap.features.length - previous} features arrived at once by minute ${snap.at / 60}`,
      ).toBeLessThanOrEqual(1);
      previous = snap.features.length;
    }
  });

  it("is monotonic: the ladder only ever climbs", () => {
    const marks = Array.from({ length: 60 }, (_, i) => (i + 1) * MINUTE);
    const snaps = play(marks, 3);
    let previous = -1;
    for (const snap of snaps) {
      expect(snap.stage).toBeGreaterThanOrEqual(previous);
      previous = snap.stage;
    }
  });
});
