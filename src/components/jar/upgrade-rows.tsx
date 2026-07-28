"use client";

// Every set of upgrades, turned into rows for one shared list.
//
// This file is only the translation from a config entry into something the list
// can draw: costs, affordability, colour and the one line that says what buying
// it does. Eight sets go through it, and there was never a reason for them to
// be eight different screens.

import { useMemo } from "react";
import { useGame } from "@/game/store";
import { UPGRADES, nextEffectLabel, parentsOf, type Tree } from "@/game/config/upgrades";
import {
  SUN_UPGRADES, MOON_UPGRADES, STAR_UPGRADES,
  resetUpgradeCost, type ResetUpgradeDef,
} from "@/game/config/resets";
import { CURRENCY_BY_ID } from "@/game/config/currencies";
import { buyableTree, meetsUnlock, resolveBuyCount, upgradeCost } from "@/game/formulas";
import { buyResetUpgrade, buyShelfUpgrade, buyUpgrade } from "@/game/actions";
import { SHELF_UPGRADES, shelfUpgradeCost } from "@/game/config/shelf";
import { STAT_LABEL } from "@/game/config/upgrades";
import { useToast } from "@/components/ui";
import { UpgradeList, type UpgradeRow } from "./upgrade-list";

/** Why a node is not buyable yet, in words rather than a padlock. */
function lockReason(rule: { lifetimeHearts?: number; tideChanges?: number; newWaters?: number } | undefined): string {
  if (!rule) return "Not yet";
  if (rule.newWaters) return `${rule.newWaters} deep rebirths`;
  if (rule.tideChanges) return `${rule.tideChanges} rebirths`;
  if (rule.lifetimeHearts) return "Further in";
  return "Not yet";
}

