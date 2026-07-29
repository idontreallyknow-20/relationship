"use client";

// Upgrades and abilities.

import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { useNames } from "@/lib/couple-context";
import { useGame } from "@/game/store";
import { TREES, type Tree } from "@/game/config/upgrades";
import { SKILLS, skillCost } from "@/game/config/skills";
import { hasFlag, meetsUnlock } from "@/game/formulas";
import { buyCheapest, buyUpgrade, levelSkill, toggleSkillAuto } from "@/game/actions";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import type { GameSettings } from "@/game/types";
import { Button, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { Bar, LockedRow, Section } from "./bits";
import { Explain } from "./explain";
import { UpgradeRows } from "./upgrade-rows";

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
  const names = useNames();
  const [tree, setTree] = useState<Tree>(state.owner === "joseph" ? "joseph" : "cami");
  /** Two of the three trees are people, and people have names. */
  const treeName = (id: Tree) => (id === "us" ? "Us" : names[id]);
  // Yours and the shared one. Theirs is theirs.
  const trees = TREES.filter((entry) => entry.id === state.owner || entry.id === "us");


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
              {treeName(entry.id)}
            </button>
          );
        })}
      </div>

      {meta && (
        <div className="flex items-start gap-1.5">
          <p className="flex-1 text-sm text-berry-soft">{meta.blurb}</p>
          <Explain title="Your upgrades">
            <p>
              They are listed in the order they grow out of each other, so anything
              above a row is something that row builds on.
            </p>
            <p>
              You can still buy any of them in any order. Tap a row to see what it
              grows out of and what it leads to.
            </p>
            <p>
              These are yours. {names[state.owner === "cami" ? "joseph" : "cami"]}{" "}
              has their own, and neither of you can spend into the other one.
            </p>
          </Explain>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-berry-soft">Buy</span>
        <SegmentedControl
          label="Purchase amount"
          value={String(state.settings.buyAmount)}
          onChange={(value) =>
            mutate((draft) => {
              draft.settings.buyAmount = (value === "max" ? "max" : Number(value)) as GameSettings["buyAmount"];
            })
          }
          options={BUY_OPTIONS}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            mutate((draft) => {
              // Keeps buying the cheapest thing it can until it cannot. Always
              // here, never something to unlock: it is a shortcut for pressing
              // a button, not a power.
              let bought = 0;
              for (let i = 0; i < 200; i++) {
                if (!buyCheapest(draft).ok) break;
                bought += 1;
              }
              toast(bought > 0 ? `Bought ${bought}` : "Nothing affordable");
            })
          }
          className="pressable shrink-0 whitespace-nowrap rounded-full border border-plum bg-plum px-3.5 py-2 text-xs font-semibold text-white"
        >
          Buy all
        </button>
      </div>

      <UpgradeRows tree={tree} />
    </div>
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
      <Section
        title="Abilities"
        explain="abilities"
        hint={`${formatNumber(state.wallet.ribbons, format)} ribbons to spend`}
      >
        <p className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm leading-relaxed text-berry-soft">
          Bought with the ribbons you get for sealing a full jar. Each one is
          fired by hand and then rests for a while. Half apply an effect for a
          few seconds, half go off once and are done.
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
                        ? `After ${def.unlock.tideChanges} rebirths`
                        : `After ${def.unlock.newWaters} ascensions`
                  }
                />
              </li>
            );
          }
          const affordable = state.wallet.ribbons >= cost && skill.level < def.maxLevel;
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
                  {skill.level < def.maxLevel && <span className="block text-[0.6rem] opacity-80">ribbons</span>}
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
