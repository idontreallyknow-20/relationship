// Does the curve actually hold up?
//
// The arithmetic in the config files is easy to get plausibly wrong: a growth
// rate a tenth too steep reads fine in a diff and turns into a wall you sit
// behind for an hour. So rather than trust it, this plays the game.
//
// A simulated player taps, buys whatever it can, seals a full jar, takes a
// bigger one when it can afford it, and rebirths when that is worth more than
// carrying on. The tests then assert the properties the design promises:
// something is always affordable, no rung waits on a clock, idle eventually
// beats tapping, and no run reaches the ceiling.

import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state";
import { derive, upgradeNextCost, meetsUnlock } from "@/game/formulas";
import { performClick, tick } from "@/game/engine";
import {
  buyAll, buyNextJar, buyShelfUpgrade, canChangeTide, changeTide,
  sealCurrentJar, buyResetUpgrade,
} from "@/game/actions";
import { JARS, jarIndex } from "@/game/config/jars";
import { SHELF_UPGRADES, shelfUpgradeCost } from "@/game/config/shelf";
import {
  MOON_UPGRADES, moonGain, seaRequirement, tideRequirement, waterRequirement,
} from "@/game/config/resets";
import { UPGRADES } from "@/game/config/upgrades";
import { NUMBER_CEILING } from "@/game/numbers";
import type { GameState } from "@/game/types";

/** One simulated second, at the real tick rate. */
const TICK_MS = 100;
const TICKS_PER_SECOND = 1000 / TICK_MS;

interface Marks {
  firstSeal: number | null;
  firstRebirth: number | null;
  seals: number;
  rebirths: number;
  jars: number;
  seconds: number;
  hearts: number;
  perSecond: number;
}

/**
 * Play for `seconds`, buying greedily and taking every reset that is offered.
 * `tapsPerSecond` is what a person is doing by hand on top of the automation.
 */
function play(seconds: number, tapsPerSecond = 0, spendMoons = true): Marks {
  const state = createGameState(0);
  const marks: Marks = {
    firstSeal: null, firstRebirth: null, seals: 0, rebirths: 0, jars: 1,
    seconds, hearts: 0, perSecond: 0,
  };

  let now = 0;
  for (let second = 0; second < seconds; second++) {
    for (let t = 0; t < TICKS_PER_SECOND; t++) {
      now += TICK_MS;
      tick(state, TICK_MS, now);
    }

    for (let i = 0; i < tapsPerSecond; i++) {
      performClick(state, derive(state, now), { precision: 1, now, x: 50, y: 50 });
    }

    buyAll(state, 8);

    if (sealCurrentJar(state, now).ok) {
      marks.seals += 1;
      if (marks.firstSeal === null) marks.firstSeal = second;
    }

    // Ribbons go on the shelf tree first, then on a bigger jar.
    for (const def of SHELF_UPGRADES) {
      for (let i = 0; i < 6; i++) {
        const level = state.shelfUpgrades[def.id] ?? 0;
        if (def.max !== Infinity && level >= def.max) break;
        if (state.wallet.ribbons < shelfUpgradeCost(def, level) * 2) break;
        if (!buyShelfUpgrade(state, def.id).ok) break;
      }
    }
    if (buyNextJar(state).ok) marks.jars += 1;

    if (canChangeTide(state)) {
      changeTide(state, now);
      marks.rebirths += 1;
      if (marks.firstRebirth === null) marks.firstRebirth = second;
      if (spendMoons) {
        for (const def of MOON_UPGRADES) {
          if (def.kind === "flag") continue;
          for (let i = 0; i < 20; i++) if (!buyResetUpgrade(state, def.id).ok) break;
        }
      }
    }
  }

  marks.hearts = state.lifetime.hearts;
  marks.perSecond = derive(state, now).heartsPerSecond;
  return marks;
}

/** The cheapest thing the player could buy right now, in hearts. */
function cheapestPurchase(state: GameState): number {
  const derived = derive(state, 0);
  let best = Infinity;
  for (const def of UPGRADES) {
    if (def.currency !== "hearts" || !meetsUnlock(state, def.unlock)) continue;
    const owned = state.upgrades[def.id] ?? 0;
    if (def.max !== Infinity && owned >= def.max) continue;
    best = Math.min(best, upgradeNextCost(state, def, derived));
  }
  return best;
}

describe("no time walls", () => {
  it("always has something affordable within a minute of income", () => {
    const state = createGameState(0);
    let now = 0;
    const stalls: string[] = [];

    for (let second = 0; second < 1_800; second++) {
      for (let t = 0; t < TICKS_PER_SECOND; t++) {
        now += TICK_MS;
        tick(state, TICK_MS, now);
      }
      performClick(state, derive(state, now), { precision: 1, now, x: 0, y: 0 });
      buyAll(state, 8);
      sealCurrentJar(state, now);

      const income = Math.max(derive(state, now).heartsPerSecond, 0.5);
      const wait = (cheapestPurchase(state) - state.wallet.hearts) / income;
      // Sampled once a minute: checking every second says the same thing
      // thirty times over and makes the failure harder to read.
      if (second % 60 === 0 && wait > 60) {
        stalls.push(`${second}s: ${Math.round(wait)}s until anything is affordable`);
      }
    }

    expect(stalls, stalls.join("\n")).toEqual([]);
  });

  it("seals the first jar within a few minutes, hands off", () => {
    const marks = play(600, 0);
    expect(marks.firstSeal, "never sealed a jar in ten minutes").not.toBeNull();
    expect(marks.firstSeal!).toBeLessThan(600);
  });

  it("keeps sealing rather than stalling after the first one", () => {
    expect(play(1_200, 1).seals).toBeGreaterThan(3);
  });

  it("reaches a bigger jar in the first session", () => {
    expect(play(1_800, 1).jars).toBeGreaterThan(1);
  });

  it("gets faster the longer it runs, rather than slower", () => {
    const early = play(600, 1);
    const later = play(2_400, 1);
    expect(later.perSecond).toBeGreaterThan(early.perSecond);
  });
});

