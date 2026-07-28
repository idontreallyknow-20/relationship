import type { AddStat, CurrencyId, GameState, Mods, MulStat } from "../types";

// Rebirth: start the jar again, keep what you learned.
//
// Three rungs of the same shape. The first is the one you do constantly, the
// second is rare, the third is the end. They used to be called Tide Change,
// New Water and The Sea, which meant the game had three poetic names for
// "reset" plus a separate mechanic actually called Tide. Nobody could keep
// them apart, so they are all just Rebirth now, with a plain adjective.
//
// The internal ids and save fields keep the old words (`tideChanges`,
// `newWaters`, `seas`) so that no existing save has to be rewritten. Nothing
// the player sees uses them.

export interface ResetLayerDef {
  id: string;
  name: string;
  verb: string;
  currency: CurrencyId;
  blurb: string;
  requirement: number;
  gain: (state: GameState, multiplier: number) => number;
  resets: string[];
  keeps: string[];
}

export const TIDE_REQUIREMENT = 1e6;
export const WATER_REQUIREMENT = 1e13;
/** The last rung, and reachable only after several deep rebirths. */
export const SEA_REQUIREMENT = 1e25;

/**
 * Why these are capped.
 *
 * A requirement is a number the run has to actually reach, so a requirement
 * of 1e400 is not expensive, it is impossible: hearts are ordinary floating
 * point and stop existing above about 1.8e308. Left uncapped, the bar passed
 * that at the fifty-first rebirth and the game simply ended with no message.
 *
 * The ceilings below sit far enough under it that every rung stays reachable
 * forever, and once a rung is capped it stops getting harder, which is what
 * makes the count keep climbing rather than the numbers.
 *
 * This is also the answer to "can we just use bigger numbers". Bigger numbers
 * would let the bar keep rising, but the bar rising is not what makes the game
 * long; doing the loop again is. What was actually broken was that a rebirth
 * left the whole production chain standing, so the next one arrived seconds
 * later and the multipliers compounded until the ceiling. Rebirth clears the
 * chain now, which bounds the run, which is why these caps are enough.
 */
const REQUIREMENT_CEILING = 1e200;

/**
 * Every rebirth asks for more than the last one did.
 *
 * Twenty times more each time. That is enough that the count matters and
 * gentle enough that the hundredth rebirth is still a thing you can reach,
 * because the permanent tree is growing alongside it.
 */
export function tideRequirement(tideChanges: number): number {
  return Math.min(REQUIREMENT_CEILING, TIDE_REQUIREMENT * Math.pow(20, tideChanges));
}

export function waterRequirement(newWaters: number): number {
  return Math.min(1e250, WATER_REQUIREMENT * Math.pow(1e4, newWaters));
}

export function seaRequirement(seas: number): number {
  return Math.min(1e280, SEA_REQUIREMENT * Math.pow(1e5, seas));
}

/**
 * What a rebirth pays.
 *
 * Logarithmic in how far past the bar you went, not proportional to it. That
 * distinction is the difference between a game that lasts months and one that
 * lasts an afternoon.
 *
 * It used to be the cube root of the overshoot. The trouble is that late in a
 * life the jar makes more hearts in one second than it made in the whole first
 * minute, so you never cross the bar, you rocket past it by ten orders of
 * magnitude before the next tick. Cube-rooting that still paid thousands of
 * moons for a life that took forty seconds, and the tree those moons bought
 * made the next life faster still. Simulated: forty-two rebirths in the second
 * hour and accelerating.
 *
 * A logarithm flattens the overshoot completely. Landing exactly on the bar
 * pays eight; landing ten orders of magnitude past it pays eighty. Going
 * further is always worth something and never worth waiting for, which is
 * exactly the shape a prestige currency wants.
 */
function overshoot(reached: number, bar: number): number {
  if (!(reached >= bar) || bar <= 0) return 0;
  return 1 + Math.log10(Math.max(1, reached / bar));
}

