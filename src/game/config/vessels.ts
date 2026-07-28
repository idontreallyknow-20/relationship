import type { Mods } from "../types";

// The jar itself is the progression. Ten vessels, each a real object with a
// water depth, a floor, and one rule of its own. This replaces both the old
// worlds and the abstract "jar capacity lv 47".

export interface VesselDef {
  id: string;
  name: string;
  blurb: string;
  /** Hearts it holds before it overflows. Overflow pays a bonus, never waste. */
  capacity: number;
  /** 0..1 of the vessel height that is water. Otters need depth. */
  depth: number;
  /** How many creatures can live in it at once. */
  slots: number;
  /** Floor width in arbitrary units. Crabs need floor to walk. */
  floor: number;
  glass: string;
  water: string;
  backdrop: string;
  accent: string;
  /** Always on while this vessel is the one you are using. */
  mods: Mods;
  rule: string;
  cost: { currency: "hearts" | "pearls" | "stars"; amount: number };
  /** Lifetime hearts before it can be bought at all. */
  unlockLifetime: number;
}

export const VESSELS: VesselDef[] = [
  {
    id: "jam_jar",
    name: "Jam Jar",
    blurb: "The one that was already on the shelf.",
    capacity: 25_000,
    depth: 0.45,
    slots: 2,
    floor: 1,
    glass: "#ffffff",
    water: "#f0cbd8",
    backdrop: "#fbf6ef",
    accent: "#a85b73",
    mods: {},
    rule: "No rule of its own.",
    cost: { currency: "hearts", amount: 0 },
    unlockLifetime: 0,
  },
  {
    id: "mason_jar",
    name: "Mason Jar",
    blurb: "Taller, and it seals.",
    capacity: 400_000,
    depth: 0.55,
    slots: 3,
    floor: 1.2,
    glass: "#fdfbf7",
    water: "#e8bfd0",
    backdrop: "#f7f1e6",
    accent: "#8f4560",
    mods: { mul: { all: 1.1 } },
    rule: "Everything pays a tenth more.",
    cost: { currency: "hearts", amount: 250_000 },
    unlockLifetime: 100_000,
  },
  {
    id: "apothecary",
    name: "Apothecary Jar",
    blurb: "Heavy glass, ground stopper, older than both of you.",
    capacity: 9e6,
    depth: 0.6,
    slots: 4,
    floor: 1.4,
    glass: "#f6f2ea",
    water: "#d8b0c8",
    backdrop: "#efe6d8",
    accent: "#6a4a6a",
    mods: { mul: { shellGain: 1.3, glassGain: 1.2 } },
    rule: "Shells and sea glass come in faster.",
    cost: { currency: "hearts", amount: 5e6 },
    unlockLifetime: 2e6,
  },
  {
    id: "fishbowl",
    name: "Fishbowl",
    blurb: "The first one with enough water to properly float in.",
    capacity: 2e8,
    depth: 0.72,
    slots: 5,
    floor: 1.8,
    glass: "#f2f7f7",
    water: "#a8cfd8",
    backdrop: "#e8f0ee",
    accent: "#3f8a9a",
    mods: { mul: { crackValue: 2 } },
    rule: "Otters crack twice as hard.",
    cost: { currency: "pearls", amount: 40 },
    unlockLifetime: 5e7,
  },
  {
    id: "tidepool",
    name: "Tidepool",
    blurb: "Not a container at all. A dent in a rock that fills twice a day.",
    capacity: 6e9,
    depth: 0.5,
    slots: 7,
    floor: 3.2,
    glass: "#e6ded0",
    water: "#8fc0c8",
    backdrop: "#d8cfc0",
    accent: "#4a7a80",
    mods: { mul: { tideGain: 2, collectValue: 1.5 } },
    rule: "Wide floor, shallow water. Crabs thrive, Tide rises twice as fast.",
    cost: { currency: "pearls", amount: 180 },
    unlockLifetime: 1e9,
  },
  {
    id: "terrarium",
    name: "Terrarium",
    blurb: "Kelp took hold and nobody stopped it.",
    capacity: 2e11,
    depth: 0.65,
    slots: 8,
    floor: 3,
    glass: "#eef4ea",
    water: "#8fb890",
    backdrop: "#dfe8d8",
    accent: "#4a7a4a",
    mods: { mul: { cps: 2, offline: 1.5 } },
    rule: "Everything keeps growing while you are away.",
    cost: { currency: "pearls", amount: 700 },
    unlockLifetime: 5e10,
  },
  {
    id: "reef_tank",
    name: "Reef Tank",
    blurb: "It has a filter and a schedule and you check it every morning.",
    capacity: 8e13,
    depth: 0.8,
    slots: 10,
    floor: 3.6,
    glass: "#eef0f8",
    water: "#7fa8d0",
    backdrop: "#dde4f0",
    accent: "#3f5d8a",
    mods: { mul: { crackSpeed: 1.5, collectSpeed: 1.5 } },
    rule: "Everything living in here moves half again as fast.",
    cost: { currency: "stars", amount: 3 },
    unlockLifetime: 1e13,
  },
  {
    id: "aquarium",
    name: "Aquarium",
    blurb: "Big enough that people stop and look at it.",
    capacity: 4e16,
    depth: 0.85,
    slots: 12,
    floor: 4.2,
    glass: "#e8eef4",
    water: "#5f92c0",
    backdrop: "#cfdae8",
    accent: "#2f5a80",
    mods: { mul: { all: 1.6, pearlGain: 1.5 } },
    rule: "Deep enough for pearls to be common.",
    cost: { currency: "stars", amount: 9 },
    unlockLifetime: 1e16,
  },
  {
    id: "cove",
    name: "Cove",
    blurb: "You stopped pretending it was a jar a while ago.",
    capacity: 2e20,
    depth: 0.9,
    slots: 16,
    floor: 6,
    glass: "#dfe8e4",
    water: "#3f7a80",
    backdrop: "#c0d0cc",
    accent: "#1f4a50",
    mods: { mul: { all: 2.2, moonGain: 1.4 } },
    rule: "Rebirths here pay far more.",
    cost: { currency: "stars", amount: 25 },
    unlockLifetime: 1e19,
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "There is no lid.",
    capacity: Infinity,
    depth: 1,
    slots: 24,
    floor: 10,
    glass: "#cfdcd8",
    water: "#1f4a5a",
    backdrop: "#8fa8b0",
    accent: "#a8d8e0",
    mods: { mul: { all: 4, starGain: 1.5 } },
    rule: "No capacity at all. Nothing ever overflows again.",
    cost: { currency: "stars", amount: 80 },
    unlockLifetime: 1e22,
  },
];

