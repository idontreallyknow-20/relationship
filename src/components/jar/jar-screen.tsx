"use client";

// The main screen: the heart you tap, the jar it fills, and just enough
// information around it to make the next decision obvious.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Swords, Timer, Zap } from "lucide-react";
import { useGame } from "@/game/store";
import { performClick, collectFloating, activateSkill } from "@/game/engine";
import { buyUpgrade, fleeBoss, hitBoss, startBoss } from "@/game/actions";
import { currentWorld } from "@/game/engine";
import { derive, meetsUnlock, upgradeNextCost, visibleUpgrades } from "@/game/formulas";
import { formatDurationShort, formatNumber, formatPercent, formatMultiplier } from "@/game/numbers";
import { SKILLS } from "@/game/config/skills";
import { BOSS_BY_ID, BOSSES, bossHp } from "@/game/config/worlds";
import { PET_BY_ID } from "@/game/config/pets";
import { activePetIds, hasFlag } from "@/game/formulas";
import { REBIRTH_REQUIREMENT } from "@/game/config/resets";
import type { FloatingHeart } from "@/game/types";
import { Button, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { Bar, EmptyRow, Section, Stat } from "./bits";

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: "normal" | "crit" | "mega" | "bonus";
}

const MAX_POPUPS = 14;
/** A human tops out around twenty taps a second; this is the local guard. */
const MIN_TAP_GAP_MS = 35;

