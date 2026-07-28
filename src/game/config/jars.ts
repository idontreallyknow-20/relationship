// The jars.
//
// Replaces `vessels.ts`, which described a tank of water with a depth and a
// floor width because creatures lived inside it and needed somewhere to swim
// and somewhere to walk. They live on the table now, so a jar is once again
// just a jar: something with a size, that you fill.
//
// Fourteen of them, from a jam jar to something the size of a room. Each holds
// more than the last, seats more pets around it, and adds one standing rule so
// that choosing to move up is a decision with a shape rather than a bigger
// number.

import type { Mods } from "../types";

export interface JarDef {
  id: string;
  name: string;
  blurb: string;
  /** Hearts it holds before it is full and ready to seal. */
  capacity: number;
  /** How many pets can sit around it. */
  seats: number;
  /** Glass, contents and the surface it stands on. */
  glass: string;
  backdrop: string;
  shelf: string;
  /** Always on while this is the jar you are filling. */
  mods: Mods;
  rule: string;
  /** Ribbons to move up. The first one is what you start with. */
  cost: number;
}

export const JARS: JarDef[] = [
  {
    id: "jam_jar",
    name: "Jam Jar",
    blurb: "The one that was already in the cupboard.",
    capacity: 400,
    seats: 2,
    glass: "#ecdae1",
    backdrop: "#fdf7f4",
    shelf: "#e6d3c8",
    mods: {},
    rule: "Where everyone starts.",
    cost: 0,
  },
  {
    id: "jelly_jar",
    name: "Jelly Jar",
    blurb: "Slightly taller, and it has a lid that actually fits.",
    capacity: 4_000,
    seats: 3,
    glass: "#e8d2dd",
    backdrop: "#fdf5f6",
    shelf: "#e6d3c8",
    mods: { mul: { click: 1.15 } },
    rule: "Every tap is worth a little more.",
    cost: 2,
  },
  {
    id: "mason_jar",
    name: "Mason Jar",
    blurb: "The proper kind, with the ridged neck.",
    capacity: 45_000,
    seats: 4,
    glass: "#e2cddb",
    backdrop: "#fbf3f6",
    shelf: "#e2cec1",
    mods: { mul: { all: 1.1 } },
    rule: "Everything pays a tenth more.",
    cost: 6,
  },
  {
    id: "pickling_jar",
    name: "Pickling Jar",
    blurb: "Big enough that you have to use both hands.",
    capacity: 6e5,
    seats: 5,
    glass: "#dcc7d8",
    backdrop: "#faf1f5",
    shelf: "#e0cbbd",
    mods: { mul: { cps: 1.25 } },
    rule: "The pets carry a quarter more.",
    cost: 14,
  },
  {
    id: "sweet_jar",
    name: "Sweet Jar",
    blurb: "The kind on the counter of a shop that still uses a bell.",
    capacity: 9e6,
    seats: 6,
    glass: "#d6c2d6",
    backdrop: "#f8eff4",
    shelf: "#dcc7b8",
    mods: { mul: { ribbonGain: 1.2 } },
    rule: "Sealing pays more ribbons.",
    cost: 30,
  },
  {
    id: "demijohn",
    name: "Demijohn",
    blurb: "Round, green, and heavier than it looks.",
    capacity: 1.4e8,
    seats: 7,
    glass: "#c7d2c8",
    backdrop: "#f2f6f0",
    shelf: "#d8c3b4",
    mods: { mul: { all: 1.25 } },
    rule: "Everything again, a quarter more.",
    cost: 65,
  },
  {
    id: "carboy",
    name: "Carboy",
    blurb: "You have stopped pretending this fits in a cupboard.",
    capacity: 2.2e9,
    seats: 8,
    glass: "#bccdd6",
    backdrop: "#eff4f7",
    shelf: "#d4bfaf",
    mods: { mul: { click: 1.6, cps: 1.3 } },
    rule: "Taps and pets both land harder.",
    cost: 140,
  },
  {
    id: "churn",
    name: "Churn",
    blurb: "Not a jar. Nobody is going to argue with you about it.",
    capacity: 4e10,
    seats: 10,
    glass: "#c8bfd2",
    backdrop: "#f1eff7",
    shelf: "#d0bbab",
    mods: { mul: { shelfRate: 1.3 } },
    rule: "Everything on the shelf pays faster.",
    cost: 300,
  },
  {
    id: "barrel",
    name: "Barrel",
    blurb: "Standing on its end in the corner, quietly filling.",
    capacity: 9e11,
    seats: 12,
    glass: "#c4a98f",
    backdrop: "#f6efe6",
    shelf: "#cbb6a6",
    mods: { mul: { all: 1.5 } },
    rule: "Half as much again, of everything.",
    cost: 650,
  },
  {
    id: "vat",
    name: "Vat",
    blurb: "It came with the house. Neither of you has asked why.",
    capacity: 3e13,
    seats: 14,
    glass: "#a9b0b8",
    backdrop: "#f0f2f4",
    shelf: "#c6b1a1",
    mods: { mul: { cps: 2, ribbonGain: 1.4 } },
    rule: "The pets and the ribbons both double down.",
    cost: 1_400,
  },
  {
    id: "cistern",
    name: "Cistern",
    blurb: "Under the floor, and the floor is glass now.",
    capacity: 1.2e15,
    seats: 16,
    glass: "#9fb3bd",
    backdrop: "#eef3f5",
    shelf: "#c1ac9c",
    mods: { mul: { all: 1.8, shelfRate: 1.4 } },
    rule: "Everything, and the shelf with it.",
    cost: 3_200,
  },
  {
    id: "reservoir",
    name: "Reservoir",
    blurb: "Visible from the road.",
    capacity: 6e17,
    seats: 20,
    glass: "#8fa8bd",
    backdrop: "#ecf1f6",
    shelf: "#bca797",
    mods: { mul: { all: 2.4 } },
    rule: "More than twice as much, of everything.",
    cost: 8_000,
  },
  {
    id: "harbour",
    name: "Harbour",
    blurb: "You have started calling the tide a filling mechanism.",
    capacity: 4e20,
    seats: 26,
    glass: "#7f9cb5",
    backdrop: "#e9eff5",
    shelf: "#b7a292",
    mods: { mul: { all: 3.2, ribbonGain: 2 } },
    rule: "Everything, and twice the ribbons.",
    cost: 20_000,
  },
  {
    id: "the_whole_sky",
    name: "The Whole Sky",
    blurb: "It stopped being a container some time ago. It still fills up.",
    capacity: Infinity,
    seats: 34,
    glass: "#b6a8d4",
    backdrop: "#f2eff8",
    shelf: "#b29d8d",
    mods: { mul: { all: 5, shelfRate: 2, cps: 2 } },
    rule: "Never full. Seal it whenever you like.",
    cost: 55_000,
  },
];

export const JAR_BY_ID: Record<string, JarDef> = Object.fromEntries(
  JARS.map((j) => [j.id, j]),
);

export function jarIndex(id: string): number {
  const at = JARS.findIndex((j) => j.id === id);
  return at < 0 ? 0 : at;
}

export const FIRST_JAR = JARS[0].id;

/**
 * The jar after this one, or null at the top.
 *
 * The last jar has no capacity, so the ladder ends by removing the wall rather
 * than by putting up one you cannot pass.
 */
export function nextJar(id: string): JarDef | null {
  return JARS[jarIndex(id) + 1] ?? null;
}
