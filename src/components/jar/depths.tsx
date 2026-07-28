"use client";

// The chain.
//
// Each row is one depth. Buying at the bottom feeds the row above it, which
// feeds the row above that, and the surface turns into hearts. The surge
// animation exists to make that visible: when a row's count jumps, it lights
// up and pushes a pulse upward, so you can watch a purchase travel to the top
// instead of just seeing a bigger number.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Waves } from "lucide-react";
import { useGame } from "@/game/store";
import {
  DEEPEN_MULTIPLIER, DEPTHS, deepenRequirement, depthBulkCost, tideSpeed,
} from "@/game/config/depths";
import {
  buyAll, buyDepth, buyTide, canDeepen, deepen, deepestUnlocked, depthBuyCount, tideBuyCount,
} from "@/game/actions";
import { formatNumber } from "@/game/numbers";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { Section } from "./bits";

export function DepthsTab() {
  const { state, derived, mutate, version, notify } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;
  const [confirmDeepen, setConfirmDeepen] = useState(false);

  // Everything open, plus one closed row as a hint that there is more. Listing
  // every locked depth turned the screen into six identical grey boxes.
  const rows = useMemo(() => {
    const open = state.depths.findLastIndex((d) => d.unlocked);
    const visible = Math.min(derived.depthCount, open + 2);
    return DEPTHS.slice(0, visible).map((def, tier) => {
      const slot = state.depths[tier] ?? { bought: 0, owned: 0, unlocked: false };
      const count = depthBuyCount(state, tier);
      return {
        def,
        tier,
        slot,
        count,
        cost: count > 0 ? depthBulkCost(def, slot.bought, count) * derived.costMultiplier : 0,
        nextCost: depthBulkCost(def, slot.bought, 1) * derived.costMultiplier,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, derived.depthCount]);

  const amount = state.settings.depthBuyAmount;
  const tideCount = tideBuyCount(state);
  const deepest = deepestUnlocked(state);
  const readyToDeepen = canDeepen(state);
  const towardDeepen = state.depths[deepest]?.bought ?? 0;
  const needed = deepenRequirement(state.deepens);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Figure label="Per second" value={formatNumber(derived.heartsPerSecond, format)} accent />
        <Figure label="Tide speed" value={`${formatNumber(tideSpeed(state.tideBought), format)}x`} />
        <Figure label="Deepenings" value={`${state.deepens}`} />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {([1, 10, 100, "max"] as const).map((option) => (
          <button
            key={String(option)}
            onClick={() =>
              mutate((draft) => {
                draft.settings.depthBuyAmount = option;
              })
            }
            aria-pressed={amount === option}
            className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              amount === option ? "bg-plum text-white" : "bg-white text-berry-soft"
            }`}
          >
            {option === "max" ? "Max" : `Buy ${option}`}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() =>
            mutate((draft) => {
              const result = buyAll(draft);
              toast(result.message ?? "Nothing affordable");
            })
          }
        >
          Buy everything
        </Button>
        <Button
          variant="secondary"
          disabled={tideCount <= 0}
          onClick={() => mutate((draft) => void buyTide(draft))}
        >
          Tide {tideCount > 0 ? `x${tideCount}` : ""}
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map(({ def, tier, slot, count, cost, nextCost }) => (
          <DepthRow
            key={def.id}
            name={def.name}
            blurb={def.blurb}
            color={def.color}
            owned={slot.owned}
            bought={slot.bought}
            unlocked={slot.unlocked}
            count={count}
            cost={cost}
            nextCost={nextCost}
            format={format}
            feeds={tier === 0 ? "hearts" : DEPTHS[tier - 1].name.toLowerCase()}
            onBuy={() => mutate((draft) => void buyDepth(draft, tier))}
          />
        ))}
      </ul>

      <Section title="Deeper" hint={`${DEEPEN_MULTIPLIER}x everything, forever`}>
        <div className="rounded-card border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-dark">
              <ArrowDown className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-plum">Go deeper</p>
              <p className="text-xs text-berry-soft">
                {towardDeepen} of {needed} {DEPTHS[deepest]?.unit ?? ""} bought
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            disabled={!readyToDeepen}
            onClick={() => setConfirmDeepen(true)}
          >
            {readyToDeepen ? "Go deeper" : `Buy ${needed - towardDeepen} more`}
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmDeepen}
        title="Go deeper?"
        message={`The chain goes. Everything gets ${DEEPEN_MULTIPLIER} times stronger, and there may be something further down.`}
        confirmLabel="Go deeper"
        onConfirm={() => {
          setConfirmDeepen(false);
          mutate((draft) => {
            const result = deepen(draft);
            if (result.ok) notify({ kind: "reward", title: "Deeper", detail: result.message });
            else toast(result.message ?? "Not yet");
          });
        }}
        onCancel={() => setConfirmDeepen(false)}
      />
    </div>
  );
}

function Figure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5">
      <p className="truncate text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</p>
      <p className={`truncate font-display text-base font-semibold ${accent ? "text-rose-dark" : "text-plum"}`}>
        {value}
      </p>
    </div>
  );
}

function DepthRow({
  name, blurb, color, owned, bought, unlocked, count, cost, nextCost, format, feeds, onBuy,
}: {
  name: string;
  blurb: string;
  color: string;
  owned: number;
  bought: number;
  unlocked: boolean;
  count: number;
  cost: number;
  nextCost: number;
  format: "short" | "scientific" | "engineering" | "full";
  feeds: string;
  onBuy: () => void;
}) {
  const { state } = useGame();
  const reduced = state.settings.reducedMotion || state.settings.batterySaver;
  const [surging, setSurging] = useState(false);
  const previous = useRef(owned);

  // Light the row up when its count jumps, so a purchase deep down is visible
  // travelling upward rather than only showing as a larger number.
  useEffect(() => {
    if (reduced) return;
    const grew = owned > previous.current * 1.02 && previous.current > 0;
    previous.current = owned;
    if (!grew) return;
    setSurging(true);
    const timer = setTimeout(() => setSurging(false), 420);
    return () => clearTimeout(timer);
  }, [owned, reduced]);

  if (!unlocked) {
    return (
      <li className="rounded-card border border-dashed border-line bg-white/50 p-3.5">
        <p className="text-sm font-semibold text-berry-soft">Deeper still</p>
        <p className="text-xs text-berry-soft">Go deeper to find out what lives here.</p>
      </li>
    );
  }

  const affordable = count > 0;

  return (
    <li
      className="relative overflow-hidden rounded-card border bg-white p-3.5 shadow-soft transition-[border-color,box-shadow] duration-300"
      style={{ borderColor: surging ? color : "var(--color-line)" }}
    >
      {surging && (
        <span
          aria-hidden="true"
          className="depth-surge absolute inset-0"
          style={{ backgroundColor: color }}
        />
      )}
      <div className="relative flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color, opacity: owned > 0 ? 1 : 0.25 }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold leading-tight text-plum">{name}</p>
          <p className="text-xs leading-snug text-berry-soft">{blurb}</p>
          <p className="mt-1 font-display text-xl font-semibold leading-none" style={{ color }}>
            {formatNumber(owned, format)}
            {bought > 0 && (
              <span className="ml-1.5 text-xs font-semibold text-berry-soft">
                {formatNumber(bought, format)} bought
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-berry-soft">each one makes {feeds}</p>
        </div>
        <button
          disabled={!affordable}
          onClick={onBuy}
          className={`pressable shrink-0 rounded-xl px-3 py-2 text-center text-xs font-bold ${
            affordable ? "text-white" : "bg-cream text-berry-soft"
          }`}
          style={affordable ? { backgroundColor: color } : undefined}
        >
          <span className="block">{affordable ? `Buy ${count}` : "Buy"}</span>
          <span className="block text-[0.6rem] font-semibold opacity-90">
            {formatNumber(affordable ? cost : nextCost, format)}
          </span>
        </button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Automation                                                          */
/* ------------------------------------------------------------------ */

export function AutomationTab() {
  const { state, derived, mutate, version } = useGame();
  const format = state.settings.numberFormat;

  const targets = useMemo(
    () => [
      ...DEPTHS.slice(0, derived.depthCount)
        .filter((_, tier) => state.depths[tier]?.unlocked)
        .map((d) => ({ id: d.id, name: d.name, color: d.color })),
      { id: "tide", name: "Tide", color: "#7c6ba8" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, derived.depthCount],
  );

  return (
    <div className="flex flex-col gap-5">
      <Section title="The jar plays itself">
        <div className="flex flex-col gap-2">
          <Toggle
            label="Tap for me"
            detail={`${formatNumber(derived.autoTapsPerSecond, format)} a second`}
            on={state.auto.tap}
            onChange={(next) => mutate((draft) => void (draft.auto.tap = next))}
          />
        </div>
      </Section>

      <Section
        title="Autobuyers"
        hint={`One purchase every ${(derived.autobuyerIntervalMs / 1000).toFixed(2)}s each.`}
      >
        <ul className="flex flex-col gap-2">
          {targets.map((target) => {
            const buyer = state.autobuyers[target.id] ?? {
              on: false, max: true, threshold: 1, lastRunAt: 0,
            };
            return (
              <li key={target.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-6 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: target.color, opacity: buyer.on ? 1 : 0.3 }}
                  />
                  <p className="flex-1 text-sm font-semibold text-berry">{target.name}</p>
                  <Switch
                    on={buyer.on}
                    label={`Autobuy ${target.name}`}
                    onChange={(next) =>
                      mutate((draft) => {
                        draft.autobuyers[target.id] = { ...buyer, on: next };
                      })
                    }
                  />
                </div>
                {buyer.on && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() =>
                        mutate((draft) => {
                          draft.autobuyers[target.id] = { ...buyer, max: !buyer.max };
                        })
                      }
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        buyer.max ? "bg-plum text-white" : "bg-cream text-berry-soft"
                      }`}
                    >
                      {buyer.max ? "Buy max" : "Buy one"}
                    </button>
                    <label className="flex flex-1 items-center gap-2 text-xs text-berry-soft">
                      <span className="shrink-0">Spend up to</span>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        value={Math.round(buyer.threshold * 100)}
                        aria-label={`How much of your hearts ${target.name} may spend`}
                        onChange={(e) =>
                          mutate((draft) => {
                            draft.autobuyers[target.id] = {
                              ...buyer,
                              threshold: Number(e.target.value) / 100,
                            };
                          })
                        }
                        className="min-w-0 flex-1 accent-rose-dark"
                      />
                      <span className="w-9 shrink-0 text-right font-semibold text-berry">
                        {Math.round(buyer.threshold * 100)}%
                      </span>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

    </div>
  );
}

function Toggle({ label, detail, on, onChange }: {
  label: string;
  detail: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blush text-rose-dark">
        <Waves className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-berry">{label}</p>
        <p className="truncate text-xs text-berry-soft">{detail}</p>
      </div>
      <Switch on={on} label={label} onChange={onChange} />
    </div>
  );
}

function Switch({ on, label, onChange }: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full ${on ? "bg-rose-dark" : "bg-line"}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition-[left] duration-150 ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}
