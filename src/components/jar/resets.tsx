"use client";

// Rebirth, Ascension and Forever, plus the jars and the shelf.

import { useMemo, useState } from "react";
import { Droplets, Waves } from "lucide-react";
import { useGame } from "@/game/store";
import {
  SUN_UPGRADES, MOON_UPGRADES, RESET_LAYERS, STAR_UPGRADES, resetUpgradeCost,
  seaRequirement, tideRequirement, waterRequirement, type ResetUpgradeDef,
} from "@/game/config/resets";
import {
  buyNextJar, canChangeTide, canChangeWater, canLetGo, changeTide, changeWater,
  buyResetUpgrade, letGo, seaPreview, tidePreview, switchToJar, waterPreview,
} from "@/game/actions";
import { JARS } from "@/game/config/jars";
import { hasFlag } from "@/game/formulas";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { Bar, Section, SpendButton } from "./bits";
import { ResetUpgradeRows, ShelfUpgradeRows } from "./upgrade-rows";

export function ResetsTab({ layer }: { layer: "tide" | "water" | "sea" }) {
  const { state, mutate, version, now, notify } = useGame();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  // Bumped by a completed rebirth. It is only in the key of the card below, so
  // the card remounts and its drain animation plays. A rebirth takes away
  // nearly everything you were looking at and it should look like it did.
  const [drained, setDrained] = useState(0);
  const format = state.settings.numberFormat;
  const def = RESET_LAYERS.find((l) => l.id === layer)!;

  // Three rungs of one shape rather than three screens. Each differs only in
  // which counter it reads, which tree it spends into, and what stops it.
  const rung = {
    tide: {
      gain: tidePreview,
      ready: canChangeTide,
      current: state.runHearts,
      requirement: tideRequirement(state.tideChanges),
      upgrades: MOON_UPGRADES,
      levels: state.moonUpgrades,
      startedAt: state.runStartedAt,
      count: state.tideChanges,
      fastest: state.stats.fastestTideChangeMs,
      countLabel: "Rebirths",
      progressLabel: "This life",
      locked: null as string | null,
      run: (draft: typeof state, at: number) => changeTide(draft, at),
    },
    water: {
      gain: waterPreview,
      ready: canChangeWater,
      current: state.eraHearts,
      requirement: waterRequirement(state.newWaters),
      upgrades: STAR_UPGRADES,
      levels: state.starUpgrades,
      startedAt: state.eraStartedAt,
      count: state.newWaters,
      fastest: state.stats.fastestNewWaterMs,
      countLabel: "Deep rebirths",
      progressLabel: "Since the last deep one",
      locked: hasFlag(state, "new_water")
        ? null
        : "Deep Rebirth is a moon upgrade near the bottom of that tree.",
      run: (draft: typeof state, at: number) => changeWater(draft, at),
    },
    sea: {
      gain: seaPreview,
      ready: canLetGo,
      current: state.seaHearts,
      requirement: seaRequirement(state.seas),
      upgrades: SUN_UPGRADES,
      levels: state.sunUpgrades,
      startedAt: state.seaStartedAt,
      count: state.seas,
      fastest: null,
      countLabel: "Last rebirths",
      progressLabel: "Since the last one",
      locked: state.newWaters >= 3
        ? null
        : `Do three deep rebirths first. You have done ${state.newWaters}.`,
      run: (draft: typeof state, at: number) => letGo(draft, at),
    },
  }[layer];

  const gain = useMemo(
    () => rung.gain(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, layer],
  );
  const ready = rung.ready(state);
  const current = rung.current;
  const requirement = rung.requirement;
  const upgrades = rung.upgrades;
  const levels = rung.levels;
  const elapsed = now - rung.startedAt;
  const locked = rung.locked;
  const isTide = layer === "tide";

  return (
    <div className="flex flex-col gap-4">
      <div
        key={drained}
        className={`rounded-card border border-line bg-white p-4 shadow-soft${drained > 0 ? " rebirth-drain" : ""}`}
      >
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
          <p className="mt-3 rounded-xl bg-cream px-3.5 py-2.5 text-sm text-berry-soft">{locked}</p>
        ) : (
          <>
            <div className="mt-3 space-y-1">
              <div className="flex items-baseline justify-between text-xs text-berry-soft">
                <span>{rung.progressLabel}</span>
                <span>{formatNumber(current, format)} / {formatNumber(requirement, format)}</span>
              </div>
              <Bar value={current} max={requirement} label={`Progress toward ${def.name}`} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Box label="Would pay" value={formatNumber(gain, format)} />
              <Box label="So far" value={formatDurationShort(elapsed)} />
              <Box label={rung.countLabel} value={`${rung.count}`} flash={drained > 0} />
              <Box
                label="Fastest"
                value={rung.fastest ? formatDurationShort(rung.fastest) : "not yet"}
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
        title={`${def.currency === "moons" ? "Moon" : def.currency === "suns" ? "Drop" : "Star"} tree`}
        hint={`${formatNumber(state.wallet[def.currency], format)} to spend`}
      >
        <ResetUpgradeRows currency={def.currency as "moons" | "stars" | "suns"} />
      </Section>

      <ConfirmDialog
        open={confirming}
        title={`${def.verb}?`}
        message={`Pays ${formatNumber(gain, format)}. Everything in the Stays column is untouched.`}
        confirmLabel={def.verb}
        onConfirm={() => {
          setConfirming(false);
          const at = Date.now();
          mutate((draft) => {
            const result = rung.run(draft, at);
            if (result.ok) {
              notify({ kind: "reward", title: result.message ?? def.name });
              setDrained((n) => n + 1);
            } else {
              toast(result.message ?? "Cannot do that");
            }
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

function Box({ label, value, flash }: { label: string; value: string; flash?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-cream/60 px-3 py-2">
      <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</p>
      <p className="truncate font-display text-base font-semibold text-plum">
        <span className={flash ? "milestone-flash" : undefined}>{value}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vessels                                                             */
/* ------------------------------------------------------------------ */

/**
 * The jars, and the shelf they end up on.
 *
 * One screen rather than two, because they are one loop: you fill a jar, seal
 * it onto the shelf, and buy a bigger one with what sealing paid.
 */
export function JarsTab() {
  const { state, derived, mutate, version } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;

  const rows = useMemo(
    () =>
      JARS.map((jar, index) => ({
        jar,
        index,
        unlocked: state.jarsUnlocked.includes(jar.id),
        current: state.jar === jar.id,
        affordable: state.wallet.ribbons >= jar.cost,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const next = rows.find((row) => !row.unlocked);

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="The shelf"
        hint="Every jar you have ever filled, all of them paying at once."
      >
        <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
          <p className="font-display text-3xl font-semibold text-plum">
            {formatNumber(state.shelfHearts, format)}
          </p>
          <p className="text-xs text-berry-soft">
            hearts on the shelf, across {state.sealed.length} sealed{" "}
            {state.sealed.length === 1 ? "jar" : "jars"}
          </p>
          <p className="mt-2 rounded-xl bg-blush/50 px-3 py-1.5 text-xs font-semibold text-rose-dark">
            Paying {formatNumber(derived.shelfIncome, format)} hearts a second
          </p>
        </div>
      </Section>

      <Section
        title="Shelf upgrades"
        hint={`${formatNumber(state.wallet.ribbons, format)} ribbons to spend`}
      >
        <ShelfUpgradeRows />
      </Section>

      {next && (
        <Section title="The next one" hint={next.jar.blurb}>
          <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
            <p className="font-display text-xl text-plum">{next.jar.name}</p>
            <p className="mt-0.5 text-sm text-berry-soft">{next.jar.rule}</p>
            <p className="mt-1 text-xs text-berry-soft">
              Holds {formatNumber(next.jar.capacity, format)} · seats {next.jar.seats}
            </p>
            <Button
              className="mt-3 w-full"
              disabled={!next.affordable}
              onClick={() =>
                mutate((draft) => {
                  const result = buyNextJar(draft);
                  toast(result.message ?? "Cannot buy that");
                })
              }
            >
              {next.affordable
                ? `Take it, ${next.jar.cost} ribbons`
                : `${next.jar.cost} ribbons`}
            </Button>
          </div>
        </Section>
      )}

      <Section title="Every jar" hint="The ones you have had, and the ones to come.">
        <ul className="flex flex-col gap-2">
          {rows.map(({ jar, unlocked, current }) => (
            <li
              key={jar.id}
              className={`rounded-card border p-3.5 ${
                current
                  ? "border-rose-dark bg-blush/40"
                  : unlocked
                    ? "border-line bg-white"
                    : "border-line-soft bg-white opacity-60"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-berry">{jar.name}</p>
                {current ? (
                  <span className="shrink-0 text-xs font-bold text-rose-dark">Filling</span>
                ) : unlocked ? (
                  <button
                    onClick={() =>
                      mutate((draft) => {
                        const result = switchToJar(draft, jar.id);
                        toast(result.message ?? "");
                      })
                    }
                    className="pressable shrink-0 rounded-full bg-cream px-3 py-1 text-xs font-semibold text-berry"
                  >
                    Use it
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-berry-soft">
                    {jar.cost} ribbons
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-berry-soft">
                {unlocked ? `${jar.blurb} ${jar.rule}` : jar.blurb}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