export function moonGain(state: GameState, multiplier = 1): number {
  const past = overshoot(state.runHearts, tideRequirement(state.tideChanges));
  if (past <= 0) return 0;
  const comboBonus = 1 + Math.min(1, state.stats.bestCombo / 400) * 0.3;
  const activeBonus = 1 + Math.min(1, state.stats.heartsFromClicks / Math.max(1, state.runHearts)) * 0.35;
  const creatureBonus = 1 + Math.min(1, Object.keys(state.creatures).length / 14) * 0.25;
  return Math.floor(past * 8 * comboBonus * activeBonus * creatureBonus * multiplier);
}

export function starGain(state: GameState, multiplier = 1): number {
  const past = overshoot(state.eraHearts, waterRequirement(state.newWaters));
  if (past <= 0) return 0;
  const tideBonus = 1 + Math.min(2, state.tideChanges / 20);
  const codexBonus = 1 + Math.min(0.5, state.codex.length / 14);
  return Math.floor(past * 4 * tideBonus * codexBonus * multiplier);
}

export function dropGain(state: GameState, multiplier = 1): number {
  const past = overshoot(state.seaHearts, seaRequirement(state.seas));
  if (past <= 0) return 0;
  const waterBonus = 1 + Math.min(3, state.newWaters / 10);
  const depthBonus = 1 + Math.min(1, state.deepens / 100);
  return Math.floor(past * 3 * waterBonus * depthBonus * multiplier);
}

export interface ResetUpgradeDef {
  id: string;
  name: string;
  description: string;
  currency: CurrencyId;
  baseCost: number;
  growth: number;
  max: number;
  kind: "add" | "mulLinear" | "mulCompound" | "flag";
  stat?: AddStat | MulStat;
  per?: number;
  flag?: string;
  requires?: [string, number];
  /**
   * The upgrades this one grows out of, drawn as branches.
   *
   * The moon, star and drop trees were called trees and were flat scrolling
   * lists: twenty-eight, twenty-one and eighteen entries with no shape at all,
   * so there was no way to see that automating rebirth sits at the end of the
   * line you have been feeding, or that everything comes out of the first two.
   * The shape lives in `RESET_TREE_SHAPE` below rather than inline, because a
   * topology is easier to read and to change as one block than as a field
   * repeated across sixty-six one-line definitions.
   */
  after?: string[];
}

