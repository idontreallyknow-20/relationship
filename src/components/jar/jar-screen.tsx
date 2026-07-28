"use client";

// The jar. Water with a level, a surface, and a floor, with her otters on top
// and his crabs underneath. Everything else on this screen is in service of
// what is happening inside the glass.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { useGame } from "@/game/store";
import {
  CHARGE_THRESHOLD, collectSettled, currentVessel, performClick, tapDrifter, activateSkill,
} from "@/game/engine";
import { buyUpgrade } from "@/game/actions";
import {
  creaturesInJar, derive, heldHands, meetsUnlock, upgradeNextCost, visibleUpgrades,
} from "@/game/formulas";
import { formatDurationShort, formatNumber, formatPercent } from "@/game/numbers";
import { play, release as releaseAudio, type Cue } from "@/game/sound";
import { SKILLS } from "@/game/config/skills";
import { CREATURE_BY_ID } from "@/game/config/creatures";
import { DRIFTER_BY_ID } from "@/game/config/vessels";
import { WATER_BY_ID } from "@/game/config/memories";
import { TIDE_REQUIREMENT } from "@/game/config/resets";
import type { Settled } from "@/game/types";
import { useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { Bar, CreatureGlyph, EmptyRow, Section, Stat } from "./bits";

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: "normal" | "crit" | "mega" | "bonus";
}

const MAX_POPUPS = 14;

