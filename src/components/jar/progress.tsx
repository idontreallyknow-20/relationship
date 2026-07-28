"use client";

// Upgrades and abilities.

import { useMemo, useState } from "react";
import { Lock, Zap } from "lucide-react";
import { useGame } from "@/game/store";
import { TREES, nextEffectLabel, type Tree, type UpgradeDef } from "@/game/config/upgrades";
import { SKILLS, skillCost } from "@/game/config/skills";
import { CURRENCY_BY_ID } from "@/game/config/currencies";
import {
  hasFlag, maxAffordable, meetsUnlock, resolveBuyCount, upgradeCost, visibleUpgrades,
} from "@/game/formulas";
import { buyUpgrade, levelSkill, toggleSkillAuto } from "@/game/actions";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import type { GameSettings } from "@/game/types";
import { Button, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { Bar, EmptyRow, LockedRow, Section } from "./bits";

const BUY_OPTIONS = [
  { value: "1", label: "x1" },
  { value: "10", label: "x10" },
  { value: "25", label: "x25" },
  { value: "100", label: "x100" },
  { value: "max", label: "Max" },
];

export function UpgradesTab() {
  const { state, derived, mutate, version } = useGame();
  const toast = useToast();
  const [tree, setTree] = useState<Tree>(state.owner === "joseph" ? "joseph" : "cami");
  // Yours and the shared one. Theirs is theirs.
  const trees = TREES.filter((entry) => entry.id === state.owner || entry.id === "us");
  const [detail, setDetail] = useState<UpgradeDef | null>(null);
  const format = state.settings.numberFormat;
  const bulk = hasFlag(state, "bulk");

  const rows = useMemo(
    () =>
      visibleUpgrades(state)
        .filter((def) => def.tree === tree)
        .map((def) => {
          const owned = state.upgrades[def.id] ?? 0;
          const unlocked = meetsUnlock(state, def.unlock);
          const count = Math.max(1, resolveBuyCount(state, def, derived));
          const cost = upgradeCost(state, def, count, derived);
          return {
            def, owned, unlocked, count, cost,
            affordable: unlocked && state.wallet[def.currency] >= cost && count > 0,
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, tree],
  );

  const meta = TREES.find((t) => t.id === tree);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {trees.map((entry) => {
          return (
            <button
              key={entry.id}
              onClick={() => setTree(entry.id)}
              className={`pressable flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                tree === entry.id ? "border-plum bg-plum text-white" : "border-line bg-white text-berry-soft"
              }`}
            >
              {entry.name}
            </button>
          );
        })}
      </div>

      {meta && <p className="text-sm text-berry-soft">{meta.blurb}</p>}

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-berry-soft">Buy</span>
        <SegmentedControl
          label="Purchase amount"
          value={String(state.settings.buyAmount)}
          onChange={(value) =>
            mutate((draft) => {
              if (value !== "1" && !bulk) {
                toast("Handfuls is a moon upgrade");
                return;
              }
              draft.settings.buyAmount = (value === "max" ? "max" : Number(value)) as GameSettings["buyAmount"];
            })
          }
          options={BUY_OPTIONS}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyRow>Nothing here yet.</EmptyRow>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ def, owned, unlocked, count, cost, affordable }) => {
            const atMax = def.max !== Infinity && owned >= def.max;
            const currency = CURRENCY_BY_ID[def.currency];
            return (
              <li
                key={def.id}
                className={`rounded-card border bg-white shadow-soft ${unlocked ? "border-line" : "border-line-soft opacity-70"}`}
              >
                <div className="flex items-start gap-2 p-3.5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setDetail(def)}>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                      {!unlocked && <Lock className="h-3.5 w-3.5 shrink-0 text-berry-soft" />}
                      <span className="truncate">{def.name}</span>
                      <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[0.6rem] font-bold text-berry-soft">
                        {owned}{def.max !== Infinity ? `/${def.max}` : ""}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-berry-soft">{def.description}</p>
                    <p className="mt-1 text-xs font-semibold" style={{ color: currency?.color }}>
                      {atMax ? "Maxed" : nextEffectLabel(def)}
                    </p>
                  </button>

                  {!atMax && (
                    <button
                      disabled={!affordable}
                      onClick={() =>
                        mutate((draft) => {
                          const result = buyUpgrade(draft, def.id, count);
                          if (!result.ok) toast(result.message ?? "Cannot buy that");
                          else if (result.message) toast(result.message);
                        })
                      }
                      className={`pressable shrink-0 rounded-xl px-3 py-2 text-center ${
                        affordable ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                      }`}
                    >
                      <span className="block text-xs font-bold">{formatNumber(cost, format)}</span>
                      <span className="block text-[0.6rem] opacity-80">
                        {count > 1 ? `x${count}` : currency?.short.toLowerCase()}
                      </span>
                    </button>
                  )}
                </div>
                {def.max !== Infinity && (
                  <div className="px-3.5 pb-2.5">
                    <Bar value={owned} max={def.max} height="0.25rem" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {detail && <UpgradeDetail def={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function UpgradeDetail({ def, onClose }: { def: UpgradeDef; onClose: () => void }) {
  const { state, derived } = useGame();
  const owned = state.upgrades[def.id] ?? 0;
  const format = state.settings.numberFormat;

  return (
    <Sheet open onClose={onClose} title={def.name}>
      <div className="space-y-4 pt-1">
        <p className="text-sm text-berry">{def.description}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Tree" value={TREES.find((t) => t.id === def.tree)?.name ?? def.tree} />
          <Row label="Level" value={`${owned}${def.max !== Infinity ? ` of ${def.max}` : ""}`} />
          <Row label="Currency" value={CURRENCY_BY_ID[def.currency]?.name ?? def.currency} />
          <Row label="Next" value={nextEffectLabel(def)} />
          <Row label="Cost" value={formatNumber(upgradeCost(state, def, 1, derived), format)} />
          <Row label="Affordable" value={`${maxAffordable(state, def, derived)}`} />
        </dl>
        {def.milestones && (
          <p className="rounded-xl bg-blush/50 px-3.5 py-2.5 text-sm text-berry">
            Milestones at {def.milestones.join(", ")}, each an extra boost to everything.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <dt className="text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</dt>
      <dd className="truncate font-semibold text-berry">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Abilities                                                           */
/* ------------------------------------------------------------------ */

export function AbilitiesTab() {
  const { state, derived, mutate, version } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;
  const auto = hasFlag(state, "auto_skill");

  const rows = useMemo(
    () =>
      SKILLS.map((def) => {
        const skill = state.skills[def.id] ?? { level: 0, lastUsedAt: 0, activeUntil: 0, auto: false };
        return {
          def,
          skill,
          unlocked: meetsUnlock(state, def.unlock),
          cost: skillCost(def, skill.level),
          cooldown: def.cooldownMs * derived.skillCooldown,
          duration: def.durationMs * derived.skillDuration,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <div className="flex flex-col gap-4">
      <Section title="Abilities" hint={`${formatNumber(state.wallet.pearls, format)} pearls`}>
        <p className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-berry-soft">
          Pearls come out of shells the otters crack.
        </p>
      </Section>

      <ul className="flex flex-col gap-2">
        {rows.map(({ def, skill, unlocked, cost, cooldown, duration }) => {
          if (!unlocked && skill.level === 0) {
            return (
              <li key={def.id}>
                <LockedRow
                  title={def.name}
                  hint={
                    def.unlock.lifetimeHearts
                      ? `At ${formatNumber(def.unlock.lifetimeHearts, format)} lifetime hearts`
                      : def.unlock.tideChanges
                        ? `After ${def.unlock.tideChanges} tide changes`
                        : `After ${def.unlock.newWaters} changes of water`
                  }
                />
              </li>
            );
          }
          const affordable = state.wallet.pearls >= cost && skill.level < def.maxLevel;
          return (
            <li key={def.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
              <div className="flex items-start gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-dark">
                  <Zap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                    <span className="truncate">{def.name}</span>
                    <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[0.6rem] font-bold text-berry-soft">
                      {skill.level}/{def.maxLevel}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-berry-soft">{def.description}</p>
                  <p className="mt-1 text-[0.65rem] text-berry-soft">
                    Every {formatDurationShort(cooldown)}
                    {duration > 0 && `, lasts ${formatDurationShort(duration)}`}
                  </p>
                </div>
                <button
                  disabled={!affordable}
                  onClick={() =>
                    mutate((draft) => {
                      const result = levelSkill(draft, def.id);
                      if (result.message) toast(result.message);
                    })
                  }
                  className={`pressable shrink-0 rounded-xl px-3 py-2 text-center ${
                    affordable ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                  }`}
                >
                  <span className="block text-xs font-bold">{skill.level >= def.maxLevel ? "Max" : cost}</span>
                  {skill.level < def.maxLevel && <span className="block text-[0.6rem] opacity-80">pearls</span>}
                </button>
              </div>

              {skill.level > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Bar value={skill.level} max={def.maxLevel} height="0.25rem" />
                  {auto && skill.level >= def.autoLevel && (
                    <button
                      role="switch"
                      aria-checked={skill.auto}
                      onClick={() =>
                        mutate((draft) => {
                          const result = toggleSkillAuto(draft, def.id);
                          if (result.message) toast(result.message);
                        })
                      }
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6rem] font-bold ${
                        skill.auto ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                      }`}
                    >
                      {skill.auto ? "Auto on" : "Auto off"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {auto && (
        <Button
          variant="secondary"
          onClick={() => mutate((draft) => void (draft.settings.autoSkills = !draft.settings.autoSkills))}
        >
          {state.settings.autoSkills ? "Turn automation off" : "Turn automation on"}
        </Button>
      )}
    </div>
  );
}
