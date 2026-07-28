import type { CurrencyId } from "../types";

export interface CurrencyDef {
  id: CurrencyId;
  name: string;
  short: string;
  /** Where it comes from, shown in the codex and in the balance tooltip. */
  source: string;
  /** What it is for. A currency without a sink does not belong here. */
  purpose: string;
  color: string;
  /** Rare currencies ask for confirmation before being spent. */
  rare: boolean;
  /** Whether spending and earning is written to the transaction log. */
  tracked: boolean;
}

export const CURRENCIES: CurrencyDef[] = [
  {
    id: "hearts",
    name: "Hearts",
    short: "Hearts",
    source: "Tapping the heart, passive generators, bosses and abilities.",
    purpose: "The main spending currency for every normal upgrade tree.",
    color: "#a85b73",
    rare: false,
    tracked: true,
  },
  {
    id: "golden",
    name: "Golden Hearts",
    short: "Golden",
    source: "Catching golden hearts before they drift away, and boss clears.",
    purpose: "Pet eggs, premium upgrades, and cosmetics in the shop.",
    color: "#c99a3f",
    rare: false,
    tracked: true,
  },
  {
    id: "dust",
    name: "Love Dust",
    short: "Dust",
    source: "Salvaging charms you do not need.",
    purpose: "Rerolling and enhancing the charms you do.",
    color: "#b48fd0",
    rare: false,
    tracked: false,
  },
  {
    id: "bond",
    name: "Bond Energy",
    short: "Bond",
    source: "Answering the daily question, letters, memories and moods.",
    purpose: "The partner upgrade tree and shared boosts. Capped daily.",
    color: "#7c6ba8",
    rare: false,
    tracked: true,
  },
  {
    id: "treats",
    name: "Pet Treats",
    short: "Treats",
    source: "Missions, expeditions and duplicate pets.",
    purpose: "Feeding pets to raise happiness and experience.",
    color: "#d08a6a",
    rare: false,
    tracked: false,
  },
  {
    id: "shards",
    name: "Memory Shards",
    short: "Shards",
    source: "Bosses, collection completions and rare hearts.",
    purpose: "Pet evolution and pet fusion.",
    color: "#5aa8b0",
    rare: true,
    tracked: true,
  },
  {
    id: "tokens",
    name: "Rebirth Tokens",
    short: "Tokens",
    source: "Rebirthing. More hearts in a run means more tokens.",
    purpose: "The permanent rebirth upgrade tree.",
    color: "#c46a8a",
    rare: true,
    tracked: true,
  },
  {
    id: "crystals",
    name: "Ascension Crystals",
    short: "Crystals",
    source: "Ascending, which resets rebirth progress as well.",
    purpose: "The ascension tree, extra slots and automation.",
    color: "#8f6ad0",
    rare: true,
    tracked: true,
  },
  {
    id: "star",
    name: "Star Hearts",
    short: "Stars",
    source: "First boss clears, challenge completions and milestones.",
    purpose: "Unlocking worlds and the rarest shop entries.",
    color: "#4f7bd0",
    rare: true,
    tracked: true,
  },
  {
    id: "eternal",
    name: "Eternal Hearts",
    short: "Eternal",
    source: "Ascension milestones only.",
    purpose: "Eternal upgrades, which survive every reset layer.",
    color: "#3f5d8a",
    rare: true,
    tracked: true,
  },
  {
    id: "event",
    name: "Event Tokens",
    short: "Event",
    source: "The event that is currently running.",
    purpose: "The event shop. Carries over between events.",
    color: "#c05c8e",
    rare: false,
    tracked: true,
  },
  {
    id: "fragments",
    name: "Charm Fragments",
    short: "Fragments",
    source: "Bosses, treasure hearts and challenge rewards.",
    purpose: "Crafting new charms at the chosen rarity.",
    color: "#7fa06a",
    rare: false,
    tracked: false,
  },
  {
    id: "skill",
    name: "Skill Points",
    short: "Skill",
    source: "Achievements, missions and rebirth milestones.",
    purpose: "Levelling active abilities.",
    color: "#c2803f",
    rare: false,
    tracked: true,
  },
  {
    id: "mastery",
    name: "Mastery Points",
    short: "Mastery",
    source: "Long term mastery quests and repeat boss clears.",
    purpose: "The mastery upgrades at the end of each tree.",
    color: "#8a3f5d",
    rare: true,
    tracked: true,
  },
];

export const CURRENCY_BY_ID: Record<CurrencyId, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, c]),
) as Record<CurrencyId, CurrencyDef>;

export const ZERO_WALLET: Record<CurrencyId, number> = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, 0]),
) as Record<CurrencyId, number>;
