"use client";

// Time dilation, which is one switch and nine upgrades.
//
// The screen is deliberately plainer than every other tab in the game. By the
// time anybody sees this they have read a great many upgrade lists, and what
// this layer needs is for the switch and its consequence to be unmissable.

import { useState } from "react";
import { Hourglass } from "lucide-react";
import { useGame } from "@/game/store";
import {
  DILATION_UPGRADES, MAX_DILATION_POWER, dilationRequirement, dilationUpgradeCost,
} from "@/game/config/dilation";
import {
  buyDilationUpgrade, dilationPreview, dilationUnlocked, enterDilation, leaveDilation,
} from "@/game/actions";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { Bar, Section } from "./bits";
import { Explain } from "./explain";
import { CurrencyIcon } from "./currency-icons";

export function DilationTab() {
  const { state, derived, mutate, now, notify } = useGame();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const format = state.settings.numberFormat;

  const unlocked = dilationUnlocked(state);
  const active = state.dilation.active;
  const requirement = dilationRequirement(state.dilation.runs);
  const hours = dilationPreview(state);
  const power = derived.dilationPower;

  return (
    <div className="flex flex-col gap-4">
      <div
        // Remounting on the switch replays the reveal, so turning dilation on
        // is something that visibly happens rather than a label changing.
        key={active ? "on" : "off"}
        className={`reveal rounded-card border p-4 shadow-soft ${
          active ? "border-lavender-deep bg-lavender/20" : "border-line bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lavender/40 text-plum">
            <Hourglass className={`h-5 w-5${active ? " tier-tick" : ""}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold text-plum">Time dilation</p>
            <p className="text-xs text-berry-soft">
              {active ? "The jar is running slowly." : "The jar is running normally."}
            </p>
          </div>
          <Explain title="Time dilation">
            <p>
              While it is on, everything the jar produces is raised to a power below one.
              A million becomes about eight thousand. A trillion becomes about ten million.
            </p>
            <p>
              That is a small penalty when your numbers are small and a brutal one when they
              are large, which is the point: it is the only mechanic here that gets easier the
              more you have invested in it.
            </p>
            <p>
              Get far enough while it is on and leaving pays hours. Hours buy the tree below,
              and the first thing in it makes dilation itself cost you less.
            </p>
            <p>
              You can switch it off at any time. Leaving early pays nothing and costs nothing.
            </p>
          </Explain>
        </div>

        {!unlocked ? (
          <p className="mt-3 rounded-xl bg-cream px-3.5 py-2.5 text-sm text-berry-soft">
            Let the sea go once first. Dilation is worse than not having it until you have
            spent a while on the tree it pays for, so it waits until you have done a last
            rebirth and know what a reset is for.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Box label="Everything, to the power" value={power.toFixed(3)} />
              <Box
                label="Ceiling"
                value={power >= MAX_DILATION_POWER ? "reached" : MAX_DILATION_POWER.toFixed(2)}
              />
              <Box label="Stretches done" value={`${state.dilation.runs}`} />
              <Box
                label="This stretch"
                value={active ? formatDurationShort(now - state.dilation.startedAt) : "not running"}
              />
            </div>

            {active && (
              <div className="mt-3 space-y-1">
                <div className="flex items-baseline justify-between text-xs text-berry-soft">
                  <span>Hearts while dilated</span>
                  <span>
                    {formatNumber(state.dilation.hearts, format)} / {formatNumber(requirement, format)}
                  </span>
                </div>
                <Bar
                  value={state.dilation.hearts}
                  max={requirement}
                  label="Progress through this dilated stretch"
                />
                <p className="pt-1 text-xs font-semibold text-plum">
                  Leaving now pays {formatNumber(hours, format)} hours
                </p>
              </div>
            )}

            <Button
              className="mt-3 w-full"
              variant={active ? "secondary" : "primary"}
              onClick={() => {
                if (active) setConfirming(true);
                else {
                  mutate((draft) => {
                    const result = enterDilation(draft, Date.now());
                    toast(result.message ?? "Cannot do that");
                  });
                }
              }}
            >
              {active ? "Come back out" : "Slow the jar down"}
            </Button>
          </>
        )}
      </div>

      <Section
        title="The hours tree"
        hint={`${formatNumber(state.wallet.hours, format)} hours to spend`}
      >
        <ul className="flex flex-col gap-2">
          {DILATION_UPGRADES.map((def) => {
            const level = state.dilationUpgrades[def.id] ?? 0;
            const atMax = level >= def.max;
            const cost = dilationUpgradeCost(def, level);
            const blocked = def.requires && (state.dilationUpgrades[def.requires[0]] ?? 0) < def.requires[1];
            const affordable = !atMax && !blocked && state.wallet.hours >= cost;

            return (
              <li key={def.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                      <span className="truncate">{def.name}</span>
                      <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[0.6rem] font-bold text-berry-soft">
                        {level}/{def.max}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-berry-soft">{def.description}</p>
                    {blocked && def.requires && (
                      <p className="mt-1 text-xs font-semibold text-berry-soft">
                        Needs {DILATION_UPGRADES.find((u) => u.id === def.requires![0])?.name} at{" "}
                        {def.requires[1]}
                      </p>
                    )}
                  </div>
                  <button
                    disabled={!affordable}
                    onClick={() =>
                      mutate((draft) => {
                        const result = buyDilationUpgrade(draft, def.id);
                        toast(result.message ?? "Cannot buy that");
                      })
                    }
                    className={`pressable flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${
                      affordable ? "bg-plum text-white" : "bg-cream text-berry-soft"
                    }`}
                  >
                    {atMax ? "Maxed" : (
                      <>
                        <CurrencyIcon currency="hours" className="h-3.5 w-3.5" />
                        {formatNumber(cost, format)}
                      </>
                    )}
                  </button>
                </div>
                {level > 0 && (
                  <div className="mt-2">
                    <Bar value={level} max={def.max} height="0.25rem" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <ConfirmDialog
        open={confirming}
        title="Come back out?"
        message={
          hours > 0
            ? `Pays ${formatNumber(hours, format)} hours and the next stretch asks for more.`
            : "This stretch has not reached the bar, so it pays nothing. Nothing is taken either."
        }
        confirmLabel="Come out"
        onConfirm={() => {
          setConfirming(false);
          mutate((draft) => {
            const result = leaveDilation(draft, Date.now());
            if (result.ok) notify({ kind: "reward", title: result.message ?? "Back to normal" });
            else toast(result.message ?? "Cannot do that");
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream/60 px-3 py-2">
      <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</p>
      <p className="truncate font-display text-base font-semibold text-plum">{value}</p>
    </div>
  );
}