export function JarScreen({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { state, derived, mutate, version, now, notify } = useGame();
  const toast = useToast();
  const vessel = currentVessel(state);

  const [popups, setPopups] = useState<Popup[]>([]);
  const [shake, setShake] = useState(false);
  const popupId = useRef(0);
  const holdStart = useRef<number | null>(null);
  const [charge, setCharge] = useState(0);
  const ringRef = useRef(0);
  const [ringValue, setRingPhase] = useState(0);

  const reduced = state.settings.reducedMotion || state.settings.batterySaver;
  const particlesOn = state.settings.particles !== "off" && !state.settings.batterySaver;
  const format = state.settings.numberFormat;
  const ringPhase = reduced ? 1 : ringValue;

  const waterId = (state as { water?: string }).water ?? "default";
  const water = WATER_BY_ID[waterId]?.color || vessel.water;

  /* ---------------------------------------------------------------- */
  /* Timing ring                                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (reduced) {
      ringRef.current = 1;
      return;
    }
    let frame = 0;
    const loop = () => {
      const t = (Date.now() % 1_100) / 1_100;
      const value = 1 - Math.abs(t - 0.5) * 2;
      ringRef.current = value;
      setRingPhase(value);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const addPopup = useCallback(
    (text: string, x: number, y: number, kind: Popup["kind"]) => {
      if (!particlesOn) return;
      const id = ++popupId.current;
      setPopups((prev) => [...prev.slice(-(MAX_POPUPS - 1)), { id, x, y, text, kind }]);
      setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 900);
    },
    [particlesOn],
  );

  const buzz = useCallback(
    (pattern: number | number[]) => {
      if (!state.settings.haptics) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        // Not supported.
      }
    },
    [state.settings.haptics],
  );

  const soundOn = state.settings.sound;
  const cue = useCallback((name: Cue) => play(name, soundOn), [soundOn]);

  // Hand the audio device back when the jar closes.
  useEffect(() => releaseAudio, []);

  /* ---------------------------------------------------------------- */
  /* Tapping                                                           */
  /* ---------------------------------------------------------------- */

  const release = useCallback(() => {
    const at = Date.now();
    const held = holdStart.current ? Math.min(1, (at - holdStart.current) / 1_200) : 0;
    holdStart.current = null;
    setCharge(0);

    mutate((draft) => {
      const d = derive(draft, at);
      const outcome = performClick(draft, d, {
        precision: ringRef.current,
        charge: held,
        now: at,
        x: 50,
        y: 50,
      });

      addPopup(
        `+${formatNumber(outcome.hearts, format)}`,
        45 + Math.random() * 10,
        45,
        outcome.mega ? "mega" : outcome.crit ? "crit" : "normal",
      );
      if (outcome.charged) addPopup("dropped", 50, 62, "bonus");

      if (outcome.mega) {
        buzz([12, 30, 18]);
        cue("mega");
        if (state.settings.screenShake && !reduced) {
          setShake(true);
          setTimeout(() => setShake(false), 220);
        }
      } else if (outcome.crit) {
        buzz(14);
        cue("crit");
      } else {
        buzz(outcome.charged ? 20 : 6);
        cue(outcome.charged ? "drop" : "tap");
      }
    });
  }, [addPopup, buzz, cue, format, mutate, reduced, state.settings.screenShake]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (holdStart.current) setCharge(Math.min(1, (Date.now() - holdStart.current) / 1_200));
    }, 60);
    return () => clearInterval(interval);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Things in the water                                               */
  /* ---------------------------------------------------------------- */

  const pickUp = (item: Settled) => {
    mutate((draft) => {
      const result = collectSettled(draft, derive(draft, Date.now()), item.id, false);
      if (!result) return;
      addPopup(`+${formatNumber(result.hearts, format)}`, item.x, 20 + item.y * 60, "bonus");
      buzz(8);
      cue("collect");
    });
  };

  const hitDrifter = () => {
    mutate((draft) => {
      const result = tapDrifter(draft, derive(draft, Date.now()));
      if (!result) return;
      if (result.opened) {
        buzz([20, 40, 20]);
        cue("open");
        notify({
          kind: "reward",
          title: "It opened",
          detail: result.note ? "There was a note inside." : undefined,
        });
      } else {
        buzz(6);
        cue("tap");
      }
    });
  };

  /* ---------------------------------------------------------------- */
  /* Layout of the jar                                                 */
  /* ---------------------------------------------------------------- */

  const fill = derived.capacity > 0 ? Math.min(1, state.wallet.hearts / derived.capacity) : 0;
  const overflowing = state.wallet.hearts > derived.capacity;
  // Water sits between the surface (top) and the floor (bottom).
  const surfaceTop = 100 - Math.max(18, fill * 100 * vessel.depth);

  const inJar = creaturesInJar(state);
  const paired = heldHands(state);
  const otters = inJar.filter((c) => CREATURE_BY_ID[c.defId]?.line === "otter");
  const crabs = inJar.filter((c) => CREATURE_BY_ID[c.defId]?.line === "crab");

  const quickUpgrades = useMemo(
    () =>
      visibleUpgrades(state)
        .filter((u) => u.currency === "hearts" && meetsUnlock(state, u.unlock))
        .map((u) => ({ def: u, cost: upgradeNextCost(state, u, derived) }))
        .filter((e) => (state.upgrades[e.def.id] ?? 0) < e.def.max)
        .sort((a, b) => a.cost - b.cost)
        .slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const readySkills = useMemo(
    () =>
      SKILLS.filter((def) => (state.skills[def.id]?.level ?? 0) > 0).map((def) => {
        const skill = state.skills[def.id];
        const cooldown = def.cooldownMs * derived.skillCooldown;
        const remaining = skill.lastUsedAt <= 0 ? 0 : Math.max(0, cooldown - (now - skill.lastUsedAt));
        return { def, remaining, cooldown, active: skill.activeUntil > now };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, now],
  );

  const drifterDef = state.drifter ? DRIFTER_BY_ID[state.drifter.defId] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* The jar */}
      <div
        data-tour="vessel"
        className={`relative h-64 overflow-hidden rounded-card border-2 ${shake ? "jar-shake" : ""}`}
        style={{ backgroundColor: vessel.backdrop, borderColor: vessel.glass }}
      >
        {/* Water */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[top] duration-500"
          style={{ top: `${surfaceTop}%`, backgroundColor: water, opacity: 0.85 }}
          aria-hidden="true"
        />
        {/* Surface line */}
        <div
          className="absolute inset-x-0 h-0.5 transition-[top] duration-500"
          style={{ top: `${surfaceTop}%`, backgroundColor: vessel.accent, opacity: 0.5 }}
          aria-hidden="true"
        />
        {/* Floor */}
        <div className="absolute inset-x-0 bottom-0 h-5" style={{ backgroundColor: vessel.accent, opacity: 0.35 }} aria-hidden="true" />

        {/* Otters ride the surface */}
        {otters.map((creature, index) => {
          const def = CREATURE_BY_ID[creature.defId]!;
          return (
            <span
              key={creature.id}
              title={`${creature.name ?? def.name}, level ${creature.level}`}
              className={`absolute ${reduced ? "" : "float-bob"}`}
              style={{
                left: `${14 + index * (72 / Math.max(1, otters.length))}%`,
                top: `${surfaceTop}%`,
                marginTop: "-14px",
              }}
            >
              <CreatureGlyph line="otter" color={def.color} className="h-9 w-9" />
              {paired.has(creature.id) && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 top-1/2 h-0.5 w-3"
                  style={{ backgroundColor: vessel.accent }}
                />
              )}
            </span>
          );
        })}

        {/* Crabs walk the floor */}
        {crabs.map((creature, index) => {
          const def = CREATURE_BY_ID[creature.defId]!;
          return (
            <span
              key={creature.id}
              title={`${creature.name ?? def.name}, level ${creature.level}`}
              className={`absolute bottom-3 ${reduced ? "" : "scuttle"}`}
              style={{ left: `${12 + index * (74 / Math.max(1, crabs.length))}%` }}
            >
              <CreatureGlyph line="crab" color={def.color} className="h-8 w-8" />
            </span>
          );
        })}

        {/* What the otters cracked, on its way down */}
        {state.settled.map((item) => (
          <button
            key={item.id}
            onClick={() => pickUp(item)}
            aria-label={`Pick up a ${item.kind}`}
            className="absolute h-7 w-7 rounded-full"
            style={{
              left: `${item.x}%`,
              top: `calc(${surfaceTop}% + ${item.y * (95 - surfaceTop)}%)`,
              backgroundColor: item.kind === "pearl" ? "#e8e0d0" : item.kind === "glass" ? "#7fb0a8" : "#d0a880",
              opacity: 0.9,
            }}
          />
        ))}

        {/* Something drifted in */}
        {state.drifter && drifterDef && (
          <button
            onClick={hitDrifter}
            aria-label={`Open the ${drifterDef.name}`}
            className="absolute flex h-14 w-14 flex-col items-center justify-center rounded-xl text-[0.55rem] font-bold text-white"
            style={{
              left: `${state.drifter.x}%`,
              top: `${state.drifter.y}%`,
              backgroundColor: drifterDef.color,
            }}
          >
            {drifterDef.name.split(" ")[0]}
            <span className="mt-0.5 text-[0.6rem] opacity-90">
              {state.drifter.taps - state.drifter.tapsDone}
            </span>
          </button>
        )}

        {/* Popups */}
        {popups.map((popup) => (
          <span
            key={popup.id}
            aria-hidden="true"
            className={`heart-popup pointer-events-none absolute z-30 select-none font-display font-bold ${
              popup.kind === "mega" ? "text-xl" : popup.kind === "crit" ? "text-lg" : "text-base"
            }`}
            style={{
              left: `${popup.x}%`,
              top: `${popup.y}%`,
              color: popup.kind === "mega" ? "#c99a3f" : popup.kind === "bonus" ? "#3f7a80" : vessel.accent,
            }}
          >
            {popup.text}
          </span>
        ))}

        {/* Level */}
        <p className="absolute left-2.5 top-2 text-[0.65rem] font-semibold text-berry-soft">
          {vessel.name} · {formatNumber(state.wallet.hearts, format)}
          {overflowing ? " over" : ` / ${formatNumber(derived.capacity, format)}`}
        </p>
      </div>

      {/* The heart */}
      <div data-tour="tap" className="flex flex-col items-center gap-1.5">
        <button
          onPointerDown={(e) => {
            holdStart.current = Date.now();
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerUp={release}
          onPointerCancel={() => {
            holdStart.current = null;
            setCharge(0);
          }}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Tap the heart, or hold to charge"
          className="touch-draw relative flex h-36 w-36 select-none items-center justify-center rounded-full"
          style={{ color: vessel.accent }}
        >
          <span
            aria-hidden="true"
            className="absolute rounded-full border-4"
            style={{
              width: `${54 + (1 - ringPhase) * 44}%`,
              height: `${54 + (1 - ringPhase) * 44}%`,
              borderColor: ringPhase > 0.8 ? "#c99a3f" : vessel.accent,
              opacity: reduced ? 0.25 : 0.3 + ringPhase * 0.4,
            }}
          />
          <HeartIcon className="h-24 w-24 drop-shadow" style={{ transform: `scale(${1 + charge * 0.14})` }} />
          {charge > 0.05 && (
            <span aria-hidden="true" className="absolute bottom-0 h-1.5 w-24 overflow-hidden rounded-full bg-white/70">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${charge * 100}%`,
                  backgroundColor: charge >= CHARGE_THRESHOLD ? "#c99a3f" : vessel.accent,
                }}
              />
            </span>
          )}
        </button>
        <p className="text-xs font-semibold" style={{ color: vessel.accent }}>
          {charge >= CHARGE_THRESHOLD
            ? "Let go"
            : charge > 0.05
              ? "Keep holding"
              : ringPhase > 0.8
                ? "Perfect timing"
                : "Tap, or hold to drop one to the floor"}
        </p>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Per tap" value={formatNumber(derived.heartsPerClick, format)} tone="accent" />
        <Stat label="Per second" value={formatNumber(derived.heartsPerSecond, format)} />
        <Stat label="Combo" value={`${state.combo} / ${derived.comboCap}`} />
        <Stat label="Critical" value={formatPercent(derived.critChance, 1)} />
        <Stat label="Lifetime" value={formatNumber(state.lifetime.hearts, format)} />
        <Stat label="Tide" value={`${Math.round(state.tideLevel)}%`} />
      </div>

      {/* Tide, which is the shared one */}
      {state.tideLevel > 0 && (
        <div className="rounded-card border border-line bg-white p-3">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-plum">Tide</span>
            <span className="text-berry-soft">
              +{Math.round(Math.min(1, state.tideLevel / 100) * 60)}% to everything
            </span>
          </div>
          <Bar value={state.tideLevel} max={100} color="#7c6ba8" />
        </div>
      )}

      {/* Buffs */}
      {state.buffs.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {state.buffs.map((buff) => (
            <span
              key={buff.id}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-berry"
            >
              <Sparkles className="h-3.5 w-3.5 text-rose-dark" />
              {buff.label}
              <span className="text-berry-soft">{formatDurationShort(Math.max(0, buff.expiresAt - now))}</span>
            </span>
          ))}
        </div>
      )}

      {/* Next thing */}
      {state.runHearts < TIDE_REQUIREMENT && (
        <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-berry">Next tide change</p>
            <p className="text-xs text-berry-soft">
              {formatNumber(state.runHearts, format)} / {formatNumber(TIDE_REQUIREMENT, format)}
            </p>
          </div>
          <Bar value={state.runHearts} max={TIDE_REQUIREMENT} label="Progress toward a tide change" />
        </div>
      )}

      {/* Abilities */}
      {readySkills.length > 0 && (
        <Section title="Abilities" action={
          <button className="text-xs font-semibold text-rose-dark underline" onClick={() => onOpenTab("abilities")}>
            All
          </button>
        }>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {readySkills.map(({ def, remaining, cooldown, active }) => {
              const ready = remaining <= 0;
              return (
                <button
                  key={def.id}
                  disabled={!ready}
                  onClick={() =>
                    mutate((draft) => {
                      const result = activateSkill(draft, def.id, Date.now());
                      if (result.ok) cue("charge");
                      else toast(result.reason ?? "Not ready");
                    })
                  }
                  className={`pressable relative flex w-24 shrink-0 flex-col items-center gap-1 overflow-hidden rounded-xl border px-2 py-2.5 text-center ${
                    active ? "border-rose-dark bg-blush" : ready ? "border-line bg-white" : "border-line bg-cream"
                  }`}
                >
                  <Zap className={`h-4 w-4 ${ready ? "text-rose-dark" : "text-berry-soft"}`} />
                  <span className="text-[0.65rem] font-bold leading-tight text-berry">{def.name}</span>
                  <span className="text-[0.6rem] text-berry-soft">
                    {active ? "Active" : ready ? "Ready" : formatDurationShort(remaining)}
                  </span>
                  {!ready && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-1 bg-rose/50"
                      style={{ width: `${100 - (remaining / cooldown) * 100}%` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Quick upgrades */}
      <Section title="Upgrades" action={
        <button className="text-xs font-semibold text-rose-dark underline" onClick={() => onOpenTab("upgrades")}>
          All
        </button>
      }>
        {quickUpgrades.length === 0 ? (
          <EmptyRow>Nothing affordable yet. Keep tapping.</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {quickUpgrades.map(({ def, cost }) => {
              const affordable = state.wallet.hearts >= cost;
              return (
                <li key={def.id}>
                  <button
                    disabled={!affordable}
                    onClick={() =>
                      mutate((draft) => {
                        const result = buyUpgrade(draft, def.id, 1);
                        if (result.ok) cue("buy");
                        else toast(result.message ?? "Cannot buy that");
                      })
                    }
                    className={`pressable flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left ${
                      affordable ? "border-line bg-white" : "border-line-soft bg-cream/60"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-berry">
                        {def.name}
                        <span className="ml-1.5 text-xs font-normal text-berry-soft">
                          {state.upgrades[def.id] ?? 0}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-berry-soft">{def.description}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                        affordable ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
                      }`}
                    >
                      {formatNumber(cost, format)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Recently */}
      {state.log.length > 0 && (
        <Section title="Recently">
          <ul className="flex flex-col gap-1.5">
            {[...state.log].reverse().slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 rounded-xl border border-line-soft bg-white px-3 py-2 text-xs">
                <span className="shrink-0 rounded-full bg-blush px-2 py-0.5 font-bold text-rose-dark">{entry.label}</span>
                <span className="min-w-0 flex-1 truncate text-berry-soft">{entry.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