export function JarScreen({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { state, derived, mutate, version, now, notify } = useGame();
  const toast = useToast();
  const world = currentWorld(state);

  const [popups, setPopups] = useState<Popup[]>([]);
  const [shake, setShake] = useState(false);
  const popupId = useRef(0);
  const holdStart = useRef<number | null>(null);
  const [charge, setCharge] = useState(0);
  const lastTap = useRef(0);
  const ringRef = useRef(0);
  const tapWindow = useRef<number[]>([]);
  const [ringValue, setRingPhase] = useState(0);
  // Sampled on each tap rather than read from the ref during render.
  const [tapsPerSecond, setTapsPerSecond] = useState(0);

  const reduced = state.settings.reducedMotion || state.settings.batterySaver;
  const ringPhase = reduced ? 1 : ringValue;
  const particlesOn = state.settings.particles !== "off" && !state.settings.batterySaver;
  const format = state.settings.numberFormat;

  /* ---------------------------------------------------------------- */
  /* The timing ring                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (reduced) {
      // With reduced motion the ring holds still at its best value, so a tap
      // is never penalised for an animation the player turned off.
      ringRef.current = 1;
      return;
    }
    let frame = 0;
    const loop = () => {
      // A 1.1 second cycle; precision peaks in the middle of the ring.
      const t = (Date.now() % 1_100) / 1_100;
      const value = 1 - Math.abs(t - 0.5) * 2;
      ringRef.current = value;
      setRingPhase(value);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  /* ---------------------------------------------------------------- */
  /* Feedback                                                          */
  /* ---------------------------------------------------------------- */

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
        // Not supported; nothing to do.
      }
    },
    [state.settings.haptics],
  );

  /* ---------------------------------------------------------------- */
  /* Tapping                                                           */
  /* ---------------------------------------------------------------- */

  const tap = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const now = Date.now();
      // Local autoclicker guard. The server rejects impossible rates too, but
      // dropping them here means the player never builds a score that is
      // later thrown away.
      if (now - lastTap.current < MIN_TAP_GAP_MS) return;
      lastTap.current = now;

      tapWindow.current = [...tapWindow.current.filter((t) => now - t < 1_000), now];
      setTapsPerSecond(tapWindow.current.length);

      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      const chargeValue = holdStart.current ? Math.min(1, (now - holdStart.current) / 1_200) : 0;

      mutate((draft) => {
        const d = derive(draft, now);
        const outcome = performClick(draft, d, {
          precision: ringRef.current,
          charge: chargeValue,
          now,
          x,
          y,
        });

        addPopup(
          `+${formatNumber(outcome.hearts, format)}`,
          x,
          y,
          outcome.mega ? "mega" : outcome.crit ? "crit" : "normal",
        );

        if (outcome.mega) {
          buzz([12, 30, 18]);
          if (state.settings.screenShake && !reduced) {
            setShake(true);
            setTimeout(() => setShake(false), 220);
          }
        } else if (outcome.crit) {
          buzz(14);
        } else {
          buzz(6);
        }

        // A tap during a boss fight is also a hit on the boss.
        if (draft.activeBoss) {
          const weak = draft.activeBoss.weakSpot;
          const onWeakSpot = weak
            ? Math.hypot(weak.x - x, weak.y - y) < 16 && weak.expiresAt > now
            : false;
          const hit = hitBoss(draft, now, {
            crit: outcome.crit,
            onWeakSpot,
            combo: draft.combo,
          });
          if (hit.blocked) addPopup("blocked", x, y - 8, "bonus");
          if (hit.defeated) {
            buzz([20, 40, 20, 40]);
            notify({ kind: "reward", title: "Boss defeated", detail: "Rewards added to your wallet." });
          }
          if (hit.failed) {
            notify({ kind: "warning", title: "Out of time", detail: "The boss got away. Try again." });
          }
        }
      });
    },
    [addPopup, buzz, format, mutate, notify, reduced, state.settings.screenShake],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    holdStart.current = Date.now();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    tap(e.clientX, e.clientY, rect);
    holdStart.current = null;
    setCharge(0);
  };

  // Charge meter while held.
  useEffect(() => {
    const interval = setInterval(() => {
      if (holdStart.current) {
        setCharge(Math.min(1, (Date.now() - holdStart.current) / 1_200));
      }
    }, 60);
    return () => clearInterval(interval);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Floating hearts                                                   */
  /* ---------------------------------------------------------------- */

  const collect = (heart: FloatingHeart) => {
    mutate((draft) => {
      const d = derive(draft, Date.now());
      const reward = collectFloating(draft, d, heart.id, Date.now());
      if (!reward) {
        addPopup("crack", heart.x, heart.y, "bonus");
        return;
      }
      addPopup(`+${formatNumber(reward.hearts, format)}`, heart.x, heart.y, "bonus");
      if (reward.collectible) {
        notify({ kind: "reward", title: "Found a love letter", detail: "Added to your collection." });
      }
      buzz([10, 20, 10]);
    });
  };

  /* ---------------------------------------------------------------- */
  /* Derived display values                                            */
  /* ---------------------------------------------------------------- */

  const quickUpgrades = useMemo(() => {
    const list = visibleUpgrades(state)
      .filter((u) => u.currency === "hearts" && meetsUnlock(state, u.unlock))
      .map((u) => ({ def: u, cost: upgradeNextCost(state, u, derived) }))
      .filter((entry) => (state.upgrades[entry.def.id] ?? 0) < entry.def.max)
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 3);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const readySkills = useMemo(
    () =>
      SKILLS.filter((def) => (state.skills[def.id]?.level ?? 0) > 0)
        .map((def) => {
          const skill = state.skills[def.id];
          const cooldown = def.cooldownMs * derived.skillCooldown;
          const remaining = skill.lastUsedAt <= 0
            ? 0
            : Math.max(0, cooldown - (now - skill.lastUsedAt));
          return { def, remaining, cooldown, active: skill.activeUntil > now };
        })
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, now],
  );

  const activePets = activePetIds(state).map((id) => ({
    instance: state.pets[id],
    def: PET_BY_ID[state.pets[id].defId],
  }));

  const nextUnlock = useMemo(() => {
    const candidates = visibleUpgrades(state)
      .filter((u) => !meetsUnlock(state, u.unlock) && u.unlock?.lifetimeHearts)
      .sort((a, b) => (a.unlock!.lifetimeHearts! - b.unlock!.lifetimeHearts!));
    const upgrade = candidates[0];
    if (upgrade) {
      return {
        label: upgrade.name,
        current: state.lifetime.hearts,
        target: upgrade.unlock!.lifetimeHearts!,
        note: "lifetime hearts",
      };
    }
    if (state.runHearts < REBIRTH_REQUIREMENT) {
      return {
        label: "Rebirth",
        current: state.runHearts,
        target: REBIRTH_REQUIREMENT,
        note: "hearts this run",
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const availableBoss = useMemo(() => {
    if (!hasFlag(state, "bosses")) return null;
    const inWorld = world.bosses
      .map((id) => BOSS_BY_ID[id])
      .filter((def) => def && state.lifetime.hearts >= def.unlockLifetime);
    return inWorld[inWorld.length - 1] ?? BOSSES[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, world.id]);

  const jarFill = Math.max(
    0,
    Math.min(1, derived.jarCapacity > 0 ? state.wallet.hearts / derived.jarCapacity : 0),
  );
  const overflowing = state.wallet.hearts > derived.jarCapacity;

  return (
    <div className="flex flex-col gap-4">
      {/* The stage */}
      <div
        className={`relative overflow-hidden rounded-card border border-line ${shake ? "jar-shake" : ""}`}
        style={{ backgroundColor: world.sky }}
      >
        <div
          className="absolute inset-x-0 bottom-0 h-24"
          style={{ backgroundColor: world.ground }}
          aria-hidden="true"
        />

        {/* Floating hearts */}
        {state.floating.map((heart) => (
          <button
            key={heart.id}
            onClick={() => collect(heart)}
            aria-label={`Collect a ${heart.kind} heart`}
            className={`absolute z-20 flex h-11 w-11 items-center justify-center rounded-full ${
              reduced ? "" : "float-bob"
            }`}
            style={{ left: `${heart.x}%`, top: `${heart.y}%`, color: floatingColor(heart.kind) }}
          >
            <HeartIcon className="h-7 w-7 drop-shadow" />
            {heart.kind === "shielded" && (
              <span className="absolute inset-0 rounded-full border-2 border-white/70" aria-hidden="true" />
            )}
          </button>
        ))}

        {/* Popups */}
        {popups.map((popup) => (
          <span
            key={popup.id}
            aria-hidden="true"
            className={`pointer-events-none absolute z-30 select-none font-display font-bold heart-popup ${
              popup.kind === "mega"
                ? "text-xl"
                : popup.kind === "crit"
                  ? "text-lg"
                  : popup.kind === "bonus"
                    ? "text-sm"
                    : "text-base"
            }`}
            style={{
              left: `${popup.x}%`,
              top: `${popup.y}%`,
              color:
                popup.kind === "mega"
                  ? "#c99a3f"
                  : popup.kind === "crit"
                    ? world.accent
                    : popup.kind === "bonus"
                      ? "#5aa8b0"
                      : world.heartTint,
            }}
          >
            {popup.text}
          </span>
        ))}

        <div className="relative z-10 flex items-center gap-3 p-4">
          {/* The jar */}
          <div className="flex w-24 shrink-0 flex-col items-center gap-1">
            <JarArt fill={jarFill} tint={world.jarTint} heart={world.heartTint} overflowing={overflowing} />
            <p className="text-[0.65rem] font-semibold text-berry-soft">
              {formatNumber(state.wallet.hearts, format)}
              {overflowing ? " over" : ` / ${formatNumber(derived.jarCapacity, format)}`}
            </p>
          </div>

          {/* The heart */}
          <div className="flex flex-1 flex-col items-center gap-2">
            <button
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                holdStart.current = null;
                setCharge(0);
              }}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Tap the heart"
              className="touch-draw relative flex h-40 w-40 select-none items-center justify-center rounded-full"
              style={{ color: world.heartTint }}
            >
              {/* Timing ring */}
              <span
                aria-hidden="true"
                className="absolute rounded-full border-4"
                style={{
                  width: `${52 + (1 - ringPhase) * 46}%`,
                  height: `${52 + (1 - ringPhase) * 46}%`,
                  borderColor: ringPhase > 0.8 ? "#c99a3f" : world.accent,
                  opacity: reduced ? 0.25 : 0.35 + ringPhase * 0.4,
                }}
              />
              <HeartIcon
                className="h-28 w-28 drop-shadow"
                style={{ transform: `scale(${1 + charge * 0.12})` }}
              />
              {charge > 0.05 && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-1.5 w-20 overflow-hidden rounded-full bg-white/60"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${charge * 100}%`, backgroundColor: world.accent }}
                  />
                </span>
              )}
            </button>

            <p className="text-center text-xs font-semibold" style={{ color: world.accent }}>
              {ringPhase > 0.8 ? "Perfect timing" : "Tap, or hold to charge"}
            </p>
          </div>
        </div>

        {/* Boss overlay */}
        {state.activeBoss && (
          <BossBar
            hp={state.activeBoss.hp}
            maxHp={state.activeBoss.maxHp}
            name={BOSS_BY_ID[state.activeBoss.defId]?.name ?? "Boss"}
            endsAt={state.activeBoss.endsAt}
            shielded={state.activeBoss.shielded}
            weakSpot={state.activeBoss.weakSpot}
            onFlee={() => mutate((draft) => void fleeBoss(draft))}
          />
        )}
      </div>

      {/* Meters */}
      <div className="grid grid-cols-3 gap-2">
        <MeterCard
          label="Combo"
          value={`${state.combo}`}
          sub={`max ${derived.comboCap} · ${formatMultiplier(derived.comboMultiplier)}`}
          fill={state.combo / Math.max(1, derived.comboCap)}
          color="var(--color-rose-dark)"
        />
        <MeterCard
          label="Heat"
          value={`${Math.round((state.heat / Math.max(1, derived.heatMax)) * 100)}%`}
          sub="sustained tapping"
          fill={state.heat / Math.max(1, derived.heatMax)}
          color="#c2803f"
        />
        <MeterCard
          label="Energy"
          value={`${Math.floor(state.energy)}`}
          sub={`of ${Math.floor(derived.energyMax)}`}
          fill={state.energy / Math.max(1, derived.energyMax)}
          color="#5aa8b0"
        />
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Per tap" value={formatNumber(derived.heartsPerClick, format)} tone="accent" />
        <Stat label="Per second" value={formatNumber(derived.heartsPerSecond, format)} />
        <Stat label="Lifetime" value={formatNumber(state.lifetime.hearts, format)} />
        <Stat label="Critical" value={formatPercent(derived.critChance, 1)} />
        <Stat label="Crit power" value={formatMultiplier(derived.critMultiplier)} />
        <Stat label="Taps per second" value={`${tapsPerSecond}`} />
      </div>

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
              <span className="text-berry-soft">
                {formatDurationShort(Math.max(0, buff.expiresAt - now))}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Objective */}
      {nextUnlock && (
        <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-berry">Next: {nextUnlock.label}</p>
            <p className="text-xs text-berry-soft">
              {formatNumber(nextUnlock.current, format)} / {formatNumber(nextUnlock.target, format)}
            </p>
          </div>
          <Bar
            value={nextUnlock.current}
            max={nextUnlock.target}
            label={`Progress toward ${nextUnlock.label}`}
          />
          <p className="mt-1 text-[0.65rem] text-berry-soft">{nextUnlock.note}</p>
        </div>
      )}

      {/* Abilities */}
      <Section
        title="Abilities"
        hint="Tap to use. Level them in the Skills tab."
        action={
          <button className="text-xs font-semibold text-rose-dark underline" onClick={() => onOpenTab("skills")}>
            All abilities
          </button>
        }
      >
        {readySkills.length === 0 ? (
          <EmptyRow>
            No abilities learned yet. Skill points come from achievements and missions.
          </EmptyRow>
        ) : (
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
                      if (!result.ok) toast(result.reason ?? "Not ready");
                      else if (result.instantHearts) {
                        addPopup(`+${formatNumber(result.instantHearts, format)}`, 50, 40, "bonus");
                      }
                    })
                  }
                  className={`pressable relative flex w-24 shrink-0 flex-col items-center gap-1 overflow-hidden rounded-xl border px-2 py-2.5 text-center ${
                    active
                      ? "border-rose-dark bg-blush"
                      : ready
                        ? "border-line bg-white"
                        : "border-line bg-cream"
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
        )}
      </Section>

      {/* Quick upgrades */}
      <Section
        title="Quick upgrades"
        hint="The three cheapest things you can buy right now."
        action={
          <button className="text-xs font-semibold text-rose-dark underline" onClick={() => onOpenTab("upgrades")}>
            All upgrades
          </button>
        }
      >
        {quickUpgrades.length === 0 ? (
          <EmptyRow>Everything available is bought. Keep tapping to unlock more.</EmptyRow>
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
                        if (!result.ok) toast(result.message ?? "Could not buy that");
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
                          lv {state.upgrades[def.id] ?? 0}
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

      {/* Pets in the field */}
      <Section
        title="Your team"
        action={
          <button className="text-xs font-semibold text-rose-dark underline" onClick={() => onOpenTab("pets")}>
            Sanctuary
          </button>
        }
      >
        {activePets.length === 0 ? (
          <EmptyRow>No pets in the field. Hatch one and put it to work.</EmptyRow>
        ) : (
          <div className="flex gap-2">
            {activePets.map(({ instance, def }) => (
              <div
                key={instance.id}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-line bg-white px-2 py-2.5 text-center"
              >
                <span
                  aria-hidden="true"
                  className="h-7 w-7 rounded-full"
                  style={{ backgroundColor: def?.color ?? "#ccc" }}
                />
                <span className="text-[0.65rem] font-bold leading-tight text-berry">
                  {instance.nickname ?? def?.name}
                </span>
                <span className="text-[0.6rem] text-berry-soft">
                  lv {instance.level} · {instance.happiness >= 60 ? "happy" : "hungry"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Boss */}
      {availableBoss && !state.activeBoss && (
        <Section title="Boss heart" hint={availableBoss.mechanicText}>
          <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5 shadow-soft">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: availableBoss.color }}
            >
              <Swords className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-berry">{availableBoss.name}</p>
              <p className="text-xs text-berry-soft">
                Tier {state.bosses[availableBoss.id]?.tier ?? 1} ·{" "}
                {formatNumber(bossHp(availableBoss, state.bosses[availableBoss.id]?.tier ?? 1), format)} health
              </p>
            </div>
            <Button
              size="sm"
              onClick={() =>
                mutate((draft) => {
                  const result = startBoss(draft, availableBoss.id, Date.now());
                  if (!result.ok) toast(result.message ?? "Not yet");
                })
              }
            >
              Fight
            </Button>
          </div>
        </Section>
      )}

      {/* Recent rewards */}
      {state.log.length > 0 && (
        <Section title="Recently">
          <ul className="flex flex-col gap-1.5">
            {[...state.log].reverse().slice(0, 6).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded-xl border border-line-soft bg-white px-3 py-2 text-xs"
              >
                <span className="shrink-0 rounded-full bg-blush px-2 py-0.5 font-bold text-rose-dark">
                  {entry.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-berry-soft">{entry.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function floatingColor(kind: FloatingHeart["kind"]): string {
  switch (kind) {
    case "golden": return "#d0a84a";
    case "treasure": return "#5aa8b0";
    case "mimic": return "#8a6a4a";
    case "healing": return "#7fa06a";
    case "exploding": return "#c05c5c";
    case "shielded": return "#7f8fd0";
    default: return "#c28092";
  }
}

function MeterCard({
  label,
  value,
  sub,
  fill,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  fill: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</p>
        <p className="font-display text-sm font-semibold text-plum">{value}</p>
      </div>
      <Bar value={fill} max={1} color={color} height="0.3rem" />
      <p className="mt-0.5 truncate text-[0.55rem] text-berry-soft">{sub}</p>
    </div>
  );
}

function BossBar({
  hp,
  maxHp,
  name,
  endsAt,
  shielded,
  weakSpot,
  onFlee,
}: {
  hp: number;
  maxHp: number;
  name: string;
  endsAt: number;
  shielded: boolean;
  weakSpot: { x: number; y: number; expiresAt: number } | null;
  onFlee: () => void;
}) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);
  const remaining = Math.max(0, endsAt - clock);

  return (
    <>
      {weakSpot && weakSpot.expiresAt > clock && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-20 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed"
          style={{ left: `${weakSpot.x}%`, top: `${weakSpot.y}%`, borderColor: "#c99a3f" }}
        />
      )}
      <div className="relative z-30 border-t border-line bg-white/95 px-3.5 py-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
            {name}
            {shielded && (
              <span className="rounded-full bg-lavender px-2 py-0.5 text-[0.6rem] font-bold text-plum">
                Shielded
              </span>
            )}
          </p>
          <p className="flex items-center gap-1 text-xs font-semibold text-berry-soft">
            <Timer className="h-3.5 w-3.5" />
            {Math.ceil(remaining / 1000)}s
          </p>
        </div>
        <Bar value={hp} max={maxHp} color="#a83e4b" height="0.6rem" label="Boss health" />
        <button className="mt-1.5 text-[0.65rem] font-semibold text-berry-soft underline" onClick={onFlee}>
          Leave the fight
        </button>
      </div>
    </>
  );
}

function JarArt({
  fill,
  tint,
  heart,
  overflowing,
}: {
  fill: number;
  tint: string;
  heart: string;
  overflowing: boolean;
}) {
  const level = 100 - Math.max(0, Math.min(1, fill)) * 62;
  return (
    <svg viewBox="0 0 100 120" className="h-32 w-24" aria-hidden="true">
      <clipPath id="jar-inside">
        <path d="M30 24 h40 v4 c5 5 8 12 8 20 v48 a12 12 0 0 1 -12 12 h-32 a12 12 0 0 1 -12 -12 v-48 c0 -8 3 -15 8 -20 z" />
      </clipPath>
      <path
        d="M28 18 h44 v6 c6 6 10 14 10 24 v52 a14 14 0 0 1 -14 14 h-36 a14 14 0 0 1 -14 -14 v-52 c0 -10 4 -18 10 -24 z"
        fill={tint}
        stroke="#ecdae1"
        strokeWidth="2.5"
      />
      <g clipPath="url(#jar-inside)">
        <rect x="20" y={level} width="60" height="120" fill={heart} opacity={0.8} />
        {overflowing && <rect x="20" y={level - 6} width="60" height="6" fill="#c99a3f" opacity={0.9} />}
      </g>
      <rect x="24" y="8" width="52" height="10" rx="5" fill="#f0cbd8" />
    </svg>
  );
}
