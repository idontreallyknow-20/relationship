import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NUMBER_CEILING, affordableLevels, bulkCost, formatNumber, safe, scale,
} from "@/game/numbers";
import { createGameState, migrateSave, SAVE_VERSION } from "@/game/state";
import { derive, hasFlag, maxAffordable, upgradeCost } from "@/game/formulas";
import {
  addCurrency, checkAchievements, claimDailyBonus, collectFloating, computeOffline,
  claimOffline, earnHearts, metricTotal, performClick, spawnFloating, tick,
  activateSkill,
} from "@/game/engine";
import {
  applyLegacy, buyResetUpgrade, buyUpgrade, canAscend, canRebirth, claimMission,
  craftCharm, doAscend, doRebirth, equipPet, evolvePet, feedPet, fusePets,
  grantPartnerReward, openEgg, rebirthPreview, refreshMissions, startBoss,
  startChallenge, finishChallenge, buyShopItem, unlockWorld,
} from "@/game/actions";
import { UPGRADE_BY_ID } from "@/game/config/upgrades";
import { REBIRTH_REQUIREMENT } from "@/game/config/resets";
import type { GameState } from "@/game/types";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A save with enough currency to exercise a system, without playing to it. */
function rich(overrides: Partial<GameState> = {}): GameState {
  const state = createGameState(1_000_000);
  for (const key of Object.keys(state.wallet) as (keyof typeof state.wallet)[]) {
    state.wallet[key] = 1e12;
    state.lifetime[key] = 1e12;
  }
  return Object.assign(state, overrides);
}

/* ------------------------------------------------------------------ */
/* 35. Large number stability                                          */
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
/* 1-3. Clicking, criticals, combos                                    */
/* ------------------------------------------------------------------ */

