"use client";

// Tide changes, new water, and the vessels you move through between them.

import { useMemo, useState } from "react";
import { Droplets, Waves } from "lucide-react";
import { useGame } from "@/game/store";
import {
  MOON_UPGRADES, RESET_LAYERS, STAR_UPGRADES, TIDE_REQUIREMENT, WATER_REQUIREMENT,
  resetUpgradeCost, type ResetUpgradeDef,
} from "@/game/config/resets";
import { VESSELS } from "@/game/config/vessels";
import {
  canChangeTide, canChangeWater, changeTide, changeWater, buyResetUpgrade,
  moveTo, tidePreview, unlockVessel, waterPreview,
} from "@/game/actions";
import { hasFlag } from "@/game/formulas";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { Bar, EmptyRow, Section, SpendButton } from "./bits";

export function ResetsTab({ layer }: { layer: "tide" | "water" }) {
  const { state, mutate, version, now, notify } = useGame();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const format = state.settings.numberFormat;
  const def = RESET_LAYERS.find((l) => l.id === layer)!;

  const isTide = layer === "tide";
  const gain = useMemo(
    () => (isTide ? tidePreview(state) : waterPreview(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, isTide],
  );
  const ready = isTide ? canChangeTide(state) : canChangeWater(state);
  const current = isTide ? state.runHearts : state.eraHearts;
  const requirement = isTide ? TIDE_REQUIREMENT : WATER_REQUIREMENT;
  const upgrades = isTide ? MOON_UPGRADES : STAR_UPGRADES;
  const levels = isTide ? state.moonUpgrades : state.starUpgrades;
  const elapsed = now - (isTide ? state.runStartedAt : state.eraStartedAt);
  const locked = !isTide && !hasFlag(state, "new_water");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-dark">
            {isTide ? <Waves className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold text-plum">{def.name}</p>
            <p className="text-xs text-berry-soft">{def.blurb}</p>
          </div>
        </div>

        {locked ? (
          <p className="mt-3 rounded-xl bg-cream px-3.5 py-2.5 text-sm text-berry-soft">
            New Water is a moon upgrade near the bottom of that tree.
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-1">
              <div className="flex items-baseline justify-between text-xs text-berry-soft">
                <span>{isTide ? "This run" : "This era"}</span>
                <span>{formatNumber(current, format)} / {formatNumber(requirement, format)}</span>
              </div>
              <Bar value={current} max={requirement} label={`Progress toward ${def.name}`} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Box label="Would pay" value={formatNumber(gain, format)} />
              <Box label="So far" value={formatDurationShort(elapsed)} />
              <Box label={isTide ? "Tide changes" : "Changes of water"} value={`${isTide ? state.tideChanges : state.newWaters}`} />
              <Box
                label="Fastest"
                value={
                  (isTide ? state.stats.fastestTideChangeMs : state.stats.fastestNewWaterMs)
                    ? formatDurationShort((isTide ? state.stats.fastestTideChangeMs : state.stats.fastestNewWaterMs)!)
                    : "not yet"
                }
              />
            </div>

            <Button className="mt-3 w-full" disabled={!ready || gain <= 0} onClick={() => setConfirming(true)}>
              {def.verb} for {formatNumber(gain, format)}
            </Button>
            {isTide && (
              <p className="mt-1.5 text-center text-xs text-berry-soft">
                Leaves something behind for the other one of you.
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-3.5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-danger">Goes</p>
          <ul className="space-y-1 text-sm text-berry">
            {def.resets.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </div>
        <div className="rounded-card border border-line bg-white p-3.5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-success">Stays</p>
          <ul className="space-y-1 text-sm text-berry">
            {def.keeps.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </div>
      </div>

      <Section
        title={`${def.currency === "moons" ? "Moon" : "Star"} upgrades`}
        hint={`${formatNumber(state.wallet[def.currency], format)} to spend`}
      >
        <ul className="flex flex-col gap-2">
          {upgrades.map((upgrade) => (
            <ResetRow
              key={upgrade.id}
              def={upgrade}
              owned={levels[upgrade.id] ?? 0}
              balance={state.wallet[upgrade.currency]}
              format={format}
              confirmRare={state.settings.confirmRareSpends}
              blockedBy={
                upgrade.requires && (levels[upgrade.requires[0]] ?? 0) < upgrade.requires[1]
                  ? upgrades.find((u) => u.id === upgrade.requires![0])?.name ?? null
                  : null
              }
              onBuy={() =>
                mutate((draft) => {
                  const result = buyResetUpgrade(draft, upgrade.id);
                  toast(result.message ?? "Cannot buy that");
                })
              }
            />
          ))}
        </ul>
      </Section>

      <ConfirmDialog
        open={confirming}
        title={`${def.verb}?`}
        message={`Pays ${formatNumber(gain, format)}. Everything in the Stays column is untouched.`}
        confirmLabel={def.verb}
        onConfirm={() => {
          setConfirming(false);
          mutate((draft) => {
            const result = isTide ? changeTide(draft, Date.now()) : changeWater(draft, Date.now());
            if (result.ok) notify({ kind: "reward", title: result.message ?? def.name });
            else toast(result.message ?? "Cannot do that");
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function ResetRow({ def, owned, balance, format, confirmRare, blockedBy, onBuy }: {
  def: ResetUpgradeDef;
  owned: number;
  balance: number;
  format: "short" | "scientific" | "engineering" | "full";
  confirmRare: boolean;
  blockedBy: string | null;
  onBuy: () => void;
}) {
  const cost = resetUpgradeCost(def, owned);
  const maxed = owned >= def.max;
  return (
    <li className="rounded-card border border-line bg-white p-3.5 shadow-soft">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
            <span className="truncate">{def.name}</span>
            <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[0.6rem] font-bold text-berry-soft">
              {def.kind === "flag" ? (owned > 0 ? "yours" : "locked") : `${owned}/${def.max}`}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-berry-soft">{def.description}</p>
          {blockedBy && <p className="mt-1 text-[0.65rem] font-semibold text-danger">Needs {blockedBy} first</p>}
        </div>
        {maxed ? (
          <span className="shrink-0 rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-berry-soft">
            {def.kind === "flag" ? "Yours" : "Max"}
          </span>
        ) : (
          <SpendButton
            currency={def.currency}
            amount={cost}
            format={format}
            disabled={Boolean(blockedBy) || balance < cost}
            confirm={confirmRare}
            label={def.name}
            onSpend={onBuy}
          />
        )}
      </div>
    </li>
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

/* ------------------------------------------------------------------ */
/* Vessels                                                             */
/* ------------------------------------------------------------------ */

export function VesselsTab() {
  const { state, mutate, version } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;

  const rows = useMemo(
    () =>
      VESSELS.map((vessel) => ({
        vessel,
        unlocked: state.vesselsUnlocked.includes(vessel.id),
        affordable: state.wallet[vessel.cost.currency] >= vessel.cost.amount,
        eligible: state.lifetime.hearts >= vessel.unlockLifetime,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <div className="flex flex-col gap-3">
      <Section title="Vessels" hint="Deeper water holds different creatures. Wider floors hold more crabs.">
        <ul className="flex flex-col gap-2">
          {rows.map(({ vessel, unlocked, affordable, eligible }) => {
            const here = state.vessel === vessel.id;
            return (
              <li
                key={vessel.id}
                className={`overflow-hidden rounded-card border shadow-soft ${here ? "border-rose-dark" : "border-line"}`}
              >
                <div className="relative h-16" style={{ backgroundColor: vessel.backdrop }}>
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{ height: `${vessel.depth * 100}%`, backgroundColor: vessel.water, opacity: 0.85 }}
                  />
                </div>
                <div className="bg-white p-3.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                        <span className="truncate">{vessel.name}</span>
                        {here && (
                          <span className="shrink-0 rounded-full bg-blush px-2 py-0.5 text-[0.6rem] font-bold text-rose-dark">
                            Here
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-berry-soft">{vessel.blurb}</p>
                      <p className="mt-1 text-xs font-semibold" style={{ color: vessel.accent }}>
                        {vessel.rule}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] text-berry-soft">
                        {vessel.slots} places ·{" "}
                        {vessel.capacity === Infinity ? "no limit" : formatNumber(vessel.capacity, format)}
                      </p>
                    </div>
                    {unlocked ? (
                      <Button
                        size="sm"
                        variant={here ? "secondary" : "primary"}
                        disabled={here}
                        onClick={() =>
                          mutate((draft) => {
                            const result = moveTo(draft, vessel.id);
                            if (result.message) toast(result.message);
                          })
                        }
                      >
                        {here ? "Current" : "Move"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!eligible || !affordable}
                        onClick={() =>
                          mutate((draft) => {
                            const result = unlockVessel(draft, vessel.id);
                            toast(result.message ?? "Cannot yet");
                          })
                        }
                      >
                        {formatNumber(vessel.cost.amount, format)} {vessel.cost.currency}
                      </Button>
                    )}
                  </div>
                  {!unlocked && !eligible && (
                    <p className="mt-1.5 text-[0.65rem] text-berry-soft">
                      Needs {formatNumber(vessel.unlockLifetime, format)} lifetime hearts.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {state.vesselsUnlocked.length === 1 && (
        <EmptyRow>The Mason Jar is the first one you can move to.</EmptyRow>
      )}
    </div>
  );
}