const MOON_RAW: ResetUpgradeDef[] = [
  { id: "m_click", name: "Stronger Taps", description: "Click power, kept through every rebirth.", currency: "moons", baseCost: 1, growth: 1.35, max: 100, kind: "mulLinear", stat: "click", per: 0.25 },
  { id: "m_cps", name: "Steadier Jar", description: "Passive hearts, kept through every rebirth.", currency: "moons", baseCost: 1, growth: 1.35, max: 100, kind: "mulLinear", stat: "cps", per: 0.25 },
  { id: "m_all", name: "Everything At Once", description: "Everything, permanently.", currency: "moons", baseCost: 4, growth: 1.5, max: 60, kind: "mulLinear", stat: "all", per: 0.15 },
  // The one with no ceiling.
  //
  // Every other moon upgrade maxes out, which is deliberate: a capped tree is
  // one you can finish and feel finished. But a game meant to last months
  // needs somewhere for the hundredth rebirth's moons to go, and this is it.
  // Linear in level with a cost that grows twelve percent a step, so it is
  // always worth buying and never runs away.
  { id: "m_forever", name: "Every Life So Far", description: "Everything, a little more, with no limit. Buy it forever.", currency: "moons", baseCost: 30, growth: 1.12, max: Infinity, kind: "mulLinear", stat: "all", per: 0.04 },
  { id: "m_crack", name: "Practised Hands", description: "Otters crack harder in every life.", currency: "moons", baseCost: 3, growth: 1.45, max: 50, kind: "mulLinear", stat: "crackValue", per: 0.2 },
  { id: "m_collect", name: "Worn Path", description: "Crabs collect more in every life.", currency: "moons", baseCost: 3, growth: 1.45, max: 50, kind: "mulLinear", stat: "collectValue", per: 0.2 },
  { id: "m_crit", name: "Sharp Edge", description: "Better criticals from the first tap.", currency: "moons", baseCost: 3, growth: 1.45, max: 40, kind: "add", stat: "critChance", per: 0.01 },
  { id: "m_combo", name: "Warm Start", description: "Start each life with a combo already going.", currency: "moons", baseCost: 2, growth: 1.4, max: 50, kind: "add", stat: "comboStart", per: 4 },
  { id: "m_keep", name: "Muscle Memory", description: "Keep this many levels of every upgrade through a rebirth.", currency: "moons", baseCost: 6, growth: 1.6, max: 25, kind: "add", stat: "startingUpgrades", per: 1 },
  { id: "m_slots", name: "Room To Move", description: "One more creature in the jar.", currency: "moons", baseCost: 15, growth: 2.2, max: 6, kind: "add", stat: "creatureSlots", per: 1 },
  { id: "m_ability", name: "One More Ability", description: "One more ability equipped.", currency: "moons", baseCost: 18, growth: 2.3, max: 3, kind: "add", stat: "abilitySlots", per: 1 },
  { id: "m_offline", name: "Long Night", description: "Collect from more hours away, permanently.", currency: "moons", baseCost: 5, growth: 1.55, max: 40, kind: "add", stat: "offlineHours", per: 1 },
  { id: "m_cost", name: "Cheaper Everything", description: "Everything costs less, in every life.", currency: "moons", baseCost: 10, growth: 1.75, max: 25, kind: "mulLinear", stat: "cost", per: -0.02 },
  { id: "m_creature", name: "Well Fed", description: "Creatures are stronger in every life.", currency: "moons", baseCost: 6, growth: 1.6, max: 40, kind: "mulLinear", stat: "creaturePower", per: 0.15 },
  { id: "m_moons", name: "More Moons", description: "Every future rebirth pays more.", currency: "moons", baseCost: 8, growth: 1.7, max: 40, kind: "mulLinear", stat: "moonGain", per: 0.12 },
  { id: "m_gift", name: "Something For You", description: "What you leave your partner when you are reborn is worth much more.", currency: "moons", baseCost: 12, growth: 1.8, max: 20, kind: "mulLinear", stat: "all", per: 0.05 },
  // Unlocks.
  { id: "m_items", name: "Rocks And Shells", description: "Creatures can carry something.", currency: "moons", baseCost: 10, growth: 1, max: 1, kind: "flag", flag: "items" },
  { id: "m_challenges", name: "Challenges", description: "Runs with a rule attached, and a prize for clearing them.", currency: "moons", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "challenges" },
  { id: "m_auto_buy", name: "Buys For You", description: "Buys the cheapest affordable upgrade on its own.", currency: "moons", baseCost: 25, growth: 1, max: 1, kind: "flag", flag: "auto_buy" },
  { id: "m_auto_feed", name: "Feeds For You", description: "Creatures feed themselves from your shells.", currency: "moons", baseCost: 18, growth: 1, max: 1, kind: "flag", flag: "auto_feed" },
  { id: "m_auto_skill", name: "Fires For You", description: "Abilities can fire themselves once maxed.", currency: "moons", baseCost: 30, growth: 1, max: 1, kind: "flag", flag: "auto_skill" },
  { id: "m_auto_rebirth", name: "Reborn For You", description: "Rebirth happens on its own the moment it is worth it.", currency: "moons", baseCost: 120, growth: 1, max: 1, kind: "flag", flag: "auto_rebirth", requires: ["m_forever", 10] },

  // The jar plays itself harder. These are the line the player keeps feeding,
  // because every level of them is time they no longer have to spend tapping.
  { id: "m_auto_tap", name: "Quick Hands", description: "The jar taps for you more often.", currency: "moons", baseCost: 2, growth: 1.28, max: 200, kind: "add", stat: "autoTapsPerSecond", per: 1 },
  { id: "m_auto_crit", name: "Learns The Rhythm", description: "The taps it makes for you crit far more often.", currency: "moons", baseCost: 6, growth: 1.4, max: 20, kind: "add", stat: "critChance", per: 0.02 },
  { id: "m_autobuyer", name: "Faster Autobuyers", description: "Every autobuyer runs faster.", currency: "moons", baseCost: 5, growth: 1.35, max: 100, kind: "add", stat: "autobuyerSpeed", per: 1 },
  { id: "m_depth", name: "Heavier Chain", description: "Every tier of the chain produces more.", currency: "moons", baseCost: 4, growth: 1.42, max: 100, kind: "mulLinear", stat: "depthPower", per: 0.3 },
  { id: "m_tide_speed", name: "Faster Jar", description: "Everything in the jar moves faster.", currency: "moons", baseCost: 7, growth: 1.5, max: 60, kind: "mulLinear", stat: "tideSpeed", per: 0.2 },
  { id: "m_new_water", name: "Deep Rebirth", description: "Unlocks the rebirth above rebirth. This is what the tree is for.", currency: "moons", baseCost: 250, growth: 1, max: 1, kind: "flag", flag: "new_water", requires: ["m_all", 20] },
];

