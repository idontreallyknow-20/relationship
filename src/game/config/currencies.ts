import type { CurrencyId } from "../types";

export interface CurrencyDef {
  id: CurrencyId;
  name: string;
  short: string;
  source: string;
  purpose: string;
  color: string;
}

// Seven, down from fourteen. Every one is themed to the jar and has exactly
// one place it comes from and one place it goes.

export const CURRENCIES: CurrencyDef[] = [
  {
    id: "hearts",
    name: "Hearts",
    short: "Hearts",
    source: "Tapping, and everything living in the jar.",
    purpose: "Upgrades and vessels.",
    color: "#a85b73",
  },
  {
    id: "pearls",
    name: "Pearls",
    short: "Pearls",
    source: "Otters cracking open the right shell.",
    purpose: "Abilities, new creatures, the shop.",
    color: "#c9b8a0",
  },
  {
    id: "shells",
    name: "Shells",
    short: "Shells",
    source: "Cracked open on the surface, collected off the floor.",
    purpose: "Feeding and levelling creatures.",
    color: "#d08a6a",
  },
  {
    id: "glass",
    name: "Sea Glass",
    short: "Glass",
    source: "Crabs sifting the floor.",
    purpose: "Rocks, shells and everything a creature carries.",
    color: "#7fb0a8",
  },
  {
    id: "tide",
    name: "Tide",
    short: "Tide",
    source: "Both of you playing. Rises for either, spends for both.",
    purpose: "The Us tree and shared boosts.",
    color: "#7c6ba8",
  },
  {
    id: "moons",
    name: "Moons",
    short: "Moons",
    source: "Changing the tide, which empties the jar.",
    purpose: "Permanent upgrades that survive it.",
    color: "#b0b0c8",
  },
  {
    id: "stars",
    name: "Stars",
    short: "Stars",
    source: "New water. Rare.",
    purpose: "The last vessels and the deepest upgrades.",
    color: "#4f7bd0",
  },
  {
    id: "drops",
    name: "Drops",
    short: "Drops",
    source: "Letting the whole sea go, once you have one.",
    purpose: "The deepest tree. It changes what the jar is.",
    color: "#3b6ea5",
  },
];

export const CURRENCY_BY_ID: Record<CurrencyId, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, c]),
) as Record<CurrencyId, CurrencyDef>;

export const ZERO_WALLET: Record<CurrencyId, number> = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, 0]),
) as Record<CurrencyId, number>;

/** Old saves carried fourteen currencies. This is where they land. */
export const LEGACY_CURRENCY_MAP: Record<string, CurrencyId> = {
  hearts: "hearts",
  golden: "pearls",
  treats: "shells",
  dust: "glass",
  fragments: "glass",
  shards: "pearls",
  bond: "tide",
  tokens: "moons",
  crystals: "stars",
  star: "stars",
  eternal: "stars",
  event: "pearls",
  skill: "pearls",
  mastery: "stars",
};
