import type { CurrencyId } from "../types";

export interface CurrencyDef {
  id: CurrencyId;
  name: string;
  short: string;
  source: string;
  purpose: string;
  color: string;
}

// Seven, and every one of them can be explained in a sentence that names
// exactly one action.
//
// That is the whole reason this list changed. It used to hold pearls, shells
// and sea glass, and asked directly: those are confusing to obtain. They were,
// and not by accident. All three came out of the same place by the same
// mechanic, differing only in a dice roll: an otter cracked something open, the
// pieces sank, a crab picked them up, and which of the three you got was
// decided by `Math.random() < 0.06` inside the engine. Nothing on screen could
// have told you how to get more of one and fewer of another, because the honest
// answer was "you cannot, they are the same faucet wearing three hats".
//
// So the floor mechanic is gone and so are they. What is left is one currency
// per thing you do.

export const CURRENCIES: CurrencyDef[] = [
  {
    id: "hearts",
    name: "Hearts",
    short: "Hearts",
    source: "Tapping the jar, and the pets dropping them in.",
    purpose: "Upgrades, and filling the jar you are on.",
    color: "#a85b73",
  },
  {
    id: "ribbons",
    name: "Ribbons",
    short: "Ribbons",
    source: "Sealing a full jar. One jar, one ribbon, at least.",
    purpose: "Bigger jars, more pets, and the shelf.",
    color: "#d08aa8",
  },
  {
    id: "keepsakes",
    name: "Keepsakes",
    short: "Keeps",
    source: "The two of you using the rest of the app.",
    purpose: "The shared tree, which pays both of you.",
    color: "#3f8f96",
  },
  {
    id: "moons",
    name: "Moons",
    short: "Moons",
    source: "A rebirth.",
    purpose: "The moon tree, which is kept through every rebirth.",
    color: "#8f86c9",
  },
  {
    id: "stars",
    name: "Stars",
    short: "Stars",
    source: "An ascension.",
    purpose: "The star tree, which is kept through every ascension.",
    color: "#c9a03f",
  },
  {
    id: "suns",
    name: "Suns",
    short: "Suns",
    source: "A forever.",
    purpose: "The sun tree. It changes what the jar is.",
    color: "#d2802f",
  },
  {
    id: "hours",
    name: "Hours",
    short: "Hours",
    source: "Playing on with the jar deliberately slowed down.",
    purpose: "The last tree, and the only thing that makes dilation bearable.",
    color: "#7a6ba8",
  },
];

export const CURRENCY_BY_ID: Record<CurrencyId, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, c]),
) as Record<CurrencyId, CurrencyDef>;

export const ZERO_WALLET: Record<CurrencyId, number> = Object.fromEntries(
  CURRENCIES.map((c) => [c.id, 0]),
) as Record<CurrencyId, number>;
