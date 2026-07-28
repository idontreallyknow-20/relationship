import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NUMBER_CEILING, affordableLevels, bulkCost, formatNumber, safe, scale,
} from "@/game/numbers";
import { createGameState, migrateSave, SAVE_VERSION } from "@/game/state";
import {
  derive, hasFlag, heldHands, maxAffordable, upgradeCost, visibleUpgrades,
} from "@/game/formulas";
import {
  activateSkill, addCurrency, canSeal, checkAchievements, claimDailyBonus, claimOffline,
  computeOffline, earnHearts, metricTotal, performClick, sealJar, skillReady, tick,
} from "@/game/engine";
import {
  addCreature, applyLegacy, availableCreatures, buyMemory, buyResetUpgrade, buyUpgrade,
  canChangeTide, canChangeWater, changeTide, changeWater, claimMission, collectGift,
  craftItem, feedCreature, finishChallenge, giveItem, grantTogether, growCreature,
  buyAll, buyNextJar, switchToJar, sealCurrentJar, buyShelfUpgrade, leaveGift, levelSkill,
  placeCreature, receiveGift, recordSameEvening, refreshMissions, respec,
  runAutobuyers, salvageItem, startChallenge, startTrip,
  GIFT_WINDOW_MS,
} from "@/game/actions";
import { JARS } from "@/game/config/jars";
import { SHELF_RATE, ribbonGain } from "@/game/config/shelf";
import { UPGRADE_BY_ID } from "@/game/config/upgrades";
import { TIDE_REQUIREMENT, WATER_REQUIREMENT } from "@/game/config/resets";
import { CREATURE_BY_ID, STARTER } from "@/game/config/creatures";
import type { CurrencyId, GameState, Person } from "@/game/types";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A save with enough of everything to exercise a system without playing to it.
 * Bulk buying is a moon upgrade, so it is granted here rather than repeated in
 * every test that needs more than one level of something.
 */
function rich(person: Person = "cami", overrides: Partial<GameState> = {}): GameState {
  const state = createGameState(0, person);
  for (const key of Object.keys(state.wallet) as CurrencyId[]) {
    state.wallet[key] = 1e12;
    state.lifetime[key] = 1e12;
  }
  state.moonUpgrades["m_bulk"] = 1;
  return Object.assign(state, overrides);
}

/** The pet this person starts with. It waits out of the jar until stage seven. */
function starterOf(state: GameState) {
  return Object.values(state.creatures)[0];
}

/** Sit the starter down, for tests about what a seated pet does. */
function seatStarter(state: GameState): GameState {
  const pet = starterOf(state);
  state.slots[0] = pet.id;
  pet.slot = 0;
  return state;
}

/* ------------------------------------------------------------------ */
/* Large number stability                                              */
/* ------------------------------------------------------------------ */