describe("clicking", () => {
  it("pays hearts and records the tap", () => {
    const state = createGameState(0);
    const outcome = performClick(state, derive(state, 1_000), {
      precision: 0, charge: 0, now: 1_000, x: 50, y: 50,
    });
    expect(outcome.hearts).toBeGreaterThan(0);
    expect(state.wallet.hearts).toBe(outcome.hearts);
    expect(state.stats.totalClicks).toBe(1);
    expect(state.lifetime.hearts).toBe(outcome.hearts);
  });

  it("pays more for a perfectly timed tap", () => {
    const a = createGameState(0);
    const b = createGameState(0);
    vi.spyOn(Math, "random").mockReturnValue(0.99); // never crit
    const loose = performClick(a, derive(a, 1_000), { precision: 0, charge: 0, now: 1_000, x: 0, y: 0 });
    const tight = performClick(b, derive(b, 1_000), { precision: 1, charge: 0, now: 1_000, x: 0, y: 0 });
    expect(tight.hearts).toBeGreaterThan(loose.hearts);
    expect(tight.perfect).toBe(true);
    expect(loose.perfect).toBe(false);
  });

  it("pays more for a charged tap", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const a = createGameState(0);
    const b = createGameState(0);
    const quick = performClick(a, derive(a, 1_000), { precision: 0, charge: 0, now: 1_000, x: 0, y: 0 });
    const held = performClick(b, derive(b, 1_000), { precision: 0, charge: 1, now: 1_000, x: 0, y: 0 });
    expect(held.hearts).toBeGreaterThan(quick.hearts);
  });

  it("criticals multiply the payout and are counted", () => {
    const state = createGameState(0);
    state.upgrades["critical_chance"] = 40; // pushes crit chance high
    vi.spyOn(Math, "random").mockReturnValue(0); // always crit, never mega
    const outcome = performClick(state, derive(state, 1_000), {
      precision: 0, charge: 0, now: 1_000, x: 0, y: 0,
    });
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
    for (let i = 0; i < 10; i++) {
      const outcome = performClick(state, derive(state, 1_000 + i), {
        precision: 0, charge: 0, now: 1_000 + i, x: 0, y: 0,
      });
      last = outcome.hearts;
    }
    expect(state.combo).toBe(10);
    expect(state.stats.bestCombo).toBe(10);
    expect(last).toBeGreaterThan(1);

    // Far past the combo window: the next tick breaks it.
    const result = tick(state, 100, 1_000 + 60_000);
    expect(result.comboBroken).toBe(true);
    expect(state.combo).toBe(0);
  });

  it("caps the combo at the derived maximum", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const state = createGameState(0);
    const cap = derive(state, 0).comboCap;
    for (let i = 0; i < cap + 40; i++) {
      performClick(state, derive(state, 1_000 + i), {
        precision: 0, charge: 0, now: 1_000 + i, x: 0, y: 0,
      });
    }
    expect(state.combo).toBe(cap);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Skills and cooldowns                                             */
/* ------------------------------------------------------------------ */

describe("abilities", () => {
  it("refuses an ability that has not been learned", () => {
    const state = createGameState(0);
    expect(activateSkill(state, "heart_storm", 1_000).ok).toBe(false);
  });

  it("applies a buff and then blocks until the cooldown passes", () => {
    const state = createGameState(0);
    state.skills["heart_storm"].level = 1;
    const first = activateSkill(state, "heart_storm", 1_000);
    expect(first.ok).toBe(true);
    expect(state.buffs.length).toBe(1);
    expect(derive(state, 1_000).globalMultiplier).toBeGreaterThan(1);

    expect(activateSkill(state, "heart_storm", 2_000).ok).toBe(false);
    expect(activateSkill(state, "heart_storm", 1_000 + 130_000).ok).toBe(true);
  });

  it("expires the buff once its duration is up", () => {
    const state = createGameState(0);
    state.skills["heart_storm"].level = 1;
    activateSkill(state, "heart_storm", 1_000);
    tick(state, 100, 1_000 + 60_000);
    expect(state.buffs.length).toBe(0);
  });

  it("fires an instant ability without leaving a buff behind", () => {
    const state = rich();
    state.upgrades["passive_hearts"] = 20;
    state.skills["jar_overflow"].level = 1;
    const before = state.wallet.hearts;
    const result = activateSkill(state, "jar_overflow", 5_000);
    expect(result.ok).toBe(true);
    expect(result.instantHearts).toBeGreaterThan(0);
    expect(state.wallet.hearts).toBeGreaterThan(before);
    expect(state.buffs.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 5-6. Upgrade purchasing, bulk purchasing                            */
/* ------------------------------------------------------------------ */

describe("upgrades", () => {
  it("buys one level and charges for it", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1_000;
    const def = UPGRADE_BY_ID["stronger_heart"];
    const cost = upgradeCost(state, def, 1);
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no free upgrade roll
    expect(buyUpgrade(state, "stronger_heart", 1).ok).toBe(true);
    expect(state.upgrades["stronger_heart"]).toBe(1);
    expect(state.wallet.hearts).toBeCloseTo(1_000 - cost, 6);
    expect(state.stats.upgradesBought).toBe(1);
  });

  it("raises hearts per click", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e6;
    const before = derive(state, 0).heartsPerClick;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    buyUpgrade(state, "stronger_heart", 1);
    expect(derive(state, 0).heartsPerClick).toBeGreaterThan(before);
  });

  it("refuses to buy without enough currency", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1;
    const result = buyUpgrade(state, "stronger_heart", 1);
    expect(result.ok).toBe(false);
    expect(state.upgrades["stronger_heart"]).toBeUndefined();
  });

  it("refuses a locked upgrade", () => {
    const state = createGameState(0);
    state.wallet.hearts = 1e30;
    expect(buyUpgrade(state, "infinite_affection", 1).ok).toBe(false);
  });

  it("requires the bulk rebirth upgrade before buying more than one", () => {
    const state = rich();
    expect(buyUpgrade(state, "stronger_heart", 10).ok).toBe(false);
    state.rebirthUpgrades["rb_bulk"] = 1;
    expect(hasFlag(state, "bulk")).toBe(true);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(buyUpgrade(state, "stronger_heart", 10).ok).toBe(true);
    expect(state.upgrades["stronger_heart"]).toBe(10);
  });

  it("charges the geometric total for a bulk purchase", () => {
    const state = rich();
    state.rebirthUpgrades["rb_bulk"] = 1;
    state.wallet.hearts = 1e9;
    const def = UPGRADE_BY_ID["stronger_heart"];
    const expected = upgradeCost(state, def, 10);
    const before = state.wallet.hearts;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    buyUpgrade(state, "stronger_heart", 10);
    expect(before - state.wallet.hearts).toBeCloseTo(expected, 4);
  });

  it("never buys past a maximum level", () => {
    const state = rich();
    state.rebirthUpgrades["rb_bulk"] = 1;
    const def = UPGRADE_BY_ID["rhythm_power"];
    state.upgrades["rhythm_power"] = def.max - 1;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    buyUpgrade(state, "rhythm_power", 100);
    expect(state.upgrades["rhythm_power"]).toBe(def.max);
    expect(buyUpgrade(state, "rhythm_power", 1).ok).toBe(false);
  });

  it("reports max affordable honestly", () => {
    const state = createGameState(0);
    state.wallet.hearts = 15; // exactly one level of stronger_heart at 15
    expect(maxAffordable(state, UPGRADE_BY_ID["stronger_heart"])).toBe(1);
    state.wallet.hearts = 14;
    expect(maxAffordable(state, UPGRADE_BY_ID["stronger_heart"])).toBe(0);
  });

  it("never lets discounts reach a free purchase", () => {
    const state = rich();
    state.upgrades["upgrade_cost_reduction"] = 1_000;
    state.rebirthUpgrades["rb_cost"] = 1_000;
    expect(derive(state, 0).costMultiplier).toBeGreaterThan(0);
    expect(upgradeCost(state, UPGRADE_BY_ID["stronger_heart"], 1)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* 7-8, 36. Offline earnings and device clock                          */
/* ------------------------------------------------------------------ */

describe("offline earnings", () => {
  function producer(): GameState {
    const state = createGameState(0);
    state.upgrades["passive_hearts"] = 20;
    return state;
  }

  it("pays for time away, at a lower rate than playing", () => {
    const state = producer();
    state.lastSeenAt = 0;
    const hour = 3_600_000;
    const report = computeOffline(state, hour);
    const derived = derive(state, hour);
    expect(report.hearts).toBeGreaterThan(0);
    expect(report.hearts).toBeLessThan(derived.heartsPerSecond * 3_600);
  });

  it("caps at the offline window", () => {
    const state = producer();
    state.lastSeenAt = 0;
    const derived = derive(state, 0);
    const week = 7 * 24 * 3_600_000;
    const report = computeOffline(state, week);
    expect(report.cappedByWindow).toBe(true);
    expect(report.countedMs).toBe(derived.offlineHours * 3_600_000);
  });

  it("ignores a clock that moved backwards", () => {
    const state = producer();
    state.lastSeenAt = 10_000_000;
    const report = computeOffline(state, 1_000_000);
    expect(report.clockSuspicious).toBe(true);
    expect(report.hearts).toBe(0);
  });

  it("gives nothing for a very short absence", () => {
    const state = producer();
    state.lastSeenAt = 0;
    expect(computeOffline(state, 30_000).hearts).toBe(0);
  });

  it("credits the claim to the offline breakdown once", () => {
    const state = producer();
    state.lastSeenAt = 0;
    const now = 3_600_000;
    const report = computeOffline(state, now);
    claimOffline(state, report, now);
    expect(state.stats.heartsFromOffline).toBeCloseTo(report.hearts, 4);
    expect(state.lastSeenAt).toBe(now);
    // A second call with the same instant now finds nothing to pay.
    expect(computeOffline(state, now).hearts).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 10-14. Pets                                                         */
/* ------------------------------------------------------------------ */

describe("pets", () => {
  it("opens an egg, adds the pet and records the codex entry", () => {
    const state = rich();
    state.eggs["basic"] = 1;
    const result = openEgg(state, "basic", 1_000);
    expect(result.ok).toBe(true);
    expect(Object.keys(state.pets).length).toBe(1);
    expect(state.petCodex.length).toBe(1);
    expect(state.stats.eggsOpened).toBe(1);
    expect(state.eggs["basic"]).toBe(0);
  });

  it("refuses to open an egg you do not have", () => {
    const state = rich();
    expect(openEgg(state, "basic", 1_000).ok).toBe(false);
  });

  it("converts a duplicate into treats rather than wasting it", () => {
    const state = rich();
    state.eggs["basic"] = 2;
    openEgg(state, "basic", 1_000);
    const only = Object.values(state.pets)[0];
    // Force the second draw to be the same pet.
    state.eggs["basic"] = 1;
    const before = state.wallet.treats;
    const second = openEgg(state, "basic", 2_000);
    if (second.pet && second.pet.defId === only.defId) {
      expect(state.wallet.treats).toBeGreaterThan(before);
      expect(second.duplicate).toBe(true);
    }
  });

  it("levels a pet by feeding it", () => {
    const state = rich();
    state.eggs["basic"] = 1;
    const { pet } = openEgg(state, "basic", 1_000);
    const id = pet!.id;
    for (let i = 0; i < 10; i++) feedPet(state, id);
    expect(state.pets[id].level).toBeGreaterThan(1);
    expect(state.pets[id].happiness).toBe(100);
  });

  it("evolves only once the requirements are met", () => {
    const state = rich();
    state.eggs["basic"] = 1;
    const { pet } = openEgg(state, "basic", 1_000);
    const id = pet!.id;
    state.pets[id].defId = "heart_puppy";
    state.pets[id].level = 1;
    expect(evolvePet(state, id).ok).toBe(false);
    state.pets[id].level = 30;
    expect(evolvePet(state, id).ok).toBe(true);
    expect(state.pets[id].defId).toBe("heart_dog");
    expect(state.stats.petsEvolved).toBe(1);
  });

  it("fuses two pets into one starred pet", () => {
    const state = rich();
    state.eggs["basic"] = 2;
    const a = openEgg(state, "basic", 1_000).pet!;
    const b = openEgg(state, "basic", 2_000).pet!;
    state.pets[a.id].defId = "heart_puppy";
    state.pets[b.id].defId = "love_cat";
    expect(fusePets(state, a.id, b.id).ok).toBe(true);
    expect(state.pets[a.id].stars).toBe(1);
    expect(state.pets[b.id]).toBeUndefined();
    expect(state.stats.petsFused).toBe(1);
  });

  it("will not fuse away a locked pet", () => {
    const state = rich();
    state.eggs["basic"] = 2;
    const a = openEgg(state, "basic", 1_000).pet!;
    const b = openEgg(state, "basic", 2_000).pet!;
    state.pets[b.id].locked = true;
    expect(fusePets(state, a.id, b.id).ok).toBe(false);
    expect(state.pets[b.id]).toBeDefined();
  });

  it("makes an equipped pet change the derived numbers", () => {
    const state = rich();
    state.eggs["basic"] = 1;
    const pet = openEgg(state, "basic", 1_000).pet!;
    state.pets[pet.id].defId = "heart_puppy";
    state.pets[pet.id].level = 40;
    const before = derive(state, 0).heartsPerClick;
    equipPet(state, 0, pet.id);
    expect(derive(state, 0).heartsPerClick).toBeGreaterThan(before);
  });
});

/* ------------------------------------------------------------------ */
/* 15. Charms                                                          */
/* ------------------------------------------------------------------ */

describe("charms", () => {
  it("needs the rebirth unlock before crafting", () => {
    const state = rich();
    expect(craftCharm(state, "jar", "common").ok).toBe(false);
    state.rebirthUpgrades["rb_charms"] = 1;
    const result = craftCharm(state, "jar", "common");
    expect(result.ok).toBe(true);
    expect(result.charm!.affixes.length).toBeGreaterThan(0);
    expect(state.stats.charmsCrafted).toBe(1);
  });

  it("rolls more affixes at higher rarity", () => {
    const state = rich();
    state.rebirthUpgrades["rb_charms"] = 1;
    const common = craftCharm(state, "jar", "common").charm!;
    const legendary = craftCharm(state, "jar", "legendary").charm!;
    expect(legendary.affixes.length).toBeGreaterThan(common.affixes.length);
  });
});

/* ------------------------------------------------------------------ */
/* 16-21. Rebirth and ascension                                        */
/* ------------------------------------------------------------------ */

describe("rebirth", () => {
  function ready(): GameState {
    const state = rich();
    state.runHearts = REBIRTH_REQUIREMENT * 8;
    state.upgrades["stronger_heart"] = 40;
    state.upgrades["passive_hearts"] = 25;
    state.runStartedAt = Date.now() - 3_600_000;
    return state;
  }

  it("refuses before the requirement is met", () => {
    const state = rich();
    state.runHearts = 10;
    expect(canRebirth(state)).toBe(false);
    expect(doRebirth(state, Date.now()).ok).toBe(false);
  });

  it("pays tokens that scale with the run", () => {
    const small = ready();
    small.runHearts = REBIRTH_REQUIREMENT;
    const big = ready();
    big.runHearts = REBIRTH_REQUIREMENT * 1000;
    expect(rebirthPreview(big)).toBeGreaterThan(rebirthPreview(small));
  });

  it("resets the run and keeps everything permanent", () => {
    const state = ready();
    state.eggs["basic"] = 1;
    const pet = openEgg(state, "basic", 1_000).pet!;
    state.stats.bestCombo = 120;
    const lifetimeBefore = state.lifetime.hearts;
    const tokens = rebirthPreview(state);

    expect(doRebirth(state, Date.now()).ok).toBe(true);

    expect(state.rebirths).toBe(1);
    expect(state.wallet.tokens).toBeGreaterThanOrEqual(tokens);
    expect(state.runHearts).toBe(0);
    expect(state.wallet.hearts).toBe(0);
    expect(state.upgrades["stronger_heart"]).toBeUndefined();
    // Kept.
    expect(state.lifetime.hearts).toBe(lifetimeBefore);
    expect(state.pets[pet.id]).toBeDefined();
    expect(state.stats.bestCombo).toBe(120);
    expect(state.world).toBe("bedroom");
  });

  it("keeps some upgrade levels when the retention upgrade is owned", () => {
    const state = ready();
    state.rebirthUpgrades["rb_free_upgrades"] = 5;
    doRebirth(state, Date.now());
    expect(state.upgrades["stronger_heart"]).toBe(5);
    expect(state.upgrades["passive_hearts"]).toBe(5);
  });

  it("records the fastest rebirth", () => {
    const state = ready();
    state.runStartedAt = 1_000;
    doRebirth(state, 61_000);
    expect(state.stats.fastestRebirthMs).toBe(60_000);
  });

  it("buys rebirth upgrades and applies them permanently", () => {
    const state = rich();
    expect(buyResetUpgrade(state, "rb_click").ok).toBe(true);
    expect(state.rebirthUpgrades["rb_click"]).toBe(1);
    const boosted = derive(state, 0).heartsPerClick;
    const plain = derive(createGameState(0), 0).heartsPerClick;
    expect(boosted).toBeGreaterThan(plain);
  });

  it("enforces prerequisites in the rebirth tree", () => {
    const state = rich();
    expect(buyResetUpgrade(state, "rb_ascension").ok).toBe(false);
    state.rebirthUpgrades["rb_all"] = 20;
    expect(buyResetUpgrade(state, "rb_ascension").ok).toBe(true);
  });
});

describe("ascension", () => {
  function ready(): GameState {
    const state = rich();
    state.rebirthUpgrades["rb_ascension"] = 1;
    state.eraHearts = 1e17;
    state.rebirths = 12;
    state.eraStartedAt = Date.now() - 7_200_000;
    state.upgrades["stronger_heart"] = 30;
    state.rebirthUpgrades["rb_click"] = 10;
    return state;
  }

  it("is locked until the rebirth tree unlocks it", () => {
    const state = rich();
    state.eraHearts = 1e18;
    expect(canAscend(state)).toBe(false);
    expect(doAscend(state, Date.now()).ok).toBe(false);
  });

  it("resets the rebirth layer as well", () => {
    const state = ready();
    const lifetimeBefore = state.lifetime.hearts;
    expect(doAscend(state, Date.now()).ok).toBe(true);
    expect(state.ascensions).toBe(1);
    expect(state.wallet.crystals).toBeGreaterThan(0);
    expect(state.rebirths).toBe(0);
    expect(state.wallet.tokens).toBe(0);
    expect(state.rebirthUpgrades["rb_click"]).toBeUndefined();
    expect(state.upgrades["stronger_heart"]).toBeUndefined();
    expect(state.eraHearts).toBe(0);
    // Kept.
    expect(state.lifetime.hearts).toBe(lifetimeBefore);
    expect(state.worldsUnlocked).toEqual(["bedroom"]);
  });

  it("keeps pet levels only when the retention upgrade is owned", () => {
    const without = ready();
    without.eggs["basic"] = 1;
    const petA = openEgg(without, "basic", 1_000).pet!;
    without.pets[petA.id].level = 40;
    doAscend(without, Date.now());
    expect(without.pets[petA.id].level).toBe(1);

    const withRetention = ready();
    withRetention.ascensionUpgrades["as_pet_retention"] = 1;
    withRetention.eggs["basic"] = 1;
    const petB = openEgg(withRetention, "basic", 1_000).pet!;
    withRetention.pets[petB.id].level = 40;
    doAscend(withRetention, Date.now());
    expect(withRetention.pets[petB.id].level).toBe(40);
  });

  it("keeps the pet codex through an ascension either way", () => {
    const state = ready();
    state.eggs["basic"] = 1;
    openEgg(state, "basic", 1_000);
    const codex = [...state.petCodex];
    doAscend(state, Date.now());
    expect(state.petCodex).toEqual(codex);
  });
});

/* ------------------------------------------------------------------ */
/* 22-23. Challenges and bosses                                        */
/* ------------------------------------------------------------------ */

describe("challenges", () => {
  it("needs the rebirth unlock", () => {
    const state = rich();
    expect(startChallenge(state, "no_crit", Date.now()).ok).toBe(false);
  });

  it("empties the run on entry and hands it back on exit", () => {
    const state = rich();
    state.rebirthUpgrades["rb_challenges"] = 1;
    state.upgrades["stronger_heart"] = 20;
    state.wallet.hearts = 5e9;

    expect(startChallenge(state, "no_crit", 1_000).ok).toBe(true);
    expect(state.upgrades["stronger_heart"]).toBeUndefined();
    expect(state.wallet.hearts).toBe(0);

    finishChallenge(state, 2_000, true);
    expect(state.upgrades["stronger_heart"]).toBe(20);
    expect(state.wallet.hearts).toBe(5e9);
    expect(state.activeChallenge).toBeNull();
  });

  it("pays out and records a clear when the goal is met", () => {
    const state = rich();
    state.rebirthUpgrades["rb_challenges"] = 1;
    startChallenge(state, "no_crit", 1_000);
    state.activeChallenge!.score = 1e9;
    const result = finishChallenge(state, 2_000, false);
    expect(result.cleared).toBe(true);
    expect(state.challenges["no_crit"].completed).toBe(1);
    expect(state.stats.challengesCompleted).toBe(1);
  });

  it("turns criticals off inside the no-crit challenge", () => {
    const state = rich();
    state.rebirthUpgrades["rb_challenges"] = 1;
    state.upgrades["critical_chance"] = 40;
    startChallenge(state, "no_crit", 1_000);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const outcome = performClick(state, derive(state, 2_000), {
      precision: 0, charge: 0, now: 2_000, x: 0, y: 0,
    });
    expect(outcome.crit).toBe(false);
  });
});

describe("bosses", () => {
  it("needs the rebirth unlock and enough lifetime hearts", () => {
    const state = createGameState(0);
    expect(startBoss(state, "stone_heart", 1_000).ok).toBe(false);
    state.rebirthUpgrades["rb_bosses"] = 1;
    expect(startBoss(state, "stone_heart", 1_000).ok).toBe(false);
    state.lifetime.hearts = 1e6;
    expect(startBoss(state, "stone_heart", 1_000).ok).toBe(true);
    expect(state.activeBoss?.hp).toBeGreaterThan(0);
  });

  it("refuses a second fight while one is running", () => {
    const state = rich();
    state.rebirthUpgrades["rb_bosses"] = 1;
    startBoss(state, "stone_heart", 1_000);
    expect(startBoss(state, "stone_heart", 2_000).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 24-25. Missions and achievements                                    */
/* ------------------------------------------------------------------ */

describe("missions", () => {
  it("generates a board and does not regenerate it on the same day", () => {
    const state = rich();
    refreshMissions(state, "2026-07-04", "2026-W27", "2026-07");
    const first = state.missions.map((m) => m.defId).sort();
    refreshMissions(state, "2026-07-04", "2026-W27", "2026-07");
    expect(state.missions.map((m) => m.defId).sort()).toEqual(first);
  });

  it("gives the same board to both partners for the same day", () => {
    const a = rich();
    const b = rich();
    refreshMissions(a, "2026-07-04", "2026-W27", "2026-07");
    refreshMissions(b, "2026-07-04", "2026-W27", "2026-07");
    const dailies = (state: GameState) =>
      state.missions.filter((m) => m.period === "2026-07-04").map((m) => m.defId).sort();
    expect(dailies(a)).toEqual(dailies(b));
  });

  it("replaces daily missions on a new day and keeps story missions", () => {
    const state = rich();
    refreshMissions(state, "2026-07-04", "2026-W27", "2026-07");
    const story = state.missions.find((m) => m.period === "story");
    refreshMissions(state, "2026-07-05", "2026-W27", "2026-07");
    expect(state.missions.some((m) => m.period === "2026-07-04")).toBe(false);
    expect(state.missions.some((m) => m.period === "2026-07-05")).toBe(true);
    expect(state.missions.find((m) => m.id === story?.id)).toBeDefined();
  });

  it("only pays once the goal is reached", () => {
    const state = rich();
    refreshMissions(state, "2026-07-04", "2026-W27", "2026-07");
    const mission = state.missions.find((m) => m.period === "2026-07-04")!;
    expect(claimMission(state, mission.id).ok).toBe(false);
    mission.progress = mission.goal;
    expect(claimMission(state, mission.id).ok).toBe(true);
    expect(claimMission(state, mission.id).ok).toBe(false);
    expect(state.stats.missionsCompleted).toBe(1);
  });
});

describe("achievements", () => {
  it("unlocks tier by tier and pays each tier once", () => {
    const state = createGameState(0);
    state.stats.totalClicks = 100;
    const first = checkAchievements(state, 1_000);
    expect(first.some((a) => a.id === "ach_clicks")).toBe(true);
    expect(state.achievements["ach_clicks"].tier).toBe(1);

    expect(checkAchievements(state, 2_000).length).toBe(0);

    state.stats.totalClicks = 10_000;
    const later = checkAchievements(state, 3_000);
    // Tiers two and three of the tapping achievement at once. Other
    // achievements that share the clicks metric may also fire here.
    expect(later.filter((a) => a.id === "ach_clicks").length).toBe(2);
    expect(state.achievements["ach_clicks"].tier).toBe(3);
  });

  it("reads its progress from lifetime totals", () => {
    const state = createGameState(0);
    state.stats.totalClicks = 55;
    expect(metricTotal(state, "clicks")).toBe(55);
    state.lifetime.hearts = 1234;
    expect(metricTotal(state, "hearts")).toBe(1234);
  });
});

/* ------------------------------------------------------------------ */
/* 26-27. Events, shop, and the daily bonus                            */
/* ------------------------------------------------------------------ */

describe("shop and daily rewards", () => {
  it("charges for a shop item and refuses a second one-time purchase", () => {
    const state = rich();
    const before = state.wallet.golden;
    expect(buyShopItem(state, "s_paper_heart", 1_000).ok).toBe(true);
    expect(state.wallet.golden).toBeLessThan(before);
    expect(state.collections["heart_designs"]).toContain("paper");
    expect(buyShopItem(state, "s_paper_heart", 2_000).ok).toBe(false);
  });

  it("applies a timed boost from the shop", () => {
    const state = rich();
    expect(buyShopItem(state, "s_boost_click", 1_000).ok).toBe(true);
    expect(state.buffs.length).toBe(1);
    expect(derive(state, 1_000).mods.mul.click).toBeGreaterThan(1);
  });

  it("pays a daily bonus once per day and tracks the streak", () => {
    const state = rich();
    expect(claimDailyBonus(state, "2026-07-04")?.streak).toBe(1);
    expect(claimDailyBonus(state, "2026-07-04")).toBeNull();
    expect(claimDailyBonus(state, "2026-07-05")?.streak).toBe(2);
    // A missed day restarts the streak.
    expect(claimDailyBonus(state, "2026-07-08")?.streak).toBe(1);
  });

  it("unlocks a world and hands over its jar skin", () => {
    const state = rich();
    expect(unlockWorld(state, "rose_garden").ok).toBe(true);
    expect(state.worldsUnlocked).toContain("rose_garden");
    expect(state.collections["jar_skins"]).toContain("rose");
  });
});

/* ------------------------------------------------------------------ */
/* Floating hearts                                                     */
/* ------------------------------------------------------------------ */

describe("bonus hearts", () => {
  it("pays out a golden heart and counts it", () => {
    const state = rich();
    state.upgrades["passive_hearts"] = 20;
    const heart = spawnFloating(state, "golden", 1_000);
    const reward = collectFloating(state, derive(state, 1_000), heart.id, 1_000);
    expect(reward?.hearts).toBeGreaterThan(0);
    expect(state.stats.goldenCaught).toBe(1);
    expect(state.floating.length).toBe(0);
  });

  it("takes four taps to open a shielded heart", () => {
    const state = rich();
    const heart = spawnFloating(state, "shielded", 1_000);
    const derived = derive(state, 1_000);
    expect(collectFloating(state, derived, heart.id, 1_000)).toBeNull();
    expect(collectFloating(state, derived, heart.id, 1_000)).toBeNull();
    expect(collectFloating(state, derived, heart.id, 1_000)).toBeNull();
    expect(collectFloating(state, derived, heart.id, 1_000)).not.toBeNull();
  });

  it("never lets the floating list grow without bound", () => {
    const state = rich();
    for (let i = 0; i < 40; i++) spawnFloating(state, "golden", 1_000 + i);
    expect(state.floating.length).toBeLessThanOrEqual(12);
  });
});

/* ------------------------------------------------------------------ */
/* Partner bonuses                                                     */
/* ------------------------------------------------------------------ */

describe("partner bonuses", () => {
  it("pays once per day per action, so spamming is pointless", () => {
    const state = rich();
    const day = "2026-07-04";
    expect(grantPartnerReward(state, "question_answered", day, 1_000).ok).toBe(true);
    expect(grantPartnerReward(state, "question_answered", day, 2_000).ok).toBe(false);
    expect(grantPartnerReward(state, "question_answered", "2026-07-05", 3_000).ok).toBe(true);
  });

  it("allows a few messages a day and then stops paying", () => {
    const state = rich();
    const day = "2026-07-04";
    expect(grantPartnerReward(state, "message_sent", day, 1_000).ok).toBe(true);
    expect(grantPartnerReward(state, "message_sent", day, 2_000).ok).toBe(true);
    expect(grantPartnerReward(state, "message_sent", day, 3_000).ok).toBe(true);
    expect(grantPartnerReward(state, "message_sent", day, 4_000).ok).toBe(false);
  });

  it("adds bond energy without being required for anything", () => {
    const state = createGameState(0);
    grantPartnerReward(state, "question_answered", "2026-07-04", 1_000);
    expect(state.wallet.bond).toBeGreaterThan(0);
    expect(state.stats.heartsFromPartner).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* 34. Migration from the old Love Jar                                 */
/* ------------------------------------------------------------------ */

describe("legacy migration", () => {
  it("turns old taps into hearts and a keepsake, exactly once", () => {
    const state = createGameState(0);
    applyLegacy(state, 4_231);
    expect(state.wallet.hearts).toBe(4_231);
    expect(state.lifetime.hearts).toBe(4_231);
    expect(state.stats.totalClicks).toBe(4_231);
    expect(state.collections["jar_skins"]).toContain("founding");
    expect(state.legacyClaimed).toBe(true);

    applyLegacy(state, 4_231);
    expect(state.wallet.hearts).toBe(4_231);
  });

  it("handles a player who never used the old jar", () => {
    const state = createGameState(0);
    applyLegacy(state, 0);
    expect(state.legacyClaimed).toBe(true);
    expect(state.wallet.hearts).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Save migration                                                      */
/* ------------------------------------------------------------------ */

describe("save migration", () => {
  it("fills in everything a new build added", () => {
    const old = { version: 1, wallet: { hearts: 500 }, upgrades: { stronger_heart: 3 } };
    const migrated = migrateSave(old);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.wallet.hearts).toBe(500);
    expect(migrated.wallet.crystals).toBe(0);
    expect(migrated.upgrades["stronger_heart"]).toBe(3);
    expect(migrated.settings.numberFormat).toBe("short");
    expect(migrated.petLoadouts.length).toBeGreaterThan(0);
  });

  it("survives a corrupt save without producing NaN", () => {
    const migrated = migrateSave({ wallet: { hearts: NaN }, runHearts: NaN, lifetime: null });
    expect(migrated.wallet.hearts).toBe(0);
    expect(migrated.runHearts).toBe(0);
    expect(Number.isFinite(derive(migrated, 0).heartsPerClick)).toBe(true);
  });

  it("returns a fresh save for junk input", () => {
    expect(migrateSave(null).version).toBe(SAVE_VERSION);
    expect(migrateSave("nonsense").wallet.hearts).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Currency guards                                                     */
/* ------------------------------------------------------------------ */

describe("currency", () => {
  it("ignores nonsense amounts", () => {
    const state = createGameState(0);
    addCurrency(state, "hearts", NaN);
    addCurrency(state, "hearts", -50);
    expect(state.wallet.hearts).toBe(0);
    expect(earnHearts(state, -5, "click")).toBe(0);
  });

  it("keeps run, era and lifetime totals in step", () => {
    const state = createGameState(0);
    earnHearts(state, 100, "click");
    expect(state.runHearts).toBe(100);
    expect(state.eraHearts).toBe(100);
    expect(state.lifetime.hearts).toBe(100);
  });
});