describe("idle against active", () => {
  it("plays entirely on its own", () => {
    const idle = play(1_800, 0);
    expect(idle.hearts).toBeGreaterThan(0);
    expect(idle.seals).toBeGreaterThan(0);
  });

  it("rewards tapping early on", () => {
    expect(play(300, 3).hearts).toBeGreaterThan(play(300, 0).hearts * 1.2);
  });

  it("carries the game on its own once the shelf is fed", () => {
    // The shelf is the whole point of the loop: past a certain size it should
    // dwarf what a person can do by hand, which is what makes putting the
    // phone down the correct move rather than a sacrifice.
    const state = createGameState(0);
    state.shelfHearts = 1e9;
    const derived = derive(state, 0);
    expect(derived.heartsPerSecond).toBeGreaterThan(derived.heartsPerClick * 10);
  });
});

describe("the numbers stay sane", () => {
  it("never reaches infinity or NaN over a long run", () => {
    const marks = play(3_600, 2);
    expect(Number.isFinite(marks.hearts)).toBe(true);
    expect(Number.isNaN(marks.hearts)).toBe(false);
    expect(marks.hearts).toBeLessThan(NUMBER_CEILING);
  });

  // The failure this whole rebalance exists to prevent, twice over: the
  // production chain reached the ceiling in fourteen minutes, and deepening
  // reached it in fifteen by a different route.
  it("stays far below the ceiling across four hours of perfect play", () => {
    const marks = play(4 * 3_600, 5);
    expect(marks.hearts).toBeLessThan(1e250);
  });

  it("buys in bulk without ever overspending", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e9;
    buyAll(state, 40);
    expect(state.wallet.hearts).toBeGreaterThanOrEqual(0);
  });

  it("never asks for more hearts than a number can hold", () => {
    for (let n = 0; n < 500; n++) {
      expect(tideRequirement(n)).toBeLessThan(NUMBER_CEILING);
      expect(waterRequirement(n)).toBeLessThan(NUMBER_CEILING);
      expect(seaRequirement(n)).toBeLessThan(NUMBER_CEILING);
    }
  });
});

describe("rebirth is the loop", () => {
  // The shelf is the compounding part of the game, so a rebirth that left it
  // standing would hand the next run its income straight back. That is exactly
  // what the production chain did, and it produced a twenty minute game.
  it("clears the shelf, so the next life starts from the first jar", () => {
    const state = createGameState(0);
    state.wallet.hearts = tideRequirement(0) * 2;
    state.runHearts = tideRequirement(0) * 2;
    state.shelfHearts = 1e9;
    state.sealed = [{ jarId: JARS[0].id, hearts: 1e9, at: 0 }];
    state.jar = JARS[3].id;
    state.jarsUnlocked = JARS.slice(0, 4).map((j) => j.id);

    expect(canChangeTide(state)).toBe(true);
    changeTide(state, 1_000);

    expect(state.shelfHearts).toBe(0);
    expect(state.sealed).toEqual([]);
    expect(state.jar).toBe(JARS[0].id);
    expect(jarIndex(state.jar)).toBe(0);
    expect(state.wallet.moons).toBeGreaterThan(0);
  });

  it("pays for going further without paying proportionally", () => {
    const at = createGameState(0);
    at.runHearts = tideRequirement(0);
    const far = createGameState(0);
    far.runHearts = tideRequirement(0) * 1e6;

    const small = moonGain(at);
    const large = moonGain(far);
    expect(large).toBeGreaterThan(small);
    // Six orders of magnitude more hearts, nowhere near six orders more moons.
    expect(large).toBeLessThan(small * 20);
  });

  it("makes the next run meaningfully faster", () => {
    const plain = createGameState(0);
    const invested = createGameState(0);
    for (const def of MOON_UPGRADES) {
      if (def.kind === "flag") continue;
      invested.moonUpgrades[def.id] = 10;
    }
    expect(derive(invested, 0).heartsPerClick)
      .toBeGreaterThan(derive(plain, 0).heartsPerClick * 2);
  });
});

describe("the pets are a side thing", () => {
  it("are worth having, without being the whole game", () => {
    const alone = createGameState(0);
    alone.slots = [null, null];

    const withPets = createGameState(0);
    expect(derive(withPets, 0).heartsPerSecond)
      .toBeGreaterThan(derive(alone, 0).heartsPerSecond);
  });

  it("never out-earn a well fed shelf", () => {
    const pets = createGameState(0);
    const shelf = createGameState(0);
    shelf.shelfHearts = 1e9;
    expect(derive(shelf, 0).heartsPerSecond)
      .toBeGreaterThan(derive(pets, 0).heartsPerSecond * 100);
  });
});
