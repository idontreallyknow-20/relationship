import type { CurrencyId, Mods } from "../types";

// The shop spends currencies you earned by playing. There is no real money in
// this app and there never will be, so nothing here is a gate: every entry is
// a cosmetic, a convenience, or a boost you could also earn by playing.

export type ShopCategory = "cosmetic" | "pets" | "boosts" | "utility" | "event";

export interface ShopItemDef {
  id: string;
  category: ShopCategory;
  name: string;
  description: string;
  cost: Partial<Record<CurrencyId, number>>;
  /** One-time purchases disappear once owned. */
  once: boolean;
  effect:
    | { kind: "collectible"; collection: string; item: string }
    | { kind: "egg"; egg: string; count: number }
    | { kind: "boost"; label: string; mods: Mods; durationMs: number }
    | { kind: "currency"; currency: CurrencyId; amount: number }
    | { kind: "reroll" }
    | { kind: "respec"; layer: "rebirth" | "ascension" };
  unlockLifetime?: number;
}

export const SHOP_ITEMS: ShopItemDef[] = [
  // Cosmetics.
  { id: "s_paper_heart", category: "cosmetic", name: "Paper Heart", description: "A folded paper heart to tap.", cost: { golden: 40 }, once: true, effect: { kind: "collectible", collection: "heart_designs", item: "paper" } },
  { id: "s_petals", category: "cosmetic", name: "Petal Taps", description: "Petals scatter from every tap.", cost: { golden: 60 }, once: true, effect: { kind: "collectible", collection: "click_effects", item: "petals" } },
  { id: "s_warm_aura", category: "cosmetic", name: "Warm Aura", description: "A soft ring around the jar.", cost: { golden: 90 }, once: true, effect: { kind: "collectible", collection: "auras", item: "warm" } },

  // Pets.
  { id: "s_egg_basic", category: "pets", name: "Meadow Egg", description: "One egg from the first pool.", cost: { hearts: 25_000 }, once: false, effect: { kind: "egg", egg: "basic", count: 1 } },
  { id: "s_egg_meadow", category: "pets", name: "Rose Garden Egg", description: "One egg from the garden pool.", cost: { golden: 12 }, once: false, effect: { kind: "egg", egg: "meadow", count: 1 }, unlockLifetime: 500_000 },
  { id: "s_egg_workshop", category: "pets", name: "Workshop Egg", description: "One egg from the workshop pool.", cost: { golden: 45 }, once: false, effect: { kind: "egg", egg: "workshop", count: 1 }, unlockLifetime: 2e7 },
  { id: "s_egg_celestial", category: "pets", name: "Celestial Egg", description: "One egg from the celestial pool.", cost: { golden: 160 }, once: false, effect: { kind: "egg", egg: "celestial", count: 1 }, unlockLifetime: 5e8 },
  { id: "s_egg_cosmic", category: "pets", name: "Cosmic Egg", description: "One egg from the endgame pool.", cost: { star: 3 }, once: false, effect: { kind: "egg", egg: "cosmic", count: 1 }, unlockLifetime: 1e11 },
  { id: "s_treats", category: "pets", name: "Bag of Treats", description: "One hundred pet treats.", cost: { golden: 15 }, once: false, effect: { kind: "currency", currency: "treats", amount: 100 } },

  // Boosts. Timed, modest, and never required.
  { id: "s_boost_click", category: "boosts", name: "Warm Hands", description: "Double click power for fifteen minutes.", cost: { golden: 20 }, once: false, effect: { kind: "boost", label: "Warm Hands", mods: { mul: { click: 2 } }, durationMs: 900_000 } },
  { id: "s_boost_passive", category: "boosts", name: "Full Shelf", description: "Double passive hearts for thirty minutes.", cost: { golden: 20 }, once: false, effect: { kind: "boost", label: "Full Shelf", mods: { mul: { cps: 2 } }, durationMs: 1_800_000 } },
  { id: "s_boost_all", category: "boosts", name: "Good Day", description: "Everything pays fifty percent more for an hour.", cost: { golden: 60 }, once: false, effect: { kind: "boost", label: "Good Day", mods: { mul: { all: 1.5 } }, durationMs: 3_600_000 } },
  { id: "s_boost_luck", category: "boosts", name: "Lucky Streak", description: "Luck and golden hearts for twenty minutes.", cost: { golden: 35 }, once: false, effect: { kind: "boost", label: "Lucky Streak", mods: { add: { luck: 0.2, goldenChance: 0.1 } }, durationMs: 1_200_000 } },

  // Utility.
  { id: "s_reroll", category: "utility", name: "Mission Reroll", description: "Swap one daily mission for another.", cost: { golden: 8 }, once: false, effect: { kind: "reroll" } },
  { id: "s_respec_rebirth", category: "utility", name: "Rebirth Respec", description: "Refund every rebirth upgrade and get the tokens back.", cost: { golden: 250 }, once: false, effect: { kind: "respec", layer: "rebirth" }, unlockLifetime: 1e9 },
  { id: "s_respec_ascension", category: "utility", name: "Ascension Respec", description: "Refund every ascension upgrade and get the crystals back.", cost: { star: 5 }, once: false, effect: { kind: "respec", layer: "ascension" }, unlockLifetime: 1e15 },
  { id: "s_fragments", category: "utility", name: "Fragment Pouch", description: "Five hundred charm fragments.", cost: { golden: 30 }, once: false, effect: { kind: "currency", currency: "fragments", amount: 500 } },
  { id: "s_dust", category: "utility", name: "Dust Pouch", description: "Five hundred love dust.", cost: { golden: 25 }, once: false, effect: { kind: "currency", currency: "dust", amount: 500 } },
];

export const SHOP_BY_ID: Record<string, ShopItemDef> = Object.fromEntries(SHOP_ITEMS.map((s) => [s.id, s]));
