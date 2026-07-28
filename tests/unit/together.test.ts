// The half of the game that needs the other person.
//
// All of it has to keep working with no network, because the two people this
// was built for are frequently on trains, so every test here checks the
// remembered value rather than a live one.

import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state";
import { derive } from "@/game/formulas";
import { recordPartnerRebirths, recordPartnerTotal } from "@/game/actions";
import { JOINT_MILESTONES, combinedRebirths, jointNext, jointReached } from "@/game/config/together";

describe("lives between you", () => {
  it("adds both counts together", () => {
    expect(combinedRebirths(3, 7)).toBe(10);
    expect(combinedRebirths(0, 0)).toBe(0);
    // A partner who has never synced is nothing, not a negative.
    expect(combinedRebirths(4, -1)).toBe(4);
  });

  it("pays the pair rather than the person who did the work", () => {
    const idle = createGameState(0);
    idle.storyProgress["partnerRebirths"] = 25;
    const busy = createGameState(0);
    busy.tideChanges = 25;

    // One has been reborn twenty five times and the other has never done it.
    // They get the same milestones, because the ladder counts the pair.
    expect(jointReached(combinedRebirths(idle.tideChanges, 25))).toEqual(
      jointReached(combinedRebirths(25, 0)),
    );
    expect(derive(idle).globalMultiplier).toBeCloseTo(derive(busy).globalMultiplier, 6);
  });

  it("actually reaches the derived multiplier", () => {
    const alone = createGameState(0);
    const together = createGameState(0);
    together.storyProgress["partnerRebirths"] = 2;

    expect(derive(together).globalMultiplier).toBeGreaterThan(derive(alone).globalMultiplier);
  });

  it("keeps the high water mark when their count resets", () => {
    // A deep rebirth on their side puts their count back to zero. Taking the
    // lower number would quietly remove a rung the pair genuinely reached.
    const state = createGameState(0);
    expect(recordPartnerRebirths(state, 40).ok).toBe(true);
    expect(recordPartnerRebirths(state, 0).ok).toBe(false);
    expect(state.storyProgress["partnerRebirths"]).toBe(40);
  });

  it("ignores nonsense from a save it cannot read", () => {
    const state = createGameState(0);
    expect(recordPartnerRebirths(state, Number.NaN).ok).toBe(false);
    expect(recordPartnerRebirths(state, -5).ok).toBe(false);
    expect(recordPartnerTotal(state, Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(state.storyProgress["partnerRebirths"]).toBeUndefined();
  });

  it("has a next rung until the ladder runs out", () => {
    expect(jointNext(0)?.at).toBe(JOINT_MILESTONES[0].at);
    expect(jointNext(JOINT_MILESTONES[0].at)?.at).toBe(JOINT_MILESTONES[1].at);
    expect(jointNext(Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it("rises the whole way up, with no rung weaker than the one below it", () => {
    let previous = 0;
    for (const milestone of JOINT_MILESTONES) {
      expect(milestone.at).toBeGreaterThan(previous);
      previous = milestone.at;
      const all = milestone.mods.mul?.all ?? 1;
      expect(all, `${milestone.name} pays nothing`).toBeGreaterThan(1);
    }
  });
});