export const VESSEL_BY_ID: Record<string, VesselDef> = Object.fromEntries(
  VESSELS.map((v) => [v.id, v]),
);

export function vesselIndex(id: string): number {
  return Math.max(0, VESSELS.findIndex((v) => v.id === id));
}

/** Old world ids mapped onto the vessel that replaced them. */
export const LEGACY_WORLD_MAP: Record<string, string> = {
  bedroom: "jam_jar",
  rose_garden: "mason_jar",
  candy_factory: "apothecary",
  moonlit_balcony: "fishbowl",
  memory_library: "tidepool",
  crystal_cave: "terrarium",
  golden_palace: "reef_tank",
  starry_date: "aquarium",
  cosmic_realm: "cove",
  eternal_garden: "ocean",
};

/* ------------------------------------------------------------------ */
/* Drifters: what is left of bosses                                    */
/* ------------------------------------------------------------------ */

// No health bars, no tiers, no tab. Occasionally something floats in, you
// tap at it for a while, it opens.

export interface DrifterDef {
  id: string;
  name: string;
  blurb: string;
  /** Taps to open, before any multipliers. */
  taps: number;
  color: string;
  reward: { hearts: number; pearls?: number; shells?: number; glass?: number };
}

export const DRIFTERS: DrifterDef[] = [
  {
    id: "clam",
    name: "Stubborn Clam",
    blurb: "Shut. Determined about it.",
    taps: 12,
    color: "#b0a898",
    reward: { hearts: 400, pearls: 2, shells: 20 },
  },
  {
    id: "kelp",
    name: "Knotted Kelp",
    blurb: "Something is tangled in it.",
    taps: 8,
    color: "#6a8a5a",
    reward: { hearts: 250, glass: 60, shells: 12 },
  },
  {
    id: "barnacles",
    name: "Barnacle Cluster",
    blurb: "Came in on something and stayed.",
    taps: 20,
    color: "#8a9098",
    reward: { hearts: 900, glass: 120, pearls: 1 },
  },
];

export const DRIFTER_BY_ID: Record<string, DrifterDef> = Object.fromEntries(
  DRIFTERS.map((d) => [d.id, d]),
);
