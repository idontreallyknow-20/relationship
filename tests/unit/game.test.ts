import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NUMBER_CEILING, affordableLevels, bulkCost, formatNumber, safe, scale,
} from "@/game/numbers";
import { createGameState, migrateSave, SAVE_VERSION } from "@/game/state";
import { derive, hasFlag, heldHands, maxAffordable, upgradeCost } from "@/game/formulas";
import {
  activateSkill, addCurrency, checkAchievements, claimDailyBonus, claimOffline,
  collectSettled, computeOffline, dropSettled, earnHearts, metricTotal, performClick,
  skillReady, spawnDrifter, tapDrifter, tick, CHARGE_THRESHOLD,
} from "@/game/engine";
import {
  addCreature, applyLegacy, availableCreatures, buyMemory, buyResetUpgrade, buyUpgrade,
  canChangeTide, canChangeWater, changeTide, changeWater, claimMission, collectGift,
  craftItem, feedCreature, finishChallenge, giveItem, grantTogether, growCreature,
  buyAll, buyDepth, buyTide, canDeepen, deepen, leaveGift, levelSkill, moveTo,
  placeCreature, receiveGift, recordSameEvening, refreshMissions, respec,
  runAutobuyers, salvageItem, setWater, startChallenge, startTrip, unlockVessel,
  GIFT_WINDOW_MS,
} from "@/game/actions";
import { DEEPEN_REQUIREMENT, DEPTHS, depthCost, tideCost } from "@/game/config/depths";
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

/** The creature this person starts with, which is always in slot 0. */
function starterOf(state: GameState) {
  return Object.values(state.creatures)[0];
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
  it("starts each person with their own creature, in the jar", () => {
    const hers = createGameState(0, "cami");
    const his = createGameState(0, "joseph");
    expect(starterOf(hers).defId).toBe(STARTER.cami);
    expect(starterOf(his).defId).toBe(STARTER.joseph);
    expect(CREATURE_BY_ID[STARTER.cami]!.line).toBe("otter");
    expect(CREATURE_BY_ID[STARTER.joseph]!.line).toBe("crab");
    expect(hers.slots[0]).toBe(starterOf(hers).id);
    expect(hers.codex).toContain(STARTER.cami);
  });

  it("remembers whose save it is and opens in the first vessel", () => {
    const state = createGameState(0, "joseph");
    expect(state.owner).toBe("joseph");
    expect(state.vessel).toBe("jam_jar");
    expect(state.vesselsUnlocked).toEqual(["jam_jar"]);
  });
});

/* ------------------------------------------------------------------ */
/* Clicking, criticals, combos, charge                                 */
/* ------------------------------------------------------------------ */