const STAR_RAW: ResetUpgradeDef[] = [
  { id: "s_all", name: "Everything Rises", description: "Every heart, everywhere.", currency: "stars", baseCost: 1, growth: 1.4, max: 100, kind: "mulLinear", stat: "all", per: 0.4 },
  { id: "s_crack", name: "Old Hands", description: "Otters, far stronger.", currency: "stars", baseCost: 2, growth: 1.45, max: 60, kind: "mulLinear", stat: "crackValue", per: 0.35 },
  { id: "s_collect", name: "Old Paths", description: "Crabs, far stronger.", currency: "stars", baseCost: 2, growth: 1.45, max: 60, kind: "mulLinear", stat: "collectValue", per: 0.35 },
  { id: "s_moons", name: "Richer Rebirths", description: "Rebirths pay far more moons.", currency: "stars", baseCost: 4, growth: 1.55, max: 40, kind: "mulLinear", stat: "moonGain", per: 0.3 },
  { id: "s_keep", name: "Deep Roots", description: "Keep far more through a rebirth.", currency: "stars", baseCost: 8, growth: 1.8, max: 20, kind: "add", stat: "startingUpgrades", per: 5 },
  { id: "s_slots", name: "Open Water", description: "Two more creatures in the jar.", currency: "stars", baseCost: 12, growth: 2.4, max: 4, kind: "add", stat: "creatureSlots", per: 1 },
  { id: "s_offline_cap", name: "Long Away", description: "Far more time away counts.", currency: "stars", baseCost: 6, growth: 1.6, max: 40, kind: "add", stat: "offlineHours", per: 4 },
  { id: "s_offline_rate", name: "Still Working", description: "Time away is worth much more.", currency: "stars", baseCost: 6, growth: 1.6, max: 40, kind: "mulLinear", stat: "offline", per: 0.25 },
  { id: "s_pearls", name: "Pearl Beds", description: "Pearls, far more often.", currency: "stars", baseCost: 5, growth: 1.55, max: 40, kind: "mulLinear", stat: "pearlGain", per: 0.3 },
  { id: "s_glass", name: "Glass Beach", description: "Sea glass, far more often.", currency: "stars", baseCost: 5, growth: 1.55, max: 40, kind: "mulLinear", stat: "glassGain", per: 0.3 },
  { id: "s_tide", name: "Spring Tide", description: "Tide rises far faster for both of you.", currency: "stars", baseCost: 7, growth: 1.6, max: 30, kind: "mulLinear", stat: "tideGain", per: 0.3 },
  { id: "s_cooldown", name: "No Waiting", description: "Abilities come back much sooner.", currency: "stars", baseCost: 9, growth: 1.7, max: 25, kind: "mulLinear", stat: "skillCooldown", per: -0.025 },
  { id: "s_creature_keep", name: "They Stay", description: "Creatures keep their levels through a deep rebirth.", currency: "stars", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "creature_retention" },
  { id: "s_item_keep", name: "Keepsakes", description: "Rocks and shells survive a deep rebirth.", currency: "stars", baseCost: 12, growth: 1, max: 1, kind: "flag", flag: "item_retention" },
  { id: "s_auto_upgrade", name: "It Runs Itself", description: "Buys upgrades continuously.", currency: "stars", baseCost: 20, growth: 1, max: 1, kind: "flag", flag: "auto_upgrade" },
  { id: "s_ocean", name: "The Ocean", description: "Unlocks the last vessel.", currency: "stars", baseCost: 40, growth: 1, max: 1, kind: "flag", flag: "ocean" },
  { id: "s_auto_tap", name: "Never Stops", description: "The jar taps far, far more often.", currency: "stars", baseCost: 3, growth: 1.45, max: 100, kind: "add", stat: "autoTapsPerSecond", per: 25 },
  { id: "s_depth", name: "Pressure", description: "Every depth, far stronger.", currency: "stars", baseCost: 3, growth: 1.5, max: 100, kind: "mulLinear", stat: "depthPower", per: 1 },
  { id: "s_autobuyer", name: "It Never Sleeps", description: "Autobuyers run many times faster.", currency: "stars", baseCost: 6, growth: 1.5, max: 100, kind: "add", stat: "autobuyerSpeed", per: 20 },
  { id: "s_deepen", name: "Further Down", description: "Deepening pays much more.", currency: "stars", baseCost: 10, growth: 1.7, max: 40, kind: "mulLinear", stat: "deepenGain", per: 0.25 },
  { id: "s_stars", name: "More Stars", description: "Every deep rebirth pays more.", currency: "stars", baseCost: 30, growth: 2, max: 25, kind: "mulLinear", stat: "starGain", per: 0.2 },
];


