// Time dilation, and the promise that it is a penalty.
//
// The trap in this mechanic is that raising a number to a power below one
// makes it *bigger* when the number is under one, so a jar that has just been
// reborn could turn dilation on and be rewarded for it. These tests are mostly
// about that not happening.

import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state";
import { derive } from "@/game/formulas";
import { earnHearts } from "@/game/engine";
import {
  buyDilationUpgrade, dilationPreview, dilationUnlocked, enterDilation, leaveDilation,
} from "@/game/actions";
import {
  BASE_DILATION_POWER, DILATION_UPGRADES, MAX_DILATION_POWER, dilate,
  dilationPower, dilationRequirement, dilationUpgradeCost, hourGain,
} from "@/game/config/dilation";

/** A save far enough along to have the switch. */
function ready() {
  const state = createGameState(0);
  state.seas = 1;
  return state;
}

describe("dilating", () => {
  it("is a penalty at every size, and never a bonus", () => {
    for (const value of [0, 0.5, 1, 1.0001, 2, 1e3, 1e12, 1e120, 1e290]) {
      expect(dilate(value, BASE_DILATION_POWER), `${value} grew`).toBeLessThanOrEqual(value);
    }
    // Under one is where the arithmetic would betray you: 0.25 ** 0.62 is 0.43,
    // which is larger. The guard returns it unchanged instead.
    expect(dilate(0.25, BASE_DILATION_POWER)).toBe(0.25);
  });

  it("bites harder the more you have", () => {
    const small = 1e3 / dilate(1e3, BASE_DILATION_POWER);
    const large = 1e120 / dilate(1e120, BASE_DILATION_POWER);
    expect(large).toBeGreaterThan(small);
  });

  it("never turns into a free multiplier however much is bought", () => {
    const maxed: Record<string, number> = { t_power: 1_000_000 };
    expect(dilationPower(maxed)).toBeLessThanOrEqual(MAX_DILATION_POWER);
    expect(dilationPower(maxed)).toBeLessThan(1);
    expect(dilate(1e50, dilationPower(maxed))).toBeLessThan(1e50);
  });

  it("actually slows the jar down when switched on", () => {
    const state = ready();
    state.upgrades["sideways_walk"] = 400;
    const before = derive(state, 0).heartsPerSecond;
    expect(before).toBeGreaterThan(1);

    expect(enterDilation(state, 0).ok).toBe(true);
    const after = derive(state, 0).heartsPerSecond;
    expect(after).toBeLessThan(before);
    expect(derive(state, 0).dilated).toBe(true);
  });
});

describe("the switch", () => {
  it("waits for the last rebirth", () => {
    const early = createGameState(0);
    expect(dilationUnlocked(early)).toBe(false);
    expect(enterDilation(early, 0).ok).toBe(false);
    expect(early.dilation.active).toBe(false);
  });

  it("only counts hearts earned while it was on", () => {
    const state = ready();
    earnHearts(state, 1e12, "click");
    expect(state.dilation.hearts).toBe(0);

    enterDilation(state, 0);
    earnHearts(state, 5_000, "click");
    expect(state.dilation.hearts).toBe(5_000);
  });

  it("can always be switched off, and pays nothing for a short stretch", () => {
    const state = ready();
    enterDilation(state, 0);
    earnHearts(state, 10, "click");
    const result = leaveDilation(state, 1_000);
    expect(result.ok).toBe(true);
    expect(state.dilation.active).toBe(false);
    expect(state.wallet.hours).toBe(0);
    // A stretch that paid nothing does not make the next one harder.
    expect(state.dilation.runs).toBe(0);
  });

  it("pays hours for a stretch that reached the bar, and raises the next one", () => {
    const state = ready();
    enterDilation(state, 0);
    state.dilation.hearts = dilationRequirement(0) * 100;
    const paid = dilationPreview(state);
    expect(paid).toBeGreaterThan(0);

    expect(leaveDilation(state, 1_000).ok).toBe(true);
    expect(state.wallet.hours).toBe(paid);
    expect(state.dilation.runs).toBe(1);
    expect(dilationRequirement(1)).toBeGreaterThan(dilationRequirement(0));
  });

  it("pays logarithmically, so overshooting is worth something and not everything", () => {
    const onTheBar = hourGain(dilationRequirement(0), 0);
    const wayPast = hourGain(dilationRequirement(0) * 1e12, 0);
    expect(wayPast).toBeGreaterThan(onTheBar);
    expect(wayPast).toBeLessThan(onTheBar * 20);
  });

  it("never asks for more hearts than a number can hold", () => {
    for (let runs = 0; runs < 1_000; runs++) {
      expect(Number.isFinite(dilationRequirement(runs)), `stretch ${runs}`).toBe(true);
      expect(dilationRequirement(runs)).toBeLessThan(1e250);
    }
  });
});

describe("the hours tree", () => {
  it("spends hours and refuses when there are none", () => {
    const state = ready();
    expect(buyDilationUpgrade(state, "t_all").ok).toBe(false);
    state.wallet.hours = 100;
    expect(buyDilationUpgrade(state, "t_all").ok).toBe(true);
    expect(state.dilationUpgrades["t_all"]).toBe(1);
    expect(state.wallet.hours).toBeLessThan(100);
  });

  it("holds the gated ones back until their parent is bought", () => {
    const state = ready();
    state.wallet.hours = 1e9;
    expect(buyDilationUpgrade(state, "t_offline").ok).toBe(false);
    for (let i = 0; i < 3; i++) expect(buyDilationUpgrade(state, "t_power").ok).toBe(true);
    expect(buyDilationUpgrade(state, "t_offline").ok).toBe(true);
  });

  it("makes dilation cheaper as Slower Still is bought", () => {
    const state = ready();
    state.wallet.hours = 1e9;
    const before = dilationPower(state.dilationUpgrades);
    for (let i = 0; i < 5; i++) buyDilationUpgrade(state, "t_power");
    expect(dilationPower(state.dilationUpgrades)).toBeGreaterThan(before);
    expect(dilate(1e60, dilationPower(state.dilationUpgrades)))
      .toBeGreaterThan(dilate(1e60, before));
  });

  it("stops at its maximum rather than taking hours for nothing", () => {
    const state = ready();
    state.wallet.hours = 1e12;
    const def = DILATION_UPGRADES.find((u) => u.id === "t_power")!;
    for (let i = 0; i < def.max; i++) expect(buyDilationUpgrade(state, "t_power").ok).toBe(true);
    const held = state.wallet.hours;
    expect(buyDilationUpgrade(state, "t_power").ok).toBe(false);
    expect(state.wallet.hours).toBe(held);
  });

  it("prices every rung inside the range of a number", () => {
    for (const def of DILATION_UPGRADES) {
      const top = dilationUpgradeCost(def, Math.min(def.max, 200));
      expect(Number.isFinite(top), `${def.name} costs more than a number can hold`).toBe(true);
    }
  });

  it("reaches the derived stats it claims to", () => {
    const state = ready();
    state.wallet.hours = 1e9;
    const before = derive(state, 0).globalMultiplier;
    buyDilationUpgrade(state, "t_all");
    expect(derive(state, 0).globalMultiplier).toBeGreaterThan(before);
  });
});