describe("large numbers", () => {
  it("clamps rather than producing Infinity or NaN", () => {
    expect(safe(Infinity)).toBe(NUMBER_CEILING);
    expect(safe(-Infinity)).toBe(-NUMBER_CEILING);
    expect(safe(NaN)).toBe(0);
    expect(scale(1e200, 10, 500)).toBe(NUMBER_CEILING);
    expect(Number.isFinite(bulkCost(1e100, 1.5, 900, 100))).toBe(true);
  });

  it("formats readably at every scale", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1_200)).toBe("1.2K");
    expect(formatNumber(4_500_000)).toBe("4.5M");
    expect(formatNumber(8_700_000_000)).toBe("8.7B");
    expect(formatNumber(1.5e15)).toBe("1.5Qa");
    expect(formatNumber(1_234, "scientific")).toBe("1.234e3");
    expect(formatNumber(1_234, "full")).toBe((1234).toLocaleString());
  });

  it("solves max affordable without looping", () => {
    // Ten levels at base 10, growth 2 costs 10 * (2^10 - 1) = 10230.
    expect(affordableLevels(10_230, 10, 2, 0, Infinity)).toBe(10);
    expect(affordableLevels(10_229, 10, 2, 0, Infinity)).toBe(9);
    expect(affordableLevels(1e12, 10, 2, 0, 5)).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* A new save                                                          */
/* ------------------------------------------------------------------ */

describe("a new save", () => {
  it("starts each person with their own pet, waiting rather than working", () => {
    const hers = createGameState(0, "cami");
    const his = createGameState(0, "joseph");
    expect(starterOf(hers).defId).toBe(STARTER.cami);
    expect(starterOf(his).defId).toBe(STARTER.joseph);
    expect(CREATURE_BY_ID[STARTER.cami]!.line).toBe("otter");
    expect(CREATURE_BY_ID[STARTER.joseph]!.line).toBe("crab");
    expect(hers.codex).toContain(STARTER.cami);

    // Out of the jar, so a brand new save has no passive income before
    // anything has explained what passive income is. That readout appearing on
    // its own is what made it confusing.
    expect(hers.slots[0]).toBeNull();
    expect(starterOf(hers).slot).toBeNull();
    expect(derive(hers, 0).heartsPerSecond).toBe(0);
  });

  it("remembers whose save it is and opens in the first jar", () => {
    const state = createGameState(0, "joseph");
    expect(state.owner).toBe("joseph");
    expect(state.jar).toBe(JARS[0].id);
    expect(state.jarsUnlocked).toEqual([JARS[0].id]);
  });
});

describe("passive income arrives explained", () => {
  // The complaint was that the per second figure was confusing, and the reason
  // was that it appeared before anything had said where it came from: the
  // starter pet was seated from the first second and carried hearts over while
  // the rung explaining pets was still an hour away.
  it("pays nothing per second until something has been earned", () => {
    const state = createGameState(0);
    for (let i = 1; i <= 600; i++) tick(state, 100, i * 100);
    expect(derive(state, 60_000).heartsPerSecond).toBe(0);
    expect(state.stats.heartsFromPassive).toBe(0);
  });

  it("sits the waiting pet down when the rung that explains it opens", () => {
    const state = createGameState(0);
    const pet = starterOf(state);
    expect(pet.slot).toBeNull();

    // Far enough in that every rung up to and including pets is satisfied.
    state.lifetime.hearts = 1e6;
    state.stats.totalClicks = 5_000;
    state.stats.upgradesBought = 500;
    state.stats.jarsSealed = 40;
    state.jarsUnlocked = JARS.slice(0, 4).map((j) => j.id);

    let now = 0;
    for (let i = 0; i < 30; i++) {
      now += 5 * 60_000;
      tick(state, 100, now);
    }

    expect(derive(state, now).features.has("pets")).toBe(true);
    expect(pet.slot).not.toBeNull();
    expect(state.slots).toContain(pet.id);
    expect(derive(state, now).heartsPerSecond).toBeGreaterThan(0);
  });

  it("has something to buy for per second and for time away, early", () => {
    // Both trees, and cheap enough to reach in the first session.
    const early = visibleUpgrades(createGameState(0, "cami"))
      .filter((def) => def.baseCost <= 5_000);
    expect(early.some((def) => def.stat === "cpsFlat" || def.stat === "cps")).toBe(true);
    expect(early.some((def) => def.stat === "offlineHours" || def.stat === "offline")).toBe(true);

    const his = visibleUpgrades(createGameState(0, "joseph"))
      .filter((def) => def.baseCost <= 5_000);
    expect(his.some((def) => def.stat === "cpsFlat" || def.stat === "cps")).toBe(true);
    expect(his.some((def) => def.stat === "offlineHours" || def.stat === "offline")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Clicking, criticals and combos                                      */
/* ------------------------------------------------------------------ */

describe("clicking", () => {
  const tap = (state: GameState, opts: Partial<Parameters<typeof performClick>[2]> = {}) =>
    performClick(state, derive(state, 1_000), {
      precision: 0, now: 1_000, x: 50, y: 50, ...opts,
    });

  it("pays hearts and records the tap", () => {
    const state = createGameState(0);
    const outcome = tap(state);
    expect(outcome.hearts).toBeGreaterThan(0);
    expect(state.wallet.hearts).toBe(outcome.hearts);
    expect(state.stats.totalClicks).toBe(1);
    expect(state.lifetime.hearts).toBe(outcome.hearts);
  });

  it("pays more for a perfectly timed tap", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // never crit
    const loose = tap(createGameState(0), { precision: 0 });
    const tight = tap(createGameState(0), { precision: 1 });
    expect(tight.hearts).toBeGreaterThan(loose.hearts);
    expect(tight.perfect).toBe(true);
    expect(loose.perfect).toBe(false);
  });

  it("criticals multiply the payout and are counted", () => {
    const state = createGameState(0);
    state.upgrades["playful"] = 40; // pushes crit chance high
    vi.spyOn(Math, "random").mockReturnValue(0); // always crit, never mega
    const outcome = tap(state);
    expect(outcome.crit).toBe(true);
    expect(state.stats.criticalClicks).toBe(1);
    expect(state.stats.heartsFromCrits).toBeGreaterThan(0);
    // A critical is a tap too, so it shows in both breakdowns.
    expect(state.stats.heartsFromClicks).toBeGreaterThan(0);
  });

  it("builds a combo that raises the payout and then decays", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const state = createGameState(0);
    let last = 0;
    for (let i = 0; i < 20; i++) {
      last = performClick(state, derive(state, 1_000 + i * 50), {
        precision: 0, now: 1_000 + i * 50, x: 0, y: 0,
      }).hearts;
    }
    expect(state.combo).toBeGreaterThan(1);
    expect(last).toBeGreaterThan(tap(createGameState(0)).hearts);

    // Long enough away and the combo is gone.
    const broken = performClick(state, derive(state, 900_000), {
      precision: 0, now: 900_000, x: 0, y: 0,
    });
    expect(broken.comboBroken).toBe(true);
  });


});

/* ------------------------------------------------------------------ */
/* The jar itself                                                      */
/* ------------------------------------------------------------------ */

describe("the jar", () => {
  it("counts every heart toward the lifetime and the run", () => {
    const state = createGameState(0);
    const capacity = derive(state, 0).capacity;
    earnHearts(state, capacity * 4, "click");
    expect(state.wallet.hearts).toBe(capacity * 4);
    expect(state.lifetime.hearts).toBe(capacity * 4);
    expect(state.runHearts).toBe(capacity * 4);
  });

  it("pays more per tap once it is overflowing", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const level = createGameState(0);
    const over = createGameState(0);
    over.wallet.hearts = derive(over, 0).capacity * 2;
    const opts = { precision: 0, now: 1_000, x: 0, y: 0 };
    expect(performClick(over, derive(over, 1_000), opts).hearts)
      .toBeGreaterThan(performClick(level, derive(level, 1_000), opts).hearts);
  });

  it("moves up to a bigger jar, and only one you have paid for", () => {
    const broke = rich();
    broke.wallet.ribbons = 0;
    expect(buyNextJar(broke).ok).toBe(false);
    expect(broke.jar).toBe(JARS[0].id);

    const state = rich();
    expect(buyNextJar(state).ok).toBe(true);
    expect(state.jar).toBe(JARS[1].id);
    expect(state.jarsUnlocked).toContain(JARS[1].id);
  });

  it("holds more in a bigger jar", () => {
    const small = rich();
    const large = rich();
    buyNextJar(large);
    expect(derive(large, 0).jarCapacity).toBeGreaterThan(derive(small, 0).jarCapacity);
  });

  it("goes back to a jar already unlocked, and not to one that is not", () => {
    const state = rich();
    buyNextJar(state);
    expect(switchToJar(state, JARS[0].id).ok).toBe(true);
    expect(state.jar).toBe(JARS[0].id);
    expect(switchToJar(state, JARS[5].id).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Upgrades and the three trees                                        */
/* ------------------------------------------------------------------ */

describe("upgrades", () => {
  it("costs hearts, raises the stat, and gets more expensive", () => {
    const state = rich();
    const before = derive(state, 0).heartsPerClick;
    const first = upgradeCost(state, UPGRADE_BY_ID["otter_hands"]!, 1);
    expect(buyUpgrade(state, "otter_hands", 1).ok).toBe(true);
    const second = upgradeCost(state, UPGRADE_BY_ID["otter_hands"]!, 1);

    expect(second).toBeGreaterThan(first);
    expect(derive(state, 0).heartsPerClick).toBeGreaterThan(before);
    expect(state.stats.upgradesBought).toBe(1);
  });

  it("refuses the other person's tree outright", () => {
    const his = rich("joseph");
    const hers = rich("cami");
    // Otter Hands is Cami's line.
    expect(buyUpgrade(his, "otter_hands", 1).ok).toBe(false);
    expect(his.upgrades["otter_hands"]).toBeUndefined();
    expect(buyUpgrade(hers, "otter_hands", 1).ok).toBe(true);
    // The shared tree belongs to both of them.
    expect(buyUpgrade(his, "holding_hands", 1).ok).toBe(true);
  });

  it("keeps the other person's tree out of the list entirely", () => {
    const his = rich("joseph");
    const ids = visibleUpgrades(his).map((u) => u.id);
    expect(ids).not.toContain("otter_hands");
    expect(ids).toContain("sideways_walk");
    expect(ids).toContain("holding_hands");
  });



  it("buys in bulk for exactly the summed cost", () => {
    const state = rich();
    const ten = upgradeCost(state, UPGRADE_BY_ID["otter_hands"]!, 10);
    const before = state.wallet.hearts;
    expect(buyUpgrade(state, "otter_hands", 10).ok).toBe(true);
    expect(state.upgrades["otter_hands"]).toBe(10);
    expect(before - state.wallet.hearts).toBeCloseTo(ten, 4);
  });

  it("refuses what you cannot afford and never goes negative", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1;
    expect(buyUpgrade(state, "otter_hands", 1).ok).toBe(false);
    expect(state.wallet.hearts).toBe(1);
  });

  it("stops at the level cap", () => {
    const state = rich();
    const def = UPGRADE_BY_ID["quick_paws"]!;
    expect(buyUpgrade(state, def.id, def.max! + 50).ok).toBe(true);
    expect(state.upgrades[def.id]).toBe(def.max!);
    expect(maxAffordable(state, def)).toBe(0);
    expect(buyUpgrade(state, def.id, 1).ok).toBe(false);
  });

  it("buys in handfuls from the very first life, with nothing to unlock", () => {
    // This used to cost four moons, which meant the first hour of the game was
    // spent pressing a button one level at a time to earn the right to stop.
    const state = rich();
    delete state.moonUpgrades["m_bulk"];
    expect(buyUpgrade(state, "otter_hands", 10).ok).toBe(true);
    expect(state.upgrades["otter_hands"]).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* Creatures                                                           */
/* ------------------------------------------------------------------ */

describe("creatures", () => {
  it("arrives once, goes into a slot, and enters the codex", () => {
    const state = rich("cami");
    const result = addCreature(state, "shore_crab", 0);
    expect(result.ok).toBe(true);
    expect(result.newToCodex).toBe(true);
    expect(state.codex).toContain("shore_crab");
    expect(state.slots).toContain(result.creature!.id);
    expect(addCreature(state, "shore_crab", 0).ok).toBe(false);
  });

  it("feeds, levels, and grows into the next creature", () => {
    const state = rich("cami");
    const creature = starterOf(state);
    const def = CREATURE_BY_ID[creature.defId]!;

    for (let i = 0; i < 60; i++) feedCreature(state, creature.id, "shellfish");
    expect(creature.level).toBeGreaterThan(1);
    expect(creature.fed).toBeGreaterThan(0);

    creature.level = def.evolveAt!.level;
    expect(growCreature(state, creature.id).ok).toBe(true);
    expect(creature.defId).toBe(def.evolvesTo);
    expect(creature.stars).toBe(1);
    expect(state.stats.creaturesEvolved).toBe(1);
  });

  it("makes the jar stronger with more creatures in it", () => {
    const state = rich("cami");
    const alone = derive(state, 0).heartsPerSecond;
    addCreature(state, "shore_crab", 0);
    expect(derive(state, 0).heartsPerSecond).toBeGreaterThanOrEqual(alone);
  });

  it("pairs adjacent otters so they hold hands", () => {
    const state = rich("cami");
    state.wallet.hearts = 1e12;
    state.moonUpgrades["m_slots"] = 4;
    addCreature(state, "sea_otter", 0);
    const otters = Object.values(state.creatures).filter(
      (c) => CREATURE_BY_ID[c.defId]!.line === "otter",
    );
    placeCreature(state, 0, otters[0].id);
    placeCreature(state, 1, otters[1].id);
    expect(heldHands(state).size).toBe(2);
  });

  it("seats a pet only while there is a chair for it", () => {
    // Pets sit around the jar now rather than living in it, so what limits
    // them is the jar's seats, not how deep the water is.
    const state = rich();
    const derived = derive(state, 0);
    expect(derived.creatureSlots).toBe(JARS[0].seats);
  });
});

/* ------------------------------------------------------------------ */
/* Rocks and shells                                                    */
/* ------------------------------------------------------------------ */

describe("rocks and shells", () => {
  it("makes one, gives it to a creature, and makes that creature stronger", () => {
    const state = seatStarter(rich("cami"));
    state.moonUpgrades["m_items"] = 1;
    const made = craftItem(state, "rock", "plain");
    expect(made.ok).toBe(true);
    expect(state.stats.itemsMade).toBe(1);

    // Affixes are rolled, so pin one down to make the effect measurable.
    // Creatures do not make hearts any more, so the thing to measure is the
    // multiplier the item carries rather than passive income.
    state.items[made.item!.id].affixes = [{ kind: "mul", stat: "all", value: 0.5 }];

    const creature = starterOf(state);
    const before = derive(state, 0).globalMultiplier;
    expect(giveItem(state, creature.id, made.item!.id).ok).toBe(true);
    expect(creature.itemId).toBe(made.item!.id);
    expect(derive(state, 0).globalMultiplier).toBeGreaterThan(before);
  });

  it("only lets one creature carry a given item", () => {
    const state = rich("cami");
    state.moonUpgrades["m_items"] = 1;
    const made = craftItem(state, "rock", "plain");
    addCreature(state, "sea_otter", 0);
    const [a, b] = Object.values(state.creatures);
    giveItem(state, a.id, made.item!.id);
    giveItem(state, b.id, made.item!.id);
    expect(a.itemId).toBeNull();
    expect(b.itemId).toBe(made.item!.id);
  });

  it("salvages back into sea glass and takes the item off the creature", () => {
    const state = rich("cami");
    state.moonUpgrades["m_items"] = 1;
    const made = craftItem(state, "rock", "plain");
    const creature = starterOf(state);
    giveItem(state, creature.id, made.item!.id);
    state.wallet.ribbons = 0;
    expect(salvageItem(state, made.item!.id).ok).toBe(true);
    expect(state.wallet.ribbons).toBeGreaterThan(0);
    expect(state.items[made.item!.id]).toBeUndefined();
    expect(creature.itemId).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The loop: otters crack, things sink, crabs collect                  */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Drifters                                                            */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Abilities                                                           */
/* ------------------------------------------------------------------ */

describe("abilities", () => {
  it("is usable the moment it is learned, then has to recover", () => {
    const state = rich();
    expect(skillReady(state, "swell", 1_000)).toBe(false);
    expect(levelSkill(state, "swell").ok).toBe(true);
    expect(skillReady(state, "swell", 1_000)).toBe(true);

    expect(activateSkill(state, "swell", 1_000).ok).toBe(true);
    expect(state.buffs.some((b) => b.source === "skill:swell")).toBe(true);
    expect(activateSkill(state, "swell", 1_100).ok).toBe(false);
    expect(state.stats.skillsUsed).toBe(1);
  });

  it("applies its buff to the derived stats while it lasts", () => {
    const state = rich();
    levelSkill(state, "swell");
    const before = derive(state, 1_000).heartsPerClick;
    activateSkill(state, "swell", 1_000);
    expect(derive(state, 1_100).heartsPerClick).toBeGreaterThan(before);
    // Well past the duration it is gone again.
    expect(derive(state, 1_000 + 86_400_000).heartsPerClick).toBeCloseTo(before, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Time away                                                           */
/* ------------------------------------------------------------------ */

describe("time away", () => {
  it("pays for the hours the jar ran without you", () => {
    const state = rich("cami");
    // The shelf is what runs while you are away, so a jar with nothing sealed
    // into it genuinely earns nothing.
    state.shelfHearts = 1e6;
    state.lastSeenAt = 0;
    const report = computeOffline(state, 3_600_000);
    expect(report.countedMs).toBe(3_600_000);
    expect(report.hearts).toBeGreaterThan(0);

    state.wallet.hearts = 0;
    claimOffline(state, report, 3_600_000);
    expect(state.wallet.hearts).toBeGreaterThan(0);
    expect(state.stats.heartsFromOffline).toBeGreaterThan(0);
  });

  it("caps at the offline window rather than paying for a month", () => {
    const state = rich("cami");
    state.lastSeenAt = 0;
    const windowMs = derive(state, 0).offlineHours * 3_600_000;
    const report = computeOffline(state, windowMs * 30);
    expect(report.countedMs).toBe(windowMs);
    expect(report.cappedByWindow).toBe(true);
  });

  it("pays nothing when the device clock ran backwards", () => {
    const state = rich("cami");
    state.lastSeenAt = 10_000_000;
    const report = computeOffline(state, 0);
    expect(report.clockSuspicious).toBe(true);
    expect(report.hearts).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Missions, achievements, challenges                                  */
/* ------------------------------------------------------------------ */

describe("missions", () => {
  it("rolls a fresh set each day and pays once when a goal is met", () => {
    const state = rich();
    refreshMissions(state, "2026-07-28", "2026-W31");
    expect(state.missions.length).toBeGreaterThan(0);

    const mission = state.missions[0];
    mission.progress = mission.goal;
    expect(claimMission(state, mission.id).ok).toBe(true);
    expect(mission.claimed).toBe(true);
    expect(claimMission(state, mission.id).ok).toBe(false);
    expect(state.stats.missionsCompleted).toBe(1);
  });

  it("refuses to pay a goal that has not been reached", () => {
    const state = rich();
    refreshMissions(state, "2026-07-28", "2026-W31");
    const mission = state.missions[0];
    mission.progress = Math.max(0, mission.goal - 1);
    expect(claimMission(state, mission.id).ok).toBe(false);
  });
});

describe("achievements", () => {
  it("unlocks once per tier and never fires twice", () => {
    const state = createGameState(0);
    expect(checkAchievements(state, 0)).toEqual([]);

    state.stats.totalClicks = 1_000_000;
    const first = checkAchievements(state, 0);
    expect(first.length).toBeGreaterThan(0);
    const again = checkAchievements(state, 0);
    expect(again.filter((a) => a.id === first[0].id).length).toBe(0);
  });

  it("does not fire anything on a brand new save", () => {
    const state = createGameState(Date.now());
    expect(checkAchievements(state, Date.now())).toEqual([]);
    expect(Object.keys(state.achievements).length).toBe(0);
  });
});

describe("challenges", () => {
  it("needs the moon upgrade, strips the run, and restores it afterwards", () => {
    const state = rich();
    buyUpgrade(state, "otter_hands", 20);
    expect(startChallenge(state, "perfect_only", 0).ok).toBe(false);

    state.moonUpgrades["m_challenges"] = 1;
    const upgradesBefore = { ...state.upgrades };
    expect(startChallenge(state, "perfect_only", 0).ok).toBe(true);
    expect(state.upgrades).toEqual({});
    expect(state.wallet.hearts).toBe(0);

    finishChallenge(state, 1_000, true);
    expect(state.upgrades).toEqual(upgradesBefore);
    expect(state.activeChallenge).toBeNull();
  });

  it("pays out and records a best when the goal is met", () => {
    const state = rich();
    state.moonUpgrades["m_challenges"] = 1;
    startChallenge(state, "perfect_only", 0);
    state.activeChallenge!.score = Number.MAX_SAFE_INTEGER;
    const outcome = finishChallenge(state, 1_000);
    expect(outcome.cleared).toBe(true);
    expect(outcome.first).toBe(true);
    expect(state.challenges["perfect_only"].completed).toBe(1);
    expect(state.stats.challengesCompleted).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* The two of you                                                      */
/* ------------------------------------------------------------------ */

describe("together", () => {
  it("pays tide for using the rest of the app, capped per day", () => {
    const state = rich();
    state.wallet.keepsakes = 0;
    expect(grantTogether(state, "question_answered", "2026-07-28", 0).ok).toBe(true);
    expect(state.wallet.keepsakes).toBeGreaterThan(0);
    // Once a day for this one.
    expect(grantTogether(state, "question_answered", "2026-07-28", 0).ok).toBe(false);
    // A new day resets it.
    expect(grantTogether(state, "question_answered", "2026-07-29", 0).ok).toBe(true);
  });

  it("doubles everything for three hours when you both play the same evening", () => {
    const state = rich();
    const before = derive(state, 0).heartsPerClick;
    expect(recordSameEvening(state, "2026-07-28", 0).ok).toBe(true);
    const during = derive(state, 1_000).heartsPerClick;
    expect(during).toBeGreaterThan(before * 1.9);
    // Gone by the next morning, leaving only the tide it raised.
    const after = derive(state, 12 * 3_600_000).heartsPerClick;
    expect(after).toBeLessThan(during / 1.9);
    expect(recordSameEvening(state, "2026-07-28", 0).ok).toBe(false);
  });

  it("leaves a gift on a tide change that the other person can collect", () => {
    const mine = rich("cami");
    leaveGift(mine, "cami", 0);
    expect(mine.giftLeft).not.toBeNull();

    const theirs = rich("joseph");
    theirs.giftWaiting = { ...mine.giftLeft!, collected: false };
    const before = derive(theirs, 0).heartsPerClick;
    expect(collectGift(theirs, 0).ok).toBe(true);
    expect(derive(theirs, 1_000).heartsPerClick).toBeGreaterThan(before);
    expect(theirs.giftWaiting).toBeNull();
    expect(collectGift(theirs, 0).ok).toBe(false);
  });

  it("plays perfectly well alone", () => {
    const state = createGameState(0, "joseph");
    // No partner, no gift, no shared evening: the jar still earns.
    for (let i = 0; i < 100; i++) {
      performClick(state, derive(state, i * 100), {
        precision: 0.5, now: i * 100, x: 0, y: 0,
      });
    }
    expect(state.wallet.hearts).toBeGreaterThan(0);
    expect(state.giftWaiting).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Memories and trips                                                  */
/* ------------------------------------------------------------------ */

describe("memories and trips", () => {
  it("buys a memory once and keeps it forever", () => {
    const state = rich();
    const before = derive(state, 0).globalMultiplier;
    expect(buyMemory(state, "the_mall").ok).toBe(true);
    expect(state.collections["memories"]).toContain("the_mall");
    expect(derive(state, 0).globalMultiplier).toBeGreaterThan(before);
    expect(buyMemory(state, "the_mall").ok).toBe(false);
  });

  it("runs a trip for a while and then it is over", () => {
    const state = rich();
    const before = derive(state, 0).globalMultiplier;
    expect(startTrip(state, "china", 0).ok).toBe(true);
    expect(derive(state, 1_000).globalMultiplier).toBeGreaterThan(before);
    expect(startTrip(state, "china", 0).ok).toBe(false); // already away
    expect(derive(state, 30 * 86_400_000).globalMultiplier).toBeCloseTo(before, 6);
  });

  it("survives a tide change, unlike everything in the run", () => {
    const state = rich();
    buyMemory(state, "the_mall");
    startTrip(state, "china", 0);
    state.runHearts = TIDE_REQUIREMENT;
    changeTide(state, 1_000);
    expect(state.collections["memories"]).toContain("the_mall");
    expect(state.buffs.some((b) => b.source === "trip:china")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Tide changes and new water                                          */
/* ------------------------------------------------------------------ */

describe("tide changes", () => {
  it("is refused below the requirement", () => {
    const state = rich();
    state.runHearts = TIDE_REQUIREMENT - 1;
    expect(canChangeTide(state)).toBe(false);
    expect(changeTide(state, 0).ok).toBe(false);
  });

  it("pays moons, clears the run, and keeps what it should", () => {
    const state = rich();
    buyUpgrade(state, "otter_hands", 20);
    state.wallet.moons = 0;
    state.runHearts = TIDE_REQUIREMENT * 100;
    const creatures = Object.keys(state.creatures).length;

    expect(changeTide(state, 5_000).ok).toBe(true);
    expect(state.wallet.moons).toBeGreaterThan(0);
    expect(state.tideChanges).toBe(1);
    expect(state.upgrades["otter_hands"] ?? 0).toBe(0);
    expect(state.runHearts).toBe(0);
    expect(state.jar).toBe("jam_jar");
    // Creatures, codex, achievements and lifetime totals are untouched.
    expect(Object.keys(state.creatures).length).toBe(creatures);
    expect(state.lifetime.hearts).toBeGreaterThan(0);
    expect(state.stats.fastestTideChangeMs).toBe(5_000);
  });

  it("keeps upgrade levels once What Stays is bought", () => {
    const state = rich();
    state.moonUpgrades["m_keep"] = 3;
    buyUpgrade(state, "otter_hands", 20);
    state.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(state, 1_000);
    expect(state.upgrades["otter_hands"]).toBe(3);
  });

  it("makes the next run faster than the last", () => {
    const state = rich();
    state.runHearts = TIDE_REQUIREMENT * 1e6;
    const before = derive(state, 0).heartsPerClick;
    changeTide(state, 1_000);
    state.wallet.hearts = 0;
    buyResetUpgrade(state, "m_click");
    buyResetUpgrade(state, "m_all");
    expect(derive(state, 0).heartsPerClick).toBeGreaterThan(before);
  });
});

describe("new water", () => {
  it("needs the moon upgrade before it exists at all", () => {
    const state = rich();
    state.eraHearts = WATER_REQUIREMENT * 10;
    expect(hasFlag(state, "new_water")).toBe(false);
    expect(canChangeWater(state)).toBe(false);
    expect(changeWater(state, 0).ok).toBe(false);
  });

  it("pays stars and clears the moon layer with it", () => {
    const state = rich();
    state.moonUpgrades["m_new_water"] = 1;
    state.moonUpgrades["m_click"] = 10;
    state.eraHearts = WATER_REQUIREMENT * 1e6;
    state.wallet.stars = 0;

    expect(changeWater(state, 2_000).ok).toBe(true);
    expect(state.wallet.stars).toBeGreaterThan(0);
    expect(state.newWaters).toBe(1);
    expect(state.moonUpgrades).toEqual({});
    expect(state.tideChanges).toBe(0);
    expect(state.jarsUnlocked).toEqual(["jam_jar"]);
  });

  it("keeps creature levels once They Stay is bought", () => {
    const state = rich();
    state.moonUpgrades["m_new_water"] = 1;
    state.starUpgrades["s_creature_keep"] = 1;
    const creature = starterOf(state);
    creature.level = 9;
    state.eraHearts = WATER_REQUIREMENT * 1e6;
    changeWater(state, 0);
    expect(creature.level).toBe(9);
  });

  it("refunds a reset tree when you change your mind", () => {
    const state = rich();
    buyResetUpgrade(state, "m_click");
    buyResetUpgrade(state, "m_click");
    state.wallet.moons = 0;
    expect(respec(state, "moons").ok).toBe(true);
    expect(state.moonUpgrades).toEqual({});
    expect(state.wallet.moons).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Daily bonus                                                         */
/* ------------------------------------------------------------------ */

describe("the daily bonus", () => {
  // The first open is not a welcome back. This used to hand a brand new save a
  // thousand hearts, three pearls and twenty-three shells before a single tap,
  // which cleared the first three rungs of the reveal ladder on its own and was
  // the single largest reason the opening felt like being given everything at
  // once.
  it("pays nothing on the very first open, and only starts the streak", () => {
    const state = rich();
    const before = state.wallet.hearts;

    expect(claimDailyBonus(state, "2026-07-28")).toBeNull();
    expect(state.wallet.hearts).toBe(before);
    expect(state.dailyBonus).toEqual({ day: "2026-07-28", streak: 1 });
  });

  it("pays once a day from the second day, and builds a streak", () => {
    const state = rich();
    claimDailyBonus(state, "2026-07-28");

    const second = claimDailyBonus(state, "2026-07-29");
    expect(second).not.toBeNull();
    expect(second!.streak).toBe(2);
    expect(second!.hearts).toBeGreaterThan(0);

    // Still only once per day.
    expect(claimDailyBonus(state, "2026-07-29")).toBeNull();

    const third = claimDailyBonus(state, "2026-07-30");
    expect(third!.streak).toBe(3);
  });

  it("starts the streak over when a day is missed", () => {
    const state = rich();
    claimDailyBonus(state, "2026-07-28");
    expect(claimDailyBonus(state, "2026-07-29")!.streak).toBe(2);
    expect(claimDailyBonus(state, "2026-08-05")!.streak).toBe(1);
  });

  // Overfilling is allowed and is worth more: sealing pays logarithmically in
  // the overshoot, so a jar left to run past full is a decision rather than
  // waste. What must not happen is the balance going strange.
  it("can overfill the jar, and stays a real number when it does", () => {
    const state = createGameState(0);
    claimDailyBonus(state, "2026-07-28");
    claimDailyBonus(state, "2026-07-29");
    expect(Number.isFinite(state.wallet.hearts)).toBe(true);
    expect(state.wallet.hearts).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

describe("metrics", () => {
  it("adds up across a run and feeds missions and achievements alike", () => {
    const state = rich();
    const before = metricTotal(state, "clicks");
    performClick(state, derive(state, 0), { precision: 0, now: 0, x: 0, y: 0 });
    expect(metricTotal(state, "clicks")).toBeGreaterThan(before);
  });
});

/* ------------------------------------------------------------------ */
/* Migration from the old save                                         */
/* ------------------------------------------------------------------ */

describe("migration", () => {
  it("throws away a save from before the reset rather than converting it", () => {
    // Every save written before version 7 was played on a curve where a
    // rebirth did not clear the production chain, so it carries counts the
    // current game could not produce. Half converting one would mean the new
    // balance never actually applies.
    const old = {
      version: 6,
      wallet: { hearts: 5e120 },
      lifetime: { hearts: 1e300 },
      upgrades: { otter_hands: 400 },
      moonUpgrades: { m_all: 60, m_depth: 100 },
      tideChanges: 780,
      newWaters: 12,
      deepens: 163,
      stats: { totalClicks: 12_345 },
    };

    const state = migrateSave(old, "joseph");
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.owner).toBe("joseph");
    expect(state.wallet.hearts).toBe(0);
    expect(state.lifetime.hearts).toBe(0);
    expect(state.tideChanges).toBe(0);
    expect(state.newWaters).toBe(0);
    expect(state.stats.jarsSealed).toBe(0);
    expect(state.shelfHearts).toBe(0);
    expect(state.upgrades).toEqual({});
    expect(state.moonUpgrades).toEqual({});
    expect(state.stats.totalClicks).toBe(0);

    // Still a playable save rather than an empty object: whoever opens this
    // gets a first creature and a jar exactly as a new player would.
    expect(Object.keys(state.creatures).length).toBeGreaterThan(0);
    expect(starterOf(state).defId).toBe(STARTER.joseph);
    expect(state.jar).toBe("jam_jar");
  });

  it("resets the very oldest saves too, whatever shape they were in", () => {
    // The version 3 saves had pets, charms and worlds, and there used to be
    // careful conversion code for all of it. It is unreachable now, which is
    // the point of pinning it: anything older than the reset is a fresh start.
    const state = migrateSave(
      { version: 3, worldsUnlocked: ["bedroom", "rose_garden"], world: "rose_garden", rebirths: 4 },
      "cami",
    );
    expect(state.jarsUnlocked).toEqual(["jam_jar"]);
    expect(state.jar).toBe("jam_jar");
    expect(state.tideChanges).toBe(0);
  });

  it("carries a current save forward untouched", () => {
    const played = rich("cami");
    played.tideChanges = 3;
    played.upgrades["otter_hands"] = 12;
    const state = migrateSave(JSON.parse(JSON.stringify(played)), "cami");
    expect(state.tideChanges).toBe(3);
    expect(state.upgrades["otter_hands"]).toBe(12);
    expect(state.version).toBe(SAVE_VERSION);
  });

  it("survives a corrupt save rather than refusing to open", () => {
    const state = migrateSave({ version: 3, wallet: { hearts: NaN }, runHearts: NaN, slots: "nope" }, "cami");
    expect(Number.isFinite(state.wallet.hearts)).toBe(true);
    expect(Number.isFinite(state.runHearts)).toBe(true);
    expect(Array.isArray(state.slots)).toBe(true);
    expect(migrateSave(null, "cami").version).toBe(SAVE_VERSION);
    expect(migrateSave("nonsense", "cami").version).toBe(SAVE_VERSION);
  });

  it("leaves a current save alone", () => {
    const current = rich("cami");
    current.upgrades["otter_hands"] = 7;
    current.jarsUnlocked = [JARS[0].id, JARS[1].id];
    current.jar = JARS[1].id;
    const state = migrateSave(JSON.parse(JSON.stringify(current)), "cami");
    expect(state.upgrades["otter_hands"]).toBe(7);
    expect(state.jar).toBe(JARS[1].id);
  });
});

/* ------------------------------------------------------------------ */
/* The old jar                                                         */
/* ------------------------------------------------------------------ */

describe("the old love jar", () => {
  it("carries every tap over exactly once", () => {
    const state = createGameState(0);
    applyLegacy(state, 4_200);
    expect(state.lifetime.hearts).toBe(4_200);
    expect(state.stats.totalClicks).toBe(4_200);
    applyLegacy(state, 4_200);
    expect(state.lifetime.hearts).toBe(4_200);
    expect(state.legacyClaimed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Nothing runs away                                                   */
/* ------------------------------------------------------------------ */

describe("stability", () => {
  it("keeps every derived stat finite at absurd totals", () => {
    const state = rich();
    state.lifetime.hearts = 1e250;
    state.tideChanges = 5_000;
    state.newWaters = 500;
    for (const def of Object.values(UPGRADE_BY_ID)) {
      state.upgrades[def.id] = def.max ?? 5_000;
    }
    state.moonUpgrades["m_all"] = 60;
    state.starUpgrades["s_all"] = 100;

    const derived = derive(state, Date.now());
    for (const [key, value] of Object.entries(derived)) {
      if (typeof value === "number") {
        expect(Number.isFinite(value), `${key} went to ${value}`).toBe(true);
      }
    }
  });

  it("never lets a currency go negative", () => {
    const state = createGameState(0);
    addCurrency(state, "ribbons", 5);
    expect(levelSkill(state, "the_whole_shore").ok).toBe(false);
    expect(state.wallet.ribbons).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* The gift, across two saves                                          */
/* ------------------------------------------------------------------ */

describe("the gift handover", () => {
  it("moves from the giver's save to the receiver's, once", () => {
    // She changes the tide, which leaves something behind on her own save.
    const hers = rich("cami");
    hers.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(hers, 1_000);
    expect(hers.giftLeft).not.toBeNull();
    expect(hers.giftLeft!.from).toBe("cami");

    // He reads her save and picks it up.
    const his = rich("joseph");
    expect(his.giftWaiting).toBeNull();
    expect(receiveGift(his, hers, 2_000).ok).toBe(true);
    expect(his.giftWaiting).not.toBeNull();

    // Polling again must not hand over the same one a second time.
    collectGift(his, 2_000);
    expect(receiveGift(his, hers, 3_000).ok).toBe(false);
    expect(his.giftWaiting).toBeNull();
  });

  it("never hands you back your own gift", () => {
    const hers = rich("cami");
    hers.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(hers, 1_000);
    expect(receiveGift(hers, hers, 2_000).ok).toBe(false);
  });

  it("takes the newer gift after the next tide change", () => {
    const hers = rich("cami");
    const his = rich("joseph");

    hers.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(hers, 1_000);
    expect(receiveGift(his, hers, 2_000).ok).toBe(true);
    collectGift(his, 2_000);

    hers.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(hers, 60_000);
    expect(receiveGift(his, hers, 61_000).ok).toBe(true);
  });

  it("lets one go by if it was left too long ago", () => {
    const hers = rich("cami");
    hers.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(hers, 1_000);
    const his = rich("joseph");
    expect(receiveGift(his, hers, 1_000 + GIFT_WINDOW_MS + 1).ok).toBe(false);
  });

  it("shrugs at a partner who has never opened the jar", () => {
    const his = rich("joseph");
    expect(receiveGift(his, null, 0).ok).toBe(false);
    expect(receiveGift(his, {}, 0).ok).toBe(false);
    expect(his.giftWaiting).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* The depth chain                                                     */
/* ------------------------------------------------------------------ */




/* ------------------------------------------------------------------ */
/* The jar playing itself                                              */
/* ------------------------------------------------------------------ */

describe("automation", () => {
  it("taps for you from the very first run", () => {
    const state = createGameState(0);
    expect(state.auto.tap).toBe(true);
    for (let i = 1; i <= 60; i++) tick(state, 100, i * 100);
    expect(state.stats.totalClicks).toBeGreaterThan(0);
    expect(state.wallet.hearts).toBeGreaterThan(0);
  });

  it("stops when you switch it off", () => {
    const state = createGameState(0);
    state.auto.tap = false;
    for (let i = 1; i <= 60; i++) tick(state, 100, i * 100);
    expect(state.stats.totalClicks).toBe(0);
  });


  it("carries fractional taps rather than rounding them away", () => {
    const state = createGameState(0);
    // Ten ticks of 100ms at one tap a second is exactly one tap.
    for (let i = 1; i <= 10; i++) tick(state, 100, i * 100);
    expect(state.stats.totalClicks).toBe(1);
  });

  it("runs an autobuyer on its own clock, within its own share", () => {
    const state = rich();
    state.wallet.hearts = 1e6;
    state.autobuyers["upgrades"] = { on: true, max: true, threshold: 0.5, lastRunAt: 0 };

    runAutobuyers(state, 10_000);
    expect(state.stats.upgradesBought).toBeGreaterThan(0);
    // It was only ever allowed half, so at least half is still there.
    expect(state.wallet.hearts).toBeGreaterThan(4e5);
  });

  it("leaves a switched-off autobuyer alone", () => {
    const state = rich();
    state.wallet.hearts = 1e6;
    runAutobuyers(state, 10_000);
    expect(state.stats.upgradesBought).toBe(0);
    expect(state.wallet.hearts).toBe(1e6);
  });

  it("buys everything affordable and then stops", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e7;
    expect(buyAll(state).ok).toBe(true);
    expect(state.wallet.hearts).toBeGreaterThanOrEqual(0);
    expect(state.stats.upgradesBought).toBeGreaterThan(0);

    // Nothing left to buy is a refusal, not a crash.
    state.wallet.hearts = 0;
    expect(buyAll(state).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Sealing, and the shelf                                              */
/* ------------------------------------------------------------------ */

describe("sealing a jar", () => {
  it("refuses a jar that is not full", () => {
    const state = createGameState(0);
    state.wallet.hearts = 10;
    expect(canSeal(state, derive(state, 0))).toBe(false);
    expect(sealCurrentJar(state, 0).ok).toBe(false);
    expect(state.stats.jarsSealed).toBe(0);
  });

  // The property the whole loop rests on: sealing is not spending.
  it("moves the hearts onto the shelf rather than destroying them", () => {
    const state = createGameState(0);
    const capacity = derive(state, 0).jarCapacity;
    state.wallet.hearts = capacity;

    expect(sealCurrentJar(state, 1_000).ok).toBe(true);
    expect(state.wallet.hearts).toBe(0);
    expect(state.shelfHearts).toBe(capacity);
    expect(state.sealed).toHaveLength(1);
    expect(state.sealed[0].hearts).toBe(capacity);
    expect(state.stats.jarsSealed).toBe(1);
  });

  it("pays at least one ribbon, and more for a fuller jar", () => {
    const state = createGameState(0);
    const capacity = derive(state, 0).jarCapacity;

    state.wallet.hearts = capacity;
    sealCurrentJar(state, 0);
    const exact = state.wallet.ribbons;
    expect(exact).toBeGreaterThanOrEqual(1);

    const over = createGameState(0);
    over.wallet.hearts = capacity * 1000;
    sealCurrentJar(over, 0);
    expect(over.wallet.ribbons).toBeGreaterThan(exact);
  });

  // Logarithmic, not proportional. A thousand times the hearts must not be a
  // thousand times the ribbons, or the loop becomes a treadmill that speeds up.
  it("does not pay proportionally for overshooting", () => {
    const capacity = derive(createGameState(0), 0).jarCapacity;
    const small = ribbonGain(capacity, capacity);
    const huge = ribbonGain(capacity * 1e6, capacity);
    expect(huge).toBeGreaterThan(small);
    expect(huge).toBeLessThan(small * 20);
  });

  it("leaves nothing behind until an upgrade says so", () => {
    const state = createGameState(0);
    state.wallet.hearts = derive(state, 0).jarCapacity;
    sealCurrentJar(state, 0);
    expect(state.wallet.hearts).toBe(0);

    const kept = createGameState(0);
    kept.shelfUpgrades["sh_keep"] = 10;
    kept.wallet.hearts = derive(kept, 0).jarCapacity;
    sealCurrentJar(kept, 0);
    expect(kept.wallet.hearts).toBeGreaterThan(0);
  });

  it("pays a share of the shelf every second, forever", () => {
    const state = createGameState(0);
    state.shelfHearts = 1e6;
    const rate = derive(state, 0).shelfIncome;
    expect(rate).toBeCloseTo(1e6 * SHELF_RATE, 5);

    const before = state.wallet.hearts;
    tick(state, 1_000, 1_000);
    expect(state.wallet.hearts).toBeGreaterThan(before);
  });

  it("makes the shelf worth more than the jar it came from", () => {
    const empty = createGameState(0);
    const stocked = createGameState(0);
    stocked.shelfHearts = 1e9;
    expect(derive(stocked, 0).heartsPerSecond)
      .toBeGreaterThan(derive(empty, 0).heartsPerSecond);
  });

  it("buys the shelf tree with ribbons and refuses without them", () => {
    const state = createGameState(0);
    expect(buyShelfUpgrade(state, "sh_rate").ok).toBe(false);
    state.wallet.ribbons = 500;
    expect(buyShelfUpgrade(state, "sh_rate", 5).ok).toBe(true);
    expect(state.shelfUpgrades["sh_rate"]).toBe(5);
    expect(derive(state, 0).shelfRate).toBeGreaterThan(1);
  });
});

describe("time away", () => {
  it("pays the shelf in full and everything else at the offline rate", () => {
    const state = createGameState(0);
    state.shelfHearts = 1e6;
    state.lastSeenAt = 0;

    const report = computeOffline(state, 3_600_000);
    expect(report.hearts).toBeGreaterThan(0);
    // An hour of the shelf, at least, since the shelf is not discounted.
    expect(report.hearts).toBeGreaterThanOrEqual(1e6 * SHELF_RATE * 3600 * 0.99);

    claimOffline(state, report, 3_600_000);
    expect(state.wallet.hearts).toBeGreaterThan(0);
  });

  it("pays nothing for a clock that ran backwards", () => {
    const state = createGameState(0);
    state.shelfHearts = 1e9;
    state.lastSeenAt = 10_000_000;
    const report = computeOffline(state, 0);
    expect(report.clockSuspicious).toBe(true);
    expect(report.hearts).toBe(0);
  });
});
