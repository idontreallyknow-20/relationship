"use client";

// The jar. Water with a level, a surface, and a floor, with her otters on top
// and his crabs underneath. Everything else on this screen is in service of
// what is happening inside the glass.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { useGame } from "@/game/store";
import {
  currentJar, performClick, activateSkill,
} from "@/game/engine";
import { buyUpgrade, sealCurrentJar } from "@/game/actions";
import {
  creaturesInJar, derive, heldHands, meetsUnlock, upgradeNextCost, visibleUpgrades,
} from "@/game/formulas";
import { formatDurationShort, formatNumber, formatPercent } from "@/game/numbers";
import { NEWS_INTERVAL_MS, newsLine } from "@/game/config/news";
import { TheJar, HeartLadder } from "./the-jar";
import { play, release as releaseAudio, type Cue } from "@/game/sound";
import { SKILLS } from "@/game/config/skills";
import { CREATURE_BY_ID } from "@/game/config/creatures";
import { WATER_BY_ID } from "@/game/config/memories";
import { TIDE_REQUIREMENT } from "@/game/config/resets";
import type { Feature } from "@/game/config/stages";
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
  const jar = currentJar(state);
  /** Nothing is on screen until it is yours. */
  const has = (feature: Feature) => derived.features.has(feature);

  const [popups, setPopups] = useState<Popup[]>([]);
  const [shake, setShake] = useState(false);
  // Every tap sends a ring out from the heart. Purely feel, and the first
  // thing anybody notices about a tapping game.
  const [ripple, setRipple] = useState(0);
  const [slosh, setSlosh] = useState(false);
  const popupId = useRef(0);
  const ringRef = useRef(0);
  const [ringValue, setRingPhase] = useState(0);

  const reduced = state.settings.reducedMotion || state.settings.batterySaver;
  // "Some" used to be identical to "Full": the only check was `!== "off"`, so
  // the middle setting was a label with nothing behind it. It now halves the
  // number of numbers in the air, which is what someone picking it wants.
  const particlesOn = state.settings.particles !== "off" && !state.settings.batterySaver;
  const popupCap = state.settings.particles === "reduced" ? Math.ceil(MAX_POPUPS / 3) : MAX_POPUPS;
  const format = state.settings.numberFormat;
  const ringPhase = reduced ? 1 : ringValue;


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
      setPopups((prev) => [...prev.slice(-(popupCap - 1)), { id, x, y, text, kind }]);
      setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 900);
    },
    [particlesOn, popupCap],
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

  const tap = useCallback(() => {
    const at = Date.now();
    // Bumping a counter remounts the ring below, which replays its animation.
    // Cheaper and steadier than a timer, and it cannot leak one.
    setRipple((n) => n + 1);

    mutate((draft) => {
      const d = derive(draft, at);
      const outcome = performClick(draft, d, {
        precision: ringRef.current,
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
        buzz(6);
        cue("tap");
      }

      // The jar answers every tap, not only the rare ones.
      if (!reduced) {
        setSlosh(true);
        setTimeout(() => setSlosh(false), 520);
      }
    });
  }, [addPopup, buzz, cue, format, mutate, reduced, state.settings.screenShake]);

  // Everything drawn takes its colour from the jar, so moving up changes the
  // whole picture rather than a label.
  const accent = jar.glass;
  const full = derived.jarCapacity > 0
    ? Math.min(1, state.wallet.hearts / derived.jarCapacity)
    : 0;
  const readyToSeal = state.wallet.hearts >= derived.jarCapacity;

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

    return (
    // The jar stays a column even on a wide window. It is one object and a
    // button; stretching it to fifteen hundred pixels makes a short, very wide
    // rectangle with a heart lost in the middle of it. The screens with two
    // things to look at, the trees, are the ones that use the width.
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <NewsTicker stage={derived.stage} />

      {/* The jar itself, with the hearts you can count in it, and the pets on
          the table around it rather than swimming inside it. */}
      <div
        data-tour="vessel"
        className={`relative flex items-end justify-center gap-1 rounded-card border border-line bg-white px-2 pt-3 ${shake ? "jar-shake" : ""} ${slosh ? "jar-slosh" : ""}`}
        style={{ backgroundColor: jar.backdrop }}
      >
        {/* Her side of the table */}
        <span className="flex w-16 shrink-0 flex-wrap items-end justify-end gap-0.5 pb-6">
          {otters.map((creature) => {
            const def = CREATURE_BY_ID[creature.defId];
            if (!def) return null;
            return (
              <span
                key={creature.id}
                title={`${creature.name ?? def.name}, level ${creature.level}`}
                className={reduced ? "" : "float-bob"}
              >
                <CreatureGlyph line="otter" color={def.color} className="h-7 w-7" />
              </span>
            );
          })}
        </span>

        <TheJar
          hearts={state.wallet.hearts}
          jar={jar}
          capacity={derived.jarCapacity}
          reducedMotion={reduced}
          className="h-48 w-40 shrink-0"
        />

        {/* His side of the table */}
        <span className="flex w-16 shrink-0 flex-wrap items-end justify-start gap-0.5 pb-6">
          {crabs.map((creature) => {
            const def = CREATURE_BY_ID[creature.defId];
            if (!def) return null;
            return (
              <span
                key={creature.id}
                title={`${creature.name ?? def.name}, level ${creature.level}`}
                className={reduced ? "" : "scuttle"}
              >
                <CreatureGlyph line="crab" color={def.color} className="h-7 w-7" />
              </span>
            );
          })}
        </span>

        {/* The shelf the jar stands on. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 bottom-2 h-1.5 rounded-full"
          style={{ backgroundColor: jar.shelf, opacity: 0.7 }}
        />

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
              color: popup.kind === "mega" ? "#c99a3f" : popup.kind === "bonus" ? "#3f7a80" : accent,
            }}
          >
            {popup.text}
          </span>
        ))}

        {/* What it is, and how close it is to full. */}
        <p className="absolute left-3 top-2 text-[0.65rem] font-semibold text-berry-soft">
          {jar.name} · {formatNumber(state.wallet.hearts, format)}
          {derived.jarCapacity === Infinity
            ? ""
            : ` / ${formatNumber(derived.jarCapacity, format)}`}
        </p>
        {readyToSeal && (
          <span className="absolute right-3 top-2 rounded-full bg-rose-dark px-2 py-0.5 text-[0.6rem] font-bold text-white">
            Full
          </span>
        )}
      </div>

      {/* The heart */}
      <div data-tour="tap" className="flex flex-col items-center gap-1.5">
        <button
          onPointerDown={tap}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Tap the heart"
          className="touch-draw relative flex h-32 w-32 select-none items-center justify-center rounded-full"
          style={{ color: accent }}
        >
          <span
            aria-hidden="true"
            className="absolute rounded-full border-4"
            style={{
              width: `${54 + (1 - ringPhase) * 44}%`,
              height: `${54 + (1 - ringPhase) * 44}%`,
              borderColor: ringPhase > 0.8 ? "#c99a3f" : accent,
              opacity: reduced ? 0.25 : 0.3 + ringPhase * 0.4,
            }}
          />
          {/* A quiet ring keeping time with the taps the jar makes for you, so
              automated play reads as play rather than as nothing happening. */}
          {state.auto.tap && derived.autoTapsPerSecond > 0 && !reduced && (
            <span
              aria-hidden="true"
              className="auto-pulse absolute h-24 w-24 rounded-full border-2"
              style={{
                borderColor: accent,
                animationDuration: `${Math.max(160, 1000 / derived.autoTapsPerSecond)}ms`,
              }}
            />
          )}
          {ripple > 0 && !reduced && (
            <span
              key={ripple}
              aria-hidden="true"
              className="tap-ring absolute h-28 w-28 rounded-full border-2"
              style={{ borderColor: accent }}
            />
          )}
          <HeartIcon className="h-20 w-20 drop-shadow" />
        </button>
        <p className="text-xs font-semibold" style={{ color: accent }}>
          {state.auto.tap
            ? `Tapping for you, ${formatNumber(derived.autoTapsPerSecond, format)} a second`
            : ringPhase > 0.8
              ? "Perfect timing"
              : "Tap the heart"}
        </p>
      </div>

      {/* Numbers, which arrive as they start to mean something. Six of these on
          a first run was six things to wonder about before the first upgrade.

          Built as a list rather than six conditionals inside a fixed three
          column grid, which rendered one card and two empty cells on a fresh
          save and five cards and one empty cell in the middle of a run. The
          row never balanced at any point in the game. */}
      {(() => {
        const stats: { label: string; value: string; tone?: "accent" }[] = [
          { label: "Per tap", value: formatNumber(derived.heartsPerClick, format), tone: "accent" },
        ];
        if (derived.heartsPerSecond > 0) {
          stats.push({ label: "Per second", value: formatNumber(derived.heartsPerSecond, format) });
        }
        if (state.combo > 0) {
          stats.push({ label: "Combo", value: `${state.combo} / ${derived.comboCap}` });
        }
        if (has("upgrades")) {
          stats.push({ label: "Critical", value: formatPercent(derived.critChance, 1) });
        }
        if (has("shelf")) {
          stats.push({ label: "On the shelf", value: formatNumber(state.shelfHearts, format) });
        }
        if (has("seal")) {
          stats.push({ label: "Jars sealed", value: `${state.stats.jarsSealed}` });
        }
        const columns = Math.min(3, stats.length);
        return (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {stats.map((stat) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </div>
        );
      })()}

      {/* Warmth, which is the shared one */}
      {has("us") && state.tideLevel > 0 && (
        <div className="rounded-card border border-line bg-white p-3">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-plum">Warmth</span>
            <span className="text-berry-soft">
              +{Math.round(Math.min(1, state.tideLevel / 100) * 60)}% to everything
            </span>
          </div>
          <Bar value={state.tideLevel} max={100} color="#7c6ba8" />
        </div>
      )}

      {/* Sealing, which is the loop the whole game runs on. */}
      {has("seal") && (
        <div className="rounded-card border border-line bg-white p-3.5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-display text-lg text-plum">
              {readyToSeal ? "The jar is full" : "Filling"}
            </span>
            <span className="text-xs text-berry-soft">
              {readyToSeal
                ? `${derived.ribbonsIfSealed} ribbon${derived.ribbonsIfSealed === 1 ? "" : "s"}`
                : `${Math.floor(full * 100)}%`}
            </span>
          </div>
          <Bar value={full * 100} max={100} color={jar.glass} label="How full the jar is" />
          <button
            disabled={!readyToSeal}
            onClick={() =>
              mutate((draft) => {
                const result = sealCurrentJar(draft, Date.now());
                if (result.message) notify({ kind: "reward", title: result.message });
                if (result.ok) {
                  cue("unlock");
                  buzz([20, 40, 20]);
                }
              })
            }
            className={`pressable mt-2.5 w-full rounded-full py-2 text-sm font-bold ${
              readyToSeal ? "bg-rose-dark text-white" : "bg-cream text-berry-soft"
            }`}
          >
            {readyToSeal ? "Seal it and put it on the shelf" : "Not full yet"}
          </button>
        </div>
      )}

      {/* The colours, once they mean something. */}
      {has("colours") && state.wallet.hearts >= 10 && (
        <HeartLadder hearts={state.wallet.hearts} />
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
      {has("tideChange") && state.runHearts < TIDE_REQUIREMENT && (
        <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-berry">Next rebirth</p>
            <p className="text-xs text-berry-soft">
              {formatNumber(state.runHearts, format)} / {formatNumber(TIDE_REQUIREMENT, format)}
            </p>
          </div>
          <Bar value={state.runHearts} max={TIDE_REQUIREMENT} label="Progress toward a rebirth" />
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
      {has("upgrades") && (
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
      )}

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

/**
 * Something to read while you tap.
 *
 * Borrowed from Cookie Clicker, and doing nothing mechanical on purpose: a
 * line that paid out would become something to farm. It is filtered by stage,
 * so nothing here spoils a mechanic that has not arrived yet.
 */
function NewsTicker({ stage }: { stage: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), NEWS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const line = newsLine(stage, now);
  return (
    <p
      key={line}
      className="fade-in rounded-full border border-line-soft bg-white/70 px-4 py-1.5 text-center text-xs italic text-berry-soft"
      aria-live="off"
    >
      {line}
    </p>
  );
}