export function UpgradeRows({ tree }: { tree: Tree }) {
  const { state, derived, mutate, version } = useGame();
  const toast = useToast();

  const nodes = useMemo<UpgradeRow[]>(() => {
    const defs = UPGRADES.filter((u) => u.tree === tree && buyableTree(state, u));
    const present = new Set(defs.map((d) => d.id));

    return defs.map((def) => {
      const level = state.upgrades[def.id] ?? 0;
      const unlocked = meetsUnlock(state, def.unlock);
      const atMax = def.max !== Infinity && level >= def.max;
      const count = Math.max(1, resolveBuyCount(state, def, derived));
      const cost = upgradeCost(state, def, count, derived);
      return {
        id: def.id,
        after: parentsOf(def).filter((p) => present.has(p)),
        name: def.name,
        effect: nextEffectLabel(def),
        description: def.description,
        level,
        max: def.max,
        cost,
        buyCount: count,
        currencyShort: CURRENCY_BY_ID[def.currency]?.short ?? "",
        colour: CURRENCY_BY_ID[def.currency]?.color ?? "var(--color-rose-dark)",
        unlocked,
        affordable: unlocked && !atMax && state.wallet[def.currency] >= cost,
        lockReason: lockReason(def.unlock),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, version]);

  return (
    <UpgradeList
      rows={nodes}
      format={state.settings.numberFormat}
      onBuy={(id) =>
        mutate((draft) => {
          const def = UPGRADES.find((u) => u.id === id);
          if (!def) return;
          const result = buyUpgrade(draft, id, Math.max(1, resolveBuyCount(draft, def, derived)));
          if (!result.ok) toast(result.message ?? "Cannot buy that");
          else if (result.message) toast(result.message);
        })
      }
    />
  );
}

const RESET_TREES: Record<string, ResetUpgradeDef[]> = {
  moons: MOON_UPGRADES,
  stars: STAR_UPGRADES,
  suns: SUN_UPGRADES,
};

/** One short line describing what the next level of a reset upgrade does. */
function resetEffect(def: ResetUpgradeDef): string {
  if (def.kind === "flag") return "Unlocks it, once.";
  const stat = STAT_LABEL[def.stat!] ?? def.stat ?? "";
  if (def.kind === "add") return `+${(def.per ?? 0).toLocaleString()} ${stat}`;
  const pct = Math.abs((def.per ?? 0) * 100);
  const sign = (def.per ?? 0) < 0 ? "-" : "+";
  return `${sign}${pct.toFixed(pct < 1 ? 2 : 0)}% ${stat}${def.kind === "mulCompound" ? ", compounding" : ""}`;
}

export function ResetUpgradeRows({ currency }: { currency: "moons" | "stars" | "suns" }) {
  const { state, mutate, version } = useGame();
  const toast = useToast();
  const defs = RESET_TREES[currency] ?? [];

  const levels = currency === "moons"
    ? state.moonUpgrades
    : currency === "stars"
      ? state.starUpgrades
      : state.sunUpgrades;

  const nodes = useMemo<UpgradeRow[]>(() => {
    const present = new Set(defs.map((d) => d.id));
    return defs.map((def) => {
      const level = levels[def.id] ?? 0;
      const atMax = def.max !== Infinity && level >= def.max;
      const cost = resetUpgradeCost(def, level);
      // `requires` is the real gate; the drawn line agrees with it.
      const need = def.requires;
      const unlocked = !need || (levels[need[0]] ?? 0) >= need[1];
      return {
        id: def.id,
        after: (def.after ?? []).filter((p) => present.has(p)),
        name: def.name,
        effect: resetEffect(def),
        description: def.description,
        level,
        max: def.max,
        cost,
        buyCount: 1,
        currencyShort: CURRENCY_BY_ID[def.currency]?.short ?? "",
        colour: CURRENCY_BY_ID[def.currency]?.color ?? "var(--color-lavender-deep)",
        unlocked,
        affordable: unlocked && !atMax && state.wallet[def.currency] >= cost,
        lockReason: need ? `Needs ${defs.find((d) => d.id === need[0])?.name ?? need[0]}` : "Not yet",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, version]);

  return (
    <UpgradeList
      rows={nodes}
      format={state.settings.numberFormat}
      onBuy={(id) =>
        mutate((draft) => {
          const result = buyResetUpgrade(draft, id);
          if (!result.ok) toast(result.message ?? "Cannot buy that");
          else if (result.message) toast(result.message);
        })
      }
    />
  );
}


/**
 * The shelf tree, bought with ribbons.
 *
 * Same canvas as the other seven. Every node here is about the loop it sits
 * in, making sealing pay more, the shelf pay faster, or the next jar arrive
 * sooner; a tree whose nodes could have gone in any other tree is a tree with
 * no reason to exist.
 */
export function ShelfUpgradeRows() {
  const { state, mutate, version } = useGame();
  const toast = useToast();

  const nodes = useMemo<UpgradeRow[]>(() => {
    const present = new Set(SHELF_UPGRADES.map((d) => d.id));
    return SHELF_UPGRADES.map((def) => {
      const level = state.shelfUpgrades[def.id] ?? 0;
      const atMax = def.max !== Infinity && level >= def.max;
      const cost = shelfUpgradeCost(def, level);
      return {
        id: def.id,
        after: (def.after ?? []).filter((p) => present.has(p)),
        name: def.name,
        effect: def.description,
        description: def.description,
        level,
        max: def.max,
        cost,
        buyCount: 1,
        currencyShort: CURRENCY_BY_ID.ribbons?.short ?? "",
        colour: CURRENCY_BY_ID.ribbons?.color ?? "var(--color-rose-dark)",
        unlocked: true,
        affordable: !atMax && state.wallet.ribbons >= cost,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return (
    <UpgradeList
      rows={nodes}
      format={state.settings.numberFormat}
      onBuy={(id) =>
        mutate((draft) => {
          const result = buyShelfUpgrade(draft, id);
          if (!result.ok) toast(result.message ?? "Cannot buy that");
          else if (result.message) toast(result.message);
        })
      }
    />
  );
}
