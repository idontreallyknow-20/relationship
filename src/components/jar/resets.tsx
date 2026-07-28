"use client";

// Rebirth, Ascension and the worlds you unlock between them.

import { useMemo, useState } from "react";
import { ArrowUpCircle, Globe2, RotateCcw } from "lucide-react";
import { useGame } from "@/game/store";
import {
  ASCENSION_REQUIREMENT, ASCENSION_UPGRADES, REBIRTH_REQUIREMENT, REBIRTH_UPGRADES,
  RESET_LAYERS, resetUpgradeCost, type ResetUpgradeDef,
} from "@/game/config/resets";
import { WORLDS } from "@/game/config/worlds";
import {
  ascensionPreview, buyResetUpgrade, canAscend, canRebirth, doAscend, doRebirth,
  rebirthPreview, travelTo, unlockWorld,
} from "@/game/actions";
import { hasFlag } from "@/game/formulas";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { Bar, EmptyRow, Section, SpendButton } from "./bits";

export function ResetsTab({ layer }: { layer: "rebirth" | "ascension" }) {
  const { state, mutate, version, now, notify } = useGame();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const format = state.settings.numberFormat;
  const def = RESET_LAYERS.find((l) => l.id === layer)!;

  const isRebirth = layer === "rebirth";
  const gain = useMemo(
    () => (isRebirth ? rebirthPreview(state) : ascensionPreview(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, isRebirth],
  );
  const ready = isRebirth ? canRebirth(state) : canAscend(state);
  const current = isRebirth ? state.runHearts : state.eraHearts;
  const requirement = isRebirth ? REBIRTH_REQUIREMENT : ASCENSION_REQUIREMENT;
  const upgrades = isRebirth ? REBIRTH_UPGRADES : ASCENSION_UPGRADES;
  const levels = isRebirth ? state.rebirthUpgrades : state.ascensionUpgrades;
  const elapsed = now - (isRebirth ? state.runStartedAt : state.eraStartedAt);

  const locked = !isRebirth && !hasFlag(state, "ascension");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-dark">
            {isRebirth ? <RotateCcw className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold text-plum">{def.name}</p>
            <p className="text-xs text-berry-soft">{def.blurb}</p>
          </div>
        </div>

        {locked ? (
          <p className="mt-3 rounded-xl bg-cream px-3.5 py-2.5 text-sm text-berry-soft">
            Ascension is unlocked by a rebirth upgrade near the bottom of that tree. It is the
            point of the whole rebirth loop.
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-1">
              <div className="flex items-baseline justify-between text-xs text-berry-soft">
                <span>{isRebirth ? "This run" : "This era"}</span>
                <span>
                  {formatNumber(current, format)} / {formatNumber(requirement, format)}
                </span>
              </div>
              <Bar value={current} max={requirement} label={`Progress toward ${def.name}`} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Box label={`${def.name} would pay`} value={`${formatNumber(gain, format)}`} />
              <Box label="Time in this run" value={formatDurationShort(elapsed)} />
              <Box
                label={isRebirth ? "Rebirths" : "Ascensions"}
                value={`${isRebirth ? state.rebirths : state.ascensions}`}
              />
              <Box
                label="Fastest"
                value={
                  isRebirth
                    ? state.stats.fastestRebirthMs
                      ? formatDurationShort(state.stats.fastestRebirthMs)
                      : "not yet"
                    : state.stats.fastestAscensionMs
                      ? formatDurationShort(state.stats.fastestAscensionMs)
                      : "not yet"
                }
              />
            </div>

            <Button
              className="mt-3 w-full"
              disabled={!ready || gain <= 0}
              onClick={() => setConfirming(true)}
            >
              {def.verb} for {formatNumber(gain, format)}
            </Button>
            {!ready && (
              <p className="mt-1.5 text-center text-xs text-berry-soft">
                Reach {formatNumber(requirement, format)} hearts{" "}
                {isRebirth ? "in this run" : "in this era"} first.
              </p>
            )}
          </>
        )}
      </div>

      {/* Exactly what happens */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-3.5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-danger">Resets</p>
          <ul className="space-y-1 text-sm text-berry">
            {def.resets.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-card border border-line bg-white p-3.5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-success">Kept</p>
          <ul className="space-y-1 text-sm text-berry">
            {def.keeps.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <Section
        title={`${def.name} upgrades`}
        hint={`Spent with ${isRebirth ? "rebirth tokens" : "ascension crystals"}. You have ${formatNumber(state.wallet[def.currency], format)}.`}
      >
        <ul className="flex flex-col gap-2">
          {upgrades.map((upgrade) => (
            <ResetUpgradeRow
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
                  toast(result.message ?? "Could not buy that");
                })
              }
            />
          ))}
        </ul>
      </Section>

      <ConfirmDialog
        open={confirming}
        title={`${def.verb}?`}
        message={`This pays ${formatNumber(gain, format)} and resets everything listed above. Everything in the kept list stays exactly as it is.`}
        confirmLabel={def.verb}
        onConfirm={() => {
          setConfirming(false);
          mutate((draft) => {
            const result = isRebirth ? doRebirth(draft, Date.now()) : doAscend(draft, Date.now());
            if (result.ok) {
              notify({
                kind: "reward",
                title: result.message ?? def.name,
                detail: "The jar is empty again. Everything permanent stayed.",
              });
            } else {
              toast(result.message ?? "Could not do that");
            }
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function ResetUpgradeRow({
  def,
  owned,
  balance,
  format,
  confirmRare,
  blockedBy,
  onBuy,
}: {
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
  const affordable = !maxed && !blockedBy && balance >= cost;

  return (
    <li className="rounded-card border border-line bg-white p-3.5 shadow-soft">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
            <span className="truncate">{def.name}</span>
            <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[0.6rem] font-bold text-berry-soft">
              {def.kind === "flag" ? (owned > 0 ? "owned" : "locked") : `${owned}/${def.max}`}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-berry-soft">{def.description}</p>
          {blockedBy && (
            <p className="mt-1 text-[0.65rem] font-semibold text-danger">Needs {blockedBy} first</p>
          )}
        </div>
        {maxed ? (
          <span className="shrink-0 rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-berry-soft">
            {def.kind === "flag" ? "Owned" : "Max"}
          </span>
        ) : (
          <SpendButton
            currency={def.currency}
            amount={cost}
            format={format}
            disabled={!affordable}
            confirm={confirmRare}
            label={def.name}
            onSpend={onBuy}
          />
        )}
      </div>
      {def.kind !== "flag" && def.max < 200 && (
        <div className="mt-2">
          <Bar value={owned} max={def.max} height="0.2rem" />
        </div>
      )}
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
/* Worlds                                                              */
/* ------------------------------------------------------------------ */

export function WorldsTab() {
  const { state, mutate, version } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;

  const rows = useMemo(
    () =>
      WORLDS.map((world) => ({
        world,
        unlocked: state.worldsUnlocked.includes(world.id),
        affordable: state.wallet[world.cost.currency] >= world.cost.amount,
        eligible: state.lifetime.hearts >= world.unlockLifetime,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <div className="flex flex-col gap-3">
      <Section title="Worlds" hint="Each one changes the backdrop and one rule of play.">
        <ul className="flex flex-col gap-2">
          {rows.map(({ world, unlocked, affordable, eligible }) => {
            const current = state.world === world.id;
            return (
              <li
                key={world.id}
                className={`overflow-hidden rounded-card border shadow-soft ${
                  current ? "border-rose-dark" : "border-line"
                }`}
              >
                <div className="flex h-14 items-end" style={{ backgroundColor: world.sky }}>
                  <div className="h-5 w-full" style={{ backgroundColor: world.ground }} />
                </div>
                <div className="bg-white p-3.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                        <Globe2 className="h-3.5 w-3.5 shrink-0" style={{ color: world.accent }} />
                        <span className="truncate">{world.name}</span>
                        {current && (
                          <span className="shrink-0 rounded-full bg-blush px-2 py-0.5 text-[0.6rem] font-bold text-rose-dark">
                            Here
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-berry-soft">{world.blurb}</p>
                      <p className="mt-1 text-xs font-semibold" style={{ color: world.accent }}>
                        {world.rule}
                      </p>
                    </div>
                    {unlocked ? (
                      <Button
                        size="sm"
                        variant={current ? "secondary" : "primary"}
                        disabled={current}
                        onClick={() => mutate((draft) => void travelTo(draft, world.id))}
                      >
                        {current ? "Current" : "Travel"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!eligible || !affordable}
                        onClick={() =>
                          mutate((draft) => {
                            const result = unlockWorld(draft, world.id);
                            toast(result.message ?? "Could not unlock that");
                          })
                        }
                      >
                        {world.cost.amount} {world.cost.currency === "star" ? "stars" : "hearts"}
                      </Button>
                    )}
                  </div>
                  {!unlocked && !eligible && (
                    <p className="mt-1.5 text-[0.65rem] text-berry-soft">
                      Needs {formatNumber(world.unlockLifetime, format)} lifetime hearts.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {state.worldsUnlocked.length === 1 && (
        <EmptyRow>
          The Bedroom Jar is where everything starts. The Rose Garden is the first world you can buy.
        </EmptyRow>
      )}
    </div>
  );
}