describe("clicking", () => {
  const tap = (state: GameState, opts: Partial<Parameters<typeof performClick>[2]> = {}) =>
    performClick(state, derive(state, 1_000), {
      precision: 0, charge: 0, now: 1_000, x: 50, y: 50, ...opts,
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
        precision: 0, charge: 0, now: 1_000 + i * 50, x: 0, y: 0,
      }).hearts;
    }
    expect(state.combo).toBeGreaterThan(1);
    expect(last).toBeGreaterThan(tap(createGameState(0)).hearts);

    // Long enough away and the combo is gone.
    const broken = performClick(state, derive(state, 900_000), {
      precision: 0, charge: 0, now: 900_000, x: 0, y: 0,
    });
    expect(broken.comboBroken).toBe(true);
  });

  it("turns a charged tap into a shell on the floor worth five combo steps", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const quick = createGameState(0);
    const held = createGameState(0);
    tap(quick, { charge: 0 });
    const charged = tap(held, { charge: 1 });

    expect(charged.charged).toBe(true);
    expect(charged.dropped).not.toBeNull();
    expect(held.settled.length).toBe(1);
    expect(held.combo).toBeGreaterThan(quick.combo);
    expect(held.stats.chargedClicks).toBe(1);
  });

  it("treats anything below the threshold as an ordinary tap", () => {
    const state = createGameState(0);
    const outcome = tap(state, { charge: CHARGE_THRESHOLD - 0.01 });
    expect(outcome.charged).toBe(false);
    expect(state.settled.length).toBe(0);
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
    const opts = { precision: 0, charge: 0, now: 1_000, x: 0, y: 0 };
    expect(performClick(over, derive(over, 1_000), opts).hearts)
      .toBeGreaterThan(performClick(level, derive(level, 1_000), opts).hearts);
  });

  it("moves you between vessels you own and leaves the rest locked", () => {
    const state = rich();
    expect(moveTo(state, "mason_jar").ok).toBe(false);
    expect(unlockVessel(state, "mason_jar").ok).toBe(true);
    expect(moveTo(state, "mason_jar").ok).toBe(true);
    expect(state.vessel).toBe("mason_jar");
    expect(state.collections["vessels"]).toContain("mason_jar");
  });

  it("holds more in a bigger vessel", () => {
    const small = rich();
    const large = rich();
    unlockVessel(large, "mason_jar");
    moveTo(large, "mason_jar");
    expect(derive(large, 0).capacity).toBeGreaterThan(derive(small, 0).capacity);
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

  it("charges your own tree less than the other person's", () => {
    const hers = rich("cami");
    const his = rich("joseph");
    const otterUpgrade = UPGRADE_BY_ID["otter_hands"]!;
    expect(upgradeCost(hers, otterUpgrade, 1)).toBeLessThan(upgradeCost(his, otterUpgrade, 1));
  });

  it("gives your own tree more per level than the other person's", () => {
    const hers = rich("cami");
    const his = rich("joseph");
    buyUpgrade(hers, "otter_hands", 10);
    buyUpgrade(his, "otter_hands", 10);
    expect(derive(hers, 0).heartsPerClick).toBeGreaterThan(derive(his, 0).heartsPerClick);
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

  it("only buys in handfuls once the moon upgrade is bought", () => {
    const state = rich();
    delete state.moonUpgrades["m_bulk"];
    expect(buyUpgrade(state, "otter_hands", 10).ok).toBe(false);
    state.moonUpgrades["m_bulk"] = 1;
    expect(buyUpgrade(state, "otter_hands", 10).ok).toBe(true);
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

  it("keeps a creature out of water that cannot hold it", () => {
    const state = rich("cami");
    const deep = availableCreatures(state).find(
      (entry) => (CREATURE_BY_ID[entry.defId]!.needsDepth ?? 0) > 0.5,
    );
    expect(deep).toBeDefined();
    addCreature(state, deep!.defId, 0);
    const creature = Object.values(state.creatures).find((c) => c.defId === deep!.defId)!;
    // The starting jam jar is far too shallow for it.
    expect(placeCreature(state, 0, creature.id).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Rocks and shells                                                    */
/* ------------------------------------------------------------------ */

describe("rocks and shells", () => {
  it("makes one, gives it to a creature, and makes that creature stronger", () => {
    const state = rich("cami");
    state.moonUpgrades["m_items"] = 1;
    const made = craftItem(state, "rock", "plain");
    expect(made.ok).toBe(true);
    expect(state.stats.itemsMade).toBe(1);

    // Affixes are rolled, so pin one down to make the effect measurable.
    state.items[made.item!.id].affixes = [{ kind: "mul", stat: "crackValue", value: 0.5 }];

    const creature = starterOf(state);
    const before = derive(state, 0).heartsPerSecond;
    expect(giveItem(state, creature.id, made.item!.id).ok).toBe(true);
    expect(creature.itemId).toBe(made.item!.id);
    expect(derive(state, 0).heartsPerSecond).toBeGreaterThan(before);
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
    state.wallet.glass = 0;
    expect(salvageItem(state, made.item!.id).ok).toBe(true);
    expect(state.wallet.glass).toBeGreaterThan(0);
    expect(state.items[made.item!.id]).toBeUndefined();
    expect(creature.itemId).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The loop: otters crack, things sink, crabs collect                  */
/* ------------------------------------------------------------------ */

describe("the loop", () => {
  it("sinks what is in the water toward the floor", () => {
    const state = rich("cami");
    const startedAt = dropSettled(state, "shell", 100, 50).y;
    tick(state, 1_000, 1_000);
    expect(state.settled[0].y).toBeGreaterThan(startedAt);
    // And it stops at the floor rather than sinking through it.
    for (let i = 0; i < 50; i++) tick(state, 1_000, 2_000 + i * 1_000);
    expect(state.settled.every((s) => s.y <= 1)).toBe(true);
  });

  it("pays hearts and currency when something is collected", () => {
    const state = rich("cami");
    state.wallet.hearts = 0;
    state.wallet.shells = 0;
    const item = dropSettled(state, "shell", 1_000, 50, 0.9);
    const result = collectSettled(state, derive(state, 0), item.id, true);
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("shells");
    expect(state.wallet.hearts).toBeGreaterThan(0);
    expect(state.wallet.shells).toBeGreaterThan(0);
    expect(state.settled.length).toBe(0);
    expect(state.stats.collects).toBe(1);
  });

  it("has otters crack and crabs pick up over a long enough tick", () => {
    const state = rich("cami");
    state.moonUpgrades["m_slots"] = 4;
    addCreature(state, "shore_crab", 0);
    const crab = Object.values(state.creatures).find((c) => c.defId === "shore_crab")!;
    placeCreature(state, 1, crab.id);

    let cracked = 0;
    let collected = 0;
    for (let i = 1; i <= 400; i++) {
      const result = tick(state, 250, i * 250);
      cracked += result.cracked;
      collected += result.collected;
    }
    expect(cracked).toBeGreaterThan(0);
    expect(collected).toBeGreaterThan(0);
    expect(state.stats.cracks).toBe(cracked);
  });

  it("ignores a tick that goes backwards or jumps absurdly", () => {
    const state = rich("cami");
    const before = state.wallet.hearts;
    tick(state, -50_000, 0);
    expect(state.wallet.hearts).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* Drifters                                                            */
/* ------------------------------------------------------------------ */

describe("drifters", () => {
  it("takes several taps to open and then pays out", () => {
    const state = rich("cami");
    const drifter = spawnDrifter(state, 0, "clam");
    expect(drifter).not.toBeNull();
    expect(spawnDrifter(state, 0, "clam")).toBeNull(); // only one at a time

    let opened = false;
    for (let i = 0; i < 200 && !opened; i++) {
      const hit = tapDrifter(state, derive(state, 0));
      opened = Boolean(hit?.opened);
    }
    expect(opened).toBe(true);
    expect(state.drifter).toBeNull();
    expect(state.stats.driftersOpened).toBe(1);
  });
});

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
    expect(startChallenge(state, "charge_only", 0).ok).toBe(false);

    state.moonUpgrades["m_challenges"] = 1;
    const upgradesBefore = { ...state.upgrades };
    expect(startChallenge(state, "charge_only", 0).ok).toBe(true);
    expect(state.upgrades).toEqual({});
    expect(state.wallet.hearts).toBe(0);

    finishChallenge(state, 1_000, true);
    expect(state.upgrades).toEqual(upgradesBefore);
    expect(state.activeChallenge).toBeNull();
  });

  it("pays out and records a best when the goal is met", () => {
    const state = rich();
    state.moonUpgrades["m_challenges"] = 1;
    startChallenge(state, "charge_only", 0);
    state.activeChallenge!.score = Number.MAX_SAFE_INTEGER;
    const outcome = finishChallenge(state, 1_000);
    expect(outcome.cleared).toBe(true);
    expect(outcome.first).toBe(true);
    expect(state.challenges["charge_only"].completed).toBe(1);
    expect(state.stats.challengesCompleted).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* The two of you                                                      */
/* ------------------------------------------------------------------ */

describe("together", () => {
  it("pays tide for using the rest of the app, capped per day", () => {
    const state = rich();
    state.wallet.tide = 0;
    expect(grantTogether(state, "question_answered", "2026-07-28", 0).ok).toBe(true);
    expect(state.wallet.tide).toBeGreaterThan(0);
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
        precision: 0.5, charge: 0, now: i * 100, x: 0, y: 0,
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
    expect(state.vessel).toBe("jam_jar");
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
    expect(state.vesselsUnlocked).toEqual(["jam_jar"]);
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
  it("pays once a day and builds a streak", () => {
    const state = rich();
    const first = claimDailyBonus(state, "2026-07-28");
    expect(first).not.toBeNull();
    expect(first!.streak).toBe(1);
    expect(claimDailyBonus(state, "2026-07-28")).toBeNull();

    const second = claimDailyBonus(state, "2026-07-29");
    expect(second!.streak).toBe(2);
  });

  it("never overflows the jar it drops into", () => {
    const state = createGameState(0);
    claimDailyBonus(state, "2026-07-28");
    expect(state.wallet.hearts).toBeLessThanOrEqual(derive(state, 0).capacity);
  });
});

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

describe("metrics", () => {
  it("adds up across a run and feeds missions and achievements alike", () => {
    const state = rich();
    const before = metricTotal(state, "clicks");
    performClick(state, derive(state, 0), { precision: 0, charge: 0, now: 0, x: 0, y: 0 });
    expect(metricTotal(state, "clicks")).toBeGreaterThan(before);
  });
});

/* ------------------------------------------------------------------ */
/* Migration from the old save                                         */
/* ------------------------------------------------------------------ */

describe("migration", () => {
  it("carries an old save forward without losing anything", () => {
    const old = {
      version: 3,
      wallet: { hearts: 5_000, sparks: 40, tokens: 12, treats: 30 },
      lifetime: { hearts: 900_000 },
      upgrades: { old_click_power: 10, old_passive: 15 },
      pets: { a: {}, b: {} },
      charms: { c: {} },
      worldsUnlocked: ["bedroom", "rose_garden"],
      world: "rose_garden",
      rebirths: 4,
      ascensions: 1,
      stats: { totalClicks: 12_345 },
      collections: { skins: ["founding"] },
    };

    const state = migrateSave(old, "joseph");
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.owner).toBe("joseph");
    expect(state.wallet.hearts).toBeGreaterThan(5_000); // plus the upgrade refund
    expect(state.lifetime.hearts).toBe(900_000);
    expect(state.tideChanges).toBe(4);
    expect(state.newWaters).toBe(1);
    expect(state.stats.totalClicks).toBe(12_345);
    expect(state.upgrades).toEqual({});
    // Pets and charms came back as the currencies that replaced them.
    expect(state.wallet.shells).toBeGreaterThan(0);
    expect(state.wallet.glass).toBeGreaterThan(0);
    // And they still have a creature to play with.
    expect(Object.keys(state.creatures).length).toBeGreaterThan(0);
    expect(starterOf(state).defId).toBe(STARTER.joseph);
  });

  it("maps old worlds onto the vessels that replaced them", () => {
    const state = migrateSave(
      { version: 3, worldsUnlocked: ["bedroom", "rose_garden"], world: "rose_garden" },
      "cami",
    );
    expect(state.vesselsUnlocked).toContain("jam_jar");
    expect(state.vesselsUnlocked.length).toBeGreaterThan(1);
    expect(state.vesselsUnlocked).toContain(state.vessel);
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
    current.vesselsUnlocked = ["jam_jar", "mason_jar"];
    current.vessel = "mason_jar";
    const state = migrateSave(JSON.parse(JSON.stringify(current)), "cami");
    expect(state.upgrades["otter_hands"]).toBe(7);
    expect(state.vessel).toBe("mason_jar");
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
    addCurrency(state, "pearls", 5);
    expect(levelSkill(state, "the_whole_shore").ok).toBe(false);
    expect(state.wallet.pearls).toBe(5);
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

describe("water", () => {
  it("can be changed to one you have and not to one you do not", () => {
    const state = rich("cami");
    expect(state.water).toBe("default");
    expect(setWater(state, "her_purple").ok).toBe(true);
    expect(state.water).toBe("her_purple");
    expect(setWater(state, "moonstone").ok).toBe(false);
    expect(state.water).toBe("her_purple");
  });

  it("survives a tide change and a save round trip", () => {
    const state = rich("cami");
    setWater(state, "her_pink");
    state.runHearts = TIDE_REQUIREMENT * 100;
    changeTide(state, 1_000);
    expect(state.water).toBe("her_pink");

    const reloaded = migrateSave(JSON.parse(JSON.stringify(state)), "cami");
    expect(reloaded.water).toBe("her_pink");
  });

  it("gives an old save the plain water rather than undefined", () => {
    const state = migrateSave({ version: 3 }, "cami");
    expect(state.water).toBe("default");
  });
});

/* ------------------------------------------------------------------ */
/* The depth chain                                                     */
/* ------------------------------------------------------------------ */

describe("the depth chain", () => {
  it("cascades downward, each depth feeding the one above it", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e9;
    state.depths[2].unlocked = true;
    expect(buyDepth(state, 2, 10).ok).toBe(true);
    expect(state.depths[2].owned).toBe(10);
    expect(state.depths[1].owned).toBe(0);

    for (let i = 1; i <= 100; i++) tick(state, 100, i * 100);

    // Kelp made crabs, crabs made otters, otters made hearts.
    expect(state.depths[1].owned).toBeGreaterThan(0);
    expect(state.depths[0].owned).toBeGreaterThan(0);
    expect(state.stats.heartsFromPassive).toBeGreaterThan(0);
    // Nothing bought itself: only production moved.
    expect(state.depths[1].bought).toBe(0);
  });

  it("charges more for each one bought and nothing for what is produced", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e9;
    const first = depthCost(DEPTHS[0], 0);
    buyDepth(state, 0, 1);
    expect(depthCost(DEPTHS[0], state.depths[0].bought)).toBeGreaterThan(first);

    // Production raises `owned` without touching the price.
    const priced = depthCost(DEPTHS[0], state.depths[0].bought);
    state.depths[1].owned = 100;
    for (let i = 1; i <= 50; i++) tick(state, 100, i * 100);
    expect(state.depths[0].owned).toBeGreaterThan(1);
    expect(depthCost(DEPTHS[0], state.depths[0].bought)).toBe(priced);
  });

  it("refuses a depth the jar has not reached", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e30;
    expect(state.depths[4].unlocked).toBe(false);
    expect(buyDepth(state, 4, 1).ok).toBe(false);
    expect(state.depths[4].owned).toBe(0);
  });

  it("never spends more than it has", () => {
    const state = createGameState(0);
    state.wallet.hearts = 25;
    buyDepth(state, 0, "max");
    expect(state.wallet.hearts).toBeGreaterThanOrEqual(0);
  });
});

describe("deepening", () => {
  it("needs a count rather than a wait, then resets the chain and pays forever", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e12;
    expect(canDeepen(state)).toBe(false);

    buyDepth(state, 1, DEEPEN_REQUIREMENT);
    expect(canDeepen(state)).toBe(true);

    const before = derive(state, 0).depthPower;
    expect(deepen(state).ok).toBe(true);

    expect(state.deepens).toBe(1);
    expect(state.depths[0].owned).toBe(0);
    expect(state.depths[1].bought).toBe(0);
    expect(state.wallet.hearts).toBe(0);
    expect(derive(state, 0).depthPower).toBeGreaterThan(before);
    // And it opened the next one down.
    expect(state.depths[2].unlocked).toBe(true);
  });

  it("keeps everything that is not the chain", () => {
    const state = rich();
    buyUpgrade(state, "otter_hands", 5);
    const creatures = Object.keys(state.creatures).length;
    const lifetime = state.lifetime.hearts;
    buyDepth(state, 1, DEEPEN_REQUIREMENT);
    deepen(state);
    expect(state.upgrades["otter_hands"]).toBe(5);
    expect(Object.keys(state.creatures).length).toBe(creatures);
    expect(state.lifetime.hearts).toBe(lifetime);
  });
});

describe("tide as speed", () => {
  it("makes every depth faster and costs more each time", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e12;
    buyDepth(state, 0, 10);
    const before = derive(state, 0).heartsPerSecond;

    const firstCost = tideCost(0);
    buyTide(state, 50);
    expect(tideCost(state.tideBought)).toBeGreaterThan(firstCost);
    expect(derive(state, 0).heartsPerSecond).toBeGreaterThan(before);
    expect(derive(state, 0).tideSpeedMultiplier).toBeGreaterThan(1);
  });
});

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

  it("only charges once something has taught it to", () => {
    const state = createGameState(0);
    state.auto.hold = true;
    for (let i = 1; i <= 60; i++) tick(state, 100, i * 100);
    // Base charge ratio is zero, so no charged taps yet.
    expect(state.stats.chargedClicks).toBe(0);

    const taught = createGameState(0);
    taught.auto.hold = true;
    taught.moonUpgrades["m_auto_hold"] = 10;
    for (let i = 1; i <= 200; i++) tick(taught, 100, i * 100);
    expect(derive(taught, 0).autoChargeRatio).toBeGreaterThan(0);
  });

  it("carries fractional taps rather than rounding them away", () => {
    const state = createGameState(0);
    // Ten ticks of 100ms at one tap a second is exactly one tap.
    for (let i = 1; i <= 10; i++) tick(state, 100, i * 100);
    expect(state.stats.totalClicks).toBe(1);
  });

  it("runs an autobuyer on its own clock, within its own share", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e6;
    state.autobuyers["otters"] = { on: true, max: true, threshold: 0.5, lastRunAt: 0 };

    runAutobuyers(state, 10_000);
    expect(state.depths[0].bought).toBeGreaterThan(0);
    // It was only ever allowed half, so at least half is still there.
    expect(state.wallet.hearts).toBeGreaterThan(4e5);
  });

  it("leaves a switched-off autobuyer alone", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e6;
    runAutobuyers(state, 10_000);
    expect(state.depths[0].bought).toBe(0);
    expect(state.wallet.hearts).toBe(1e6);
  });

  it("buys everything affordable and then stops", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e7;
    expect(buyAll(state).ok).toBe(true);
    expect(state.wallet.hearts).toBeGreaterThanOrEqual(0);
    expect(state.depths[0].bought).toBeGreaterThan(0);

    // Nothing left to buy is a refusal, not a crash.
    state.wallet.hearts = 0;
    expect(buyAll(state).ok).toBe(false);
  });
});

describe("time away", () => {
  it("grows the chain while the app is shut, not just the hearts", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e12;
    state.depths[2].unlocked = true;
    buyDepth(state, 2, 20);
    state.lastSeenAt = 0;

    const report = computeOffline(state, 3_600_000);
    expect(report.depths[1]).toBeGreaterThan(0);
    expect(report.depths[0]).toBeGreaterThan(0);
    expect(report.hearts).toBeGreaterThan(0);

    claimOffline(state, report, 3_600_000);
    expect(state.depths[0].owned).toBeGreaterThan(0);
  });
});
