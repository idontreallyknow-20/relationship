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
import { buyAll, sealCurrentJar } from "@/game/actions";
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
    if (derived.features.has("seal")) sealCurrentJar(state, now);

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
    // At most the one sentence about ten hearts becoming one, which is an
    // explanation of what is already happening in front of you rather than a
    // system to learn.
    const [first] = play([MINUTE], 0);
    expect(first.features.length).toBeLessThanOrEqual(1);
    expect(first.features.every((f) => f === "colours")).toBe(true);
  });

  it("is still one screen after a minute of tapping hard", () => {
    // Four taps a second is faster than anyone sustains, and it is still the
    // jar. Rungs need a number and a decision, and a minute is not enough of
    // either.
    const [first] = play([MINUTE], 4);
    expect(first.features.length).toBeLessThanOrEqual(2);
    expect(first.features).not.toContain("seal");
  });

  it("has not handed over sealing or the shelf in the first five minutes", () => {
    const [five] = play([5 * MINUTE], 3);
    expect(five.features).not.toContain("seal");
    expect(five.features).not.toContain("shelf");
    expect(five.features).not.toContain("jars");
    expect(five.features).not.toContain("automation");
    expect(five.features).not.toContain("tideChange");
  });

  it("has not handed over rebirth or anything past it in the first hour", () => {
    const [hour] = play([60 * MINUTE], 3);
    // The old ladder reached rebirth, creatures, abilities, vessels, missions
    // and challenges inside the first few minutes. None of them belong in a
    // first sitting.
    expect(hour.features).not.toContain("tideChange");
    expect(hour.features).not.toContain("abilities");
    expect(hour.features).not.toContain("us");
    expect(hour.features).not.toContain("missions");
    expect(hour.features).not.toContain("challenges");
  });

  it("does still give the player somewhere to go inside an hour", () => {
    // The opposite failure is just as real: a first sitting with nothing new in
    // it is not calm, it is empty. Tap, colours, upgrades, buying in tens,
    // sealing, the shelf, a bigger jar and the pets is a good first evening.
    const [hour] = play([60 * MINUTE], 3);
    expect(hour.features).toContain("colours");
    expect(hour.features).toContain("upgrades");
    expect(hour.features).toContain("seal");
    expect(hour.features).toContain("shelf");
    expect(hour.features.length).toBeGreaterThanOrEqual(5);
  });

  // The other half of the same complaint, made later: "new things in the early
  // game should be introduced a bit faster". Measuring it was what mattered.
  // Every rung up to automation was arriving exactly one late-gap after the one
  // before it, so the numbers on the rungs were doing nothing and the opening
  // was a four minute metronome: sealing at nine minutes, the pets at
  // twenty-one. These two pin the window at both ends, because moving one gap
  // constant moves every rung and it is easy to overshoot in either direction.
  it("has given the player the whole of the first evening inside a quarter of an hour", () => {
    const [quarter] = play([15 * MINUTE], 3);
    expect(quarter.features).toContain("seal");
    expect(quarter.features).toContain("shelf");
    expect(quarter.features).toContain("jars");
    expect(quarter.features).toContain("pets");
  });

  it("still lets each of those land before the next one arrives", () => {
    // A minute apart is not "a bit faster", it is the pile-up this ladder was
    // built to stop. Nothing may arrive within a minute of the rung below it.
    const marks = Array.from({ length: 30 }, (_, i) => (i + 1) * 30);
    const snaps = play(marks, 3);
    // The first reveal has nothing before it to be too close to.
    let lastChange: number | null = null;
    let previous = 0;
    for (const snap of snaps) {
      if (snap.features.length === previous) continue;
      if (lastChange !== null) {
        expect(
          snap.at - lastChange,
          `two reveals ${snap.at - lastChange}s apart, at ${snap.at}s`,
        ).toBeGreaterThanOrEqual(60);
      }
      lastChange = snap.at;
      previous = snap.features.length;
    }
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