export function resetUpgradeMods(def: ResetUpgradeDef, level: number): Mods {
  if (level <= 0 || def.kind === "flag" || !def.stat || !def.per) return {};
  if (def.kind === "add") return { add: { [def.stat as AddStat]: def.per * level } };
  if (def.kind === "mulLinear") return { mul: { [def.stat as MulStat]: 1 + def.per * level } };
  return { mul: { [def.stat as MulStat]: Math.pow(1 + def.per, level) } };
}

export function resetUpgradeCost(def: ResetUpgradeDef, level: number): number {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

/**
 * The drop tree, which is the only place the shape of the game changes rather
 * than its numbers: it lengthens the chain, automates the inner loop, and
 * removes the ceilings the layers above it live under.
 */
const DROP_RAW: ResetUpgradeDef[] = [
  { id: "d_all", name: "The Whole Sea", description: "Everything, everywhere.", currency: "drops", baseCost: 1, growth: 1.5, max: 200, kind: "mulLinear", stat: "all", per: 1 },
  { id: "d_depth", name: "Deep Pressure", description: "Every depth, enormously stronger.", currency: "drops", baseCost: 2, growth: 1.5, max: 200, kind: "mulLinear", stat: "depthPower", per: 3 },
  { id: "d_tide", name: "The Long Pull", description: "Everything moves far faster.", currency: "drops", baseCost: 3, growth: 1.55, max: 100, kind: "mulLinear", stat: "tideSpeed", per: 1 },
  { id: "d_tap", name: "Countless Hands", description: "The jar taps for you constantly.", currency: "drops", baseCost: 2, growth: 1.45, max: 200, kind: "add", stat: "autoTapsPerSecond", per: 500 },
  { id: "d_autobuyer", name: "Tireless", description: "Autobuyers run as fast as the game ticks.", currency: "drops", baseCost: 4, growth: 1.5, max: 200, kind: "add", stat: "autobuyerSpeed", per: 100 },
  { id: "d_moons", name: "Bright Moons", description: "Rebirths pay vastly more.", currency: "drops", baseCost: 6, growth: 1.6, max: 100, kind: "mulLinear", stat: "moonGain", per: 1 },
  { id: "d_stars", name: "Whole Sky", description: "Deep rebirths pay vastly more.", currency: "drops", baseCost: 8, growth: 1.6, max: 100, kind: "mulLinear", stat: "starGain", per: 1 },
  { id: "d_drops", name: "It Rains", description: "Every last rebirth pays more.", currency: "drops", baseCost: 12, growth: 1.7, max: 60, kind: "mulLinear", stat: "dropGain", per: 0.5 },
  { id: "d_deepen", name: "No Bottom", description: "Deepening pays far more.", currency: "drops", baseCost: 10, growth: 1.65, max: 60, kind: "mulLinear", stat: "deepenGain", per: 1 },
  { id: "d_offline", name: "It Keeps Going", description: "Far more time away counts, and it counts for more.", currency: "drops", baseCost: 5, growth: 1.5, max: 80, kind: "add", stat: "offlineHours", per: 12 },

  // The four that lengthen the chain. This is what the layer is for.
  { id: "d_depth_1", name: "One More Tier", description: "The chain gets one rung longer.", currency: "drops", baseCost: 25, growth: 1, max: 1, kind: "add", stat: "extraDepths", per: 1 },
  { id: "d_depth_2", name: "Another Tier", description: "And another rung below that.", currency: "drops", baseCost: 60, growth: 1, max: 1, kind: "add", stat: "extraDepths", per: 1, requires: ["d_depth_1", 1] },
  { id: "d_depth_3", name: "Deeper Still", description: "One more again.", currency: "drops", baseCost: 150, growth: 1, max: 1, kind: "add", stat: "extraDepths", per: 1, requires: ["d_depth_2", 1] },
  { id: "d_depth_4", name: "The Last Tier", description: "The last rung there is.", currency: "drops", baseCost: 400, growth: 1, max: 1, kind: "add", stat: "extraDepths", per: 1, requires: ["d_depth_3", 1] },

  { id: "d_auto_deepen", name: "It Deepens Itself", description: "The jar goes deeper on its own the moment it can.", currency: "drops", baseCost: 40, growth: 1, max: 1, kind: "flag", flag: "auto_deepen" },
  { id: "d_auto_tide", name: "It Turns Itself", description: "Rebirth happens on its own.", currency: "drops", baseCost: 120, growth: 1, max: 1, kind: "flag", flag: "auto_tide" },
  { id: "d_keep_depths", name: "What The Water Remembers", description: "Deepenings survive a deep rebirth.", currency: "drops", baseCost: 80, growth: 1, max: 1, kind: "flag", flag: "keep_deepens" },
];

/* ------------------------------------------------------------------ */
/* The shape of the three reset trees                                  */
/* ------------------------------------------------------------------ */

/**
 * What grows out of what. Anything not listed here is a root.
 *
 * Drawing only, exactly like the hearts trees: `requires` is what actually
 * gates a purchase, and where both exist they agree. A tree whose far end you
 * cannot see is a tree you cannot plan in, so the shape describes the route
 * without closing it off.
 */
const RESET_TREE_SHAPE: Record<string, string[]> = {
  // Moons. Two trunks, taps and passive, and everything general comes out of
  // the point where they meet.
  m_all: ["m_click", "m_cps"],
  m_forever: ["m_all"],
  m_crit: ["m_click"],
  m_combo: ["m_crit"],
  m_crack: ["m_click"],
  m_collect: ["m_cps"],
  m_creature: ["m_crack", "m_collect"],
  m_slots: ["m_creature"],
  m_items: ["m_creature"],
  m_ability: ["m_all"],
  m_keep: ["m_all"],
  m_cost: ["m_all"],
  m_moons: ["m_forever"],
  m_gift: ["m_moons"],
  m_offline: ["m_cps"],
  m_auto_tap: ["m_click"],
  m_auto_crit: ["m_auto_tap", "m_crit"],
  m_auto_buy: ["m_all"],
  m_autobuyer: ["m_auto_buy"],
  m_auto_feed: ["m_slots"],
  m_auto_skill: ["m_ability"],
  m_auto_rebirth: ["m_forever", "m_auto_buy"],
  m_depth: ["m_cps"],
  m_tide_speed: ["m_depth"],
  m_challenges: ["m_keep"],
  m_new_water: ["m_all", "m_forever"],

  // Stars. One trunk, because by here the player knows what a tree is.
  s_crack: ["s_all"],
  s_collect: ["s_all"],
  s_moons: ["s_all"],
  s_creature_keep: ["s_crack", "s_collect"],
  s_item_keep: ["s_creature_keep"],
  s_slots: ["s_creature_keep"],
  s_keep: ["s_moons"],
  s_stars: ["s_moons"],
  s_offline_cap: ["s_all"],
  s_offline_rate: ["s_offline_cap"],
  s_pearls: ["s_crack"],
  s_glass: ["s_collect"],
  s_tide: ["s_all"],
  s_cooldown: ["s_tide"],
  s_auto_upgrade: ["s_keep"],
  s_auto_tap: ["s_auto_upgrade"],
  s_autobuyer: ["s_auto_upgrade"],
  s_depth: ["s_all"],
  s_deepen: ["s_depth"],
  s_ocean: ["s_depth", "s_stars"],

  // Drops. The chain lengthens down one side and the automation down the
  // other, and the last two rungs need both.
  d_depth: ["d_all"],
  d_depth_1: ["d_depth"],
  d_depth_2: ["d_depth_1"],
  d_depth_3: ["d_depth_2"],
  d_depth_4: ["d_depth_3"],
  d_tide: ["d_all"],
  d_tap: ["d_all"],
  d_autobuyer: ["d_tap"],
  d_moons: ["d_all"],
  d_stars: ["d_moons"],
  d_drops: ["d_stars"],
  d_deepen: ["d_depth"],
  d_offline: ["d_all"],
  d_auto_deepen: ["d_deepen", "d_autobuyer"],
  d_auto_tide: ["d_tide", "d_autobuyer"],
  d_keep_depths: ["d_depth_4", "d_auto_deepen"],
};

function shaped(list: ResetUpgradeDef[]): ResetUpgradeDef[] {
  return list.map((def) => ({ ...def, after: RESET_TREE_SHAPE[def.id] ?? [] }));
}

export const MOON_UPGRADES: ResetUpgradeDef[] = shaped(MOON_RAW);
export const STAR_UPGRADES: ResetUpgradeDef[] = shaped(STAR_RAW);
export const DROP_UPGRADES: ResetUpgradeDef[] = shaped(DROP_RAW);

export const RESET_UPGRADE_BY_ID: Record<string, ResetUpgradeDef> = Object.fromEntries(
  [...MOON_UPGRADES, ...STAR_UPGRADES, ...DROP_UPGRADES].map((u) => [u.id, u]),
);

export const RESET_LAYERS: ResetLayerDef[] = [
  {
    id: "tide",
    name: "Rebirth",
    verb: "Be reborn",
    currency: "moons",
    blurb: "Empty the jar and start again, stronger. This is the loop the whole game runs on.",
    requirement: TIDE_REQUIREMENT,
    gain: moonGain,
    resets: [
      "Hearts in the jar, and this life's total",
      "The whole chain, and every deepening",
      "Everything you bought with hearts, including speed",
      "Every upgrade in your tree, minus what Muscle Memory keeps",
      "Your combo, and the vessel",
    ],
    keeps: [
      "Moons, and everything you spend them on",
      "Every creature, their levels, names and what they carry",
      "The codex, collections and cosmetics",
      "Tide, and everything in the Us tree",
      "Everything in the rest of the app",
    ],
  },
  {
    id: "water",
    name: "Deep Rebirth",
    verb: "Go deeper",
    currency: "stars",
    blurb: "A rebirth of the rebirths. Rare, and worth it.",
    requirement: WATER_REQUIREMENT,
    gain: starGain,
    resets: [
      "Everything an ordinary rebirth takes",
      "Moons and every moon upgrade",
      "Your rebirth count, back to nothing",
      "Creature levels, unless you own They Stay",
      "Rocks and shells, unless you own Keepsakes",
    ],
    keeps: [
      "Stars and star upgrades",
      "The codex. Every creature you have ever met stays met",
      "Collections, cosmetics and names",
      "Lifetime statistics and records",
      "Question history and everything else in the app",
    ],
  },
  {
    id: "sea",
    name: "Last Rebirth",
    verb: "Let it all go",
    currency: "drops",
    blurb: "There was never a jar. There was only ever this.",
    requirement: SEA_REQUIREMENT,
    gain: dropGain,
    resets: [
      "Everything a deep rebirth takes",
      "Moons, stars, and both of their trees",
      "Every rebirth, deep or otherwise, that you have done",
    ],
    keeps: [
      "Drops and the drop tree",
      "Creatures, the codex, collections and cosmetics",
      "Memories, and everything the two of you did together",
      "Achievements, statistics and the old jar",
    ],
  },
];
