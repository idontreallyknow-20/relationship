"use client";

// Us, statistics, the codex, settings and the mini-games.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Heart, Plane } from "lucide-react";
import { useCouple, useWho } from "@/lib/couple-context";
import { setFocusMode, useFocusMode } from "@/lib/focus";
import { useCachedQuery } from "@/lib/offline/cache";
import { displayName } from "@/lib/types";
import { useGame } from "@/game/store";
import { CURRENCIES } from "@/game/config/currencies";
import { MEMORIES, TRIPS } from "@/game/config/memories";
import { METERS, meterMods, togetherBonus } from "@/game/config/meters";
import { CREATURES } from "@/game/config/creatures";
import { VESSELS } from "@/game/config/vessels";
import { TREES, UPGRADES } from "@/game/config/upgrades";
import { SKILLS } from "@/game/config/skills";
import { CHALLENGES } from "@/game/config/objectives";
import { RESET_LAYERS } from "@/game/config/resets";
import { buyMemory, startTrip } from "@/game/actions";
import { addCurrency, earnHearts, recordMetric } from "@/game/engine";
import { loadDailyScores, type DailyRow } from "@/game/persistence";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import type { GameSettings } from "@/game/types";
import { Button, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { Bar, CurrencyPill, EmptyRow, Section, Stat } from "./bits";

/* ------------------------------------------------------------------ */
/* Us                                                                  */
/* ------------------------------------------------------------------ */

export function UsTab() {
  const { state, mutate, now } = useGame();
  const { partner: partnerProfile } = useCouple();
  const { me, partner } = useWho();
  const toast = useToast();
  const format = state.settings.numberFormat;
  const partnerName = partnerProfile?.display_name ?? displayName(partner);

  const since = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const daily = useCachedQuery<DailyRow[]>("game:daily", () => loadDailyScores(since), [since]);

  const totals = useMemo(() => {
    const out: Record<string, number> = { [me]: 0, [partner]: 0 };
    for (const row of daily.data ?? []) out[row.person] = (out[row.person] ?? 0) + Number(row.hearts);
    return out;
  }, [daily.data, me, partner]);

  const ownedMemories = state.collections["memories"] ?? [];
  const pairBonus = togetherBonus(state.lifetime.hearts, state.storyProgress["partnerLifetime"] ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <Section title="The jar, both of you" hint="Added together, not compared.">
        <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
          <p className="font-display text-3xl font-semibold text-plum">
            {formatNumber((totals[me] ?? 0) + (totals[partner] ?? 0), format)}
          </p>
          <p className="text-xs text-berry-soft">hearts between you this week</p>
          <span className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-cream">
            <span
              style={{
                width: `${((totals[me] ?? 0) / Math.max(1, (totals[me] ?? 0) + (totals[partner] ?? 0))) * 100}%`,
                backgroundColor: "var(--color-rose-dark)",
              }}
            />
            <span
              style={{
                width: `${((totals[partner] ?? 0) / Math.max(1, (totals[me] ?? 0) + (totals[partner] ?? 0))) * 100}%`,
                backgroundColor: "var(--color-lavender-deep)",
              }}
            />
          </span>
          <p className="mt-1.5 text-xs text-berry-soft">
            You {formatNumber(totals[me] ?? 0, format)} · {partnerName}{" "}
            {formatNumber(totals[partner] ?? 0, format)}
          </p>
          {pairBonus > 1.001 && (
            <p className="mt-2 rounded-xl bg-blush/60 px-3 py-1.5 text-xs font-semibold text-rose-dark">
              Between you: {pairBonus.toFixed(2)}x on everything
            </p>
          )}
        </div>
      </Section>

      <Section title="Love meters" hint="They fill from the rest of the app, and fall on their own.">
        <ul className="flex flex-col gap-2">
          {METERS.map((meter) => {
            const level = state.meters[meter.id] ?? 0;
            const mods = meterMods(meter, level);
            const best = Object.values(mods.mul ?? {}).sort((a, b) => b - a)[0] ?? 1;
            return (
              <li key={meter.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-berry">{meter.name}</p>
                  <p className="text-xs font-bold" style={{ color: meter.color }}>
                    {best > 1.001 ? `${best.toFixed(2)}x` : "nothing yet"}
                  </p>
                </div>
                <Bar value={level} max={100} color={meter.color} />
                <p className="mt-1 text-[0.65rem] text-berry-soft">{meter.fills}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Tide" hint="Rises when either of you plays. Spends on everything here.">
        <div className="rounded-card border border-line bg-white p-3.5">
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-semibold text-plum">{Math.round(state.tideLevel)}%</span>
            <span className="text-xs text-berry-soft">
              {formatNumber(state.wallet.tide, format)} tide saved
            </span>
          </div>
          <Bar value={state.tideLevel} max={100} color="#7c6ba8" />
        </div>
      </Section>

      <Section title="Memories" hint="Permanent, and about the two of you.">
        <ul className="flex flex-col gap-2">
          {MEMORIES.map((memory) => {
            const owned = ownedMemories.includes(memory.id);
            const ready = state.lifetime.hearts >= memory.unlockLifetime;
            const affordable = state.wallet.tide >= memory.cost;
            return (
              <li
                key={memory.id}
                className={`rounded-card border bg-white p-3.5 shadow-soft ${owned ? "border-rose-dark" : "border-line"}`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-rose-dark"><Heart className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-berry">{memory.name}</p>
                    <p className="text-xs italic text-berry-soft">{ready || owned ? memory.line : "Not yet."}</p>
                    {(ready || owned) && (
                      <p className="mt-1 text-xs font-semibold text-plum">{memory.effect}</p>
                    )}
                  </div>
                  {owned ? (
                    <span className="shrink-0 rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-rose-dark">
                      Yours
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!ready || !affordable}
                      onClick={() =>
                        mutate((draft) => {
                          const result = buyMemory(draft, memory.id);
                          toast(result.message ?? "Not yet");
                        })
                      }
                    >
                      {memory.cost} tide
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Trips" hint="Temporary, and you can take them again.">
        <ul className="flex flex-col gap-2">
          {TRIPS.map((trip) => {
            const away = state.buffs.some((b) => b.source === `trip:${trip.id}`);
            const ready = state.lifetime.hearts >= trip.unlockLifetime;
            const buff = state.buffs.find((b) => b.source === `trip:${trip.id}`);
            return (
              <li key={trip.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-lavender-deep"><Plane className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-berry">{trip.name}</p>
                    <p className="text-xs italic text-berry-soft">{trip.line}</p>
                    <p className="mt-1 text-xs font-semibold text-plum">{trip.effect}</p>
                    {away && buff && (
                      <p className="mt-1 text-[0.65rem] font-semibold text-rose-dark">
                        {formatDurationShort(Math.max(0, buff.expiresAt - now))} left
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={away || !ready || state.wallet.tide < trip.cost}
                    onClick={() =>
                      mutate((draft) => {
                        const result = startTrip(draft, trip.id, Date.now());
                        toast(result.message ?? "Not yet");
                      })
                    }
                  >
                    {away ? "Away" : `${trip.cost} tide`}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export function StatsTab() {
  const { state, derived, version } = useGame();
  const format = state.settings.numberFormat;
  const history = useMemo(() => state.stats.history.slice(-14), [state.stats.history, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxDay = Math.max(1, ...history.map((h) => h.hearts));

  const breakdown = [
    ["Tapping", state.stats.heartsFromClicks],
    ["Criticals", state.stats.heartsFromCrits],
    ["Creatures", state.stats.heartsFromCreatures],
    ["The jar", state.stats.heartsFromPassive],
    ["Abilities", state.stats.heartsFromSkills],
    ["Away", state.stats.heartsFromOffline],
    ["Together", state.stats.heartsFromTogether],
    ["Drifters", state.stats.heartsFromDrifters],
  ] as const;
  const total = Math.max(1, breakdown.reduce((sum, [, v]) => sum + v, 0));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Now">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Hearts" value={formatNumber(state.wallet.hearts, format)} tone="accent" />
          <Stat label="Lifetime" value={formatNumber(state.lifetime.hearts, format)} />
          <Stat label="Per tap" value={formatNumber(derived.heartsPerClick, format)} />
          <Stat label="Per second" value={formatNumber(derived.heartsPerSecond, format)} />
        </div>
      </Section>

      <Section title="Where they came from">
        <ul className="space-y-1.5">
          {breakdown.map(([label, value]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-berry-soft">{label}</span>
              <span className="flex-1"><Bar value={value} max={total} height="0.4rem" /></span>
              <span className="w-14 shrink-0 text-right text-[0.65rem] font-semibold text-berry">
                {formatNumber(value, format)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Two weeks">
        {history.length === 0 ? (
          <EmptyRow>Nothing yet.</EmptyRow>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {history.map((day) => (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className="w-full rounded-t bg-rose-dark"
                  style={{ height: `${Math.max(2, (day.hearts / maxDay) * 100)}%` }}
                  title={`${day.day}: ${formatNumber(day.hearts, format)}`}
                />
                <span className="text-[0.5rem] text-berry-soft">{day.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Everything else">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Taps" value={formatNumber(state.stats.totalClicks, format)} />
            <Stat label="Criticals" value={formatNumber(state.stats.criticalClicks, format)} />
          <Stat label="Best combo" value={`${state.stats.bestCombo}`} />
          <Stat label="Cracked" value={formatNumber(state.stats.cracks, format)} />
          <Stat label="Collected" value={formatNumber(state.stats.collects, format)} />
          <Stat label="Drifters" value={`${state.stats.driftersOpened}`} />
          <Stat label="Creatures" value={`${state.codex.length}`} />
          <Stat label="Grown" value={`${state.stats.creaturesEvolved}`} />
          <Stat label="Vessels" value={`${state.vesselsUnlocked.length}`} />
          <Stat label="Tide changes" value={`${state.tideChanges}`} />
          <Stat label="New water" value={`${state.newWaters}`} />
          <Stat
            label="Fastest tide"
            value={state.stats.fastestTideChangeMs ? formatDurationShort(state.stats.fastestTideChangeMs) : "not yet"}
          />
          <Stat label="Longest session" value={formatDurationShort(state.stats.longestSessionMs)} />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Codex                                                               */
/* ------------------------------------------------------------------ */

type CodexSection = "currencies" | "creatures" | "vessels" | "upgrades" | "abilities" | "challenges" | "resets";

export function CodexTab() {
  const { state } = useGame();
  const [section, setSection] = useState<CodexSection>("creatures");

  const sections: { id: CodexSection; label: string }[] = [
    { id: "creatures", label: "Creatures" },
    { id: "vessels", label: "Vessels" },
    { id: "currencies", label: "Currencies" },
    { id: "upgrades", label: "Trees" },
    { id: "abilities", label: "Abilities" },
    { id: "challenges", label: "Challenges" },
    { id: "resets", label: "Resets" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {sections.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setSection(entry.id)}
            className={`pressable shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              section === entry.id ? "border-plum bg-plum text-white" : "border-line bg-white text-berry-soft"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5">
        <BookOpen className="h-4 w-4 shrink-0 text-rose-dark" />
        <p className="text-xs text-berry-soft">Things you have not reached stay vague.</p>
      </div>

      <ul className="flex flex-col gap-2">
        {section === "creatures" && CREATURES.map((def) => {
          const known = state.codex.includes(def.id);
          return (
            <Entry
              key={def.id}
              title={known ? def.name : "Not met yet"}
              body={known ? `${def.ability} ${def.blurb}` : `${def.line === "otter" ? "An otter" : "A crab"}.`}
              color={known ? def.color : "var(--color-line)"}
            />
          );
        })}
        {section === "vessels" && VESSELS.map((v) => (
          <Entry
            key={v.id}
            title={v.name}
            body={state.vesselsUnlocked.includes(v.id) ? `${v.blurb} ${v.rule}` : v.blurb}
            color={v.accent}
          />
        ))}
        {section === "currencies" && CURRENCIES.map((c) => (
          <Entry key={c.id} title={c.name} body={`${c.source} ${c.purpose}`} color={c.color} />
        ))}
        {section === "upgrades" && TREES.map((t) => (
          <Entry
            key={t.id}
            title={t.name}
            body={`${t.blurb} ${UPGRADES.filter((u) => u.tree === t.id).length} upgrades.`}
          />
        ))}
        {section === "abilities" && SKILLS.map((s) => (
          <Entry key={s.id} title={s.name} body={s.description} />
        ))}
        {section === "challenges" && CHALLENGES.map((c) => (
          <Entry key={c.id} title={c.name} body={c.description} />
        ))}
        {section === "resets" && RESET_LAYERS.map((l) => (
          <Entry key={l.id} title={l.name} body={`${l.blurb} Goes: ${l.resets.join("; ")}.`} />
        ))}
      </ul>
    </div>
  );
}

function Entry({ title, body, color }: { title: string; body: string; color?: string }) {
  return (
    <li className="rounded-card border border-line bg-white p-3.5 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
        {color && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
        <span className="truncate">{title}</span>
      </p>
      <p className="mt-0.5 text-xs text-berry-soft">{body}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function FocusToggle() {
  const focus = useFocusMode();
  return (
    <button
      role="switch"
      aria-checked={focus}
      onClick={() => setFocusMode(!focus)}
      className="pressable flex min-h-12 w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5"
    >
      <span className="text-sm font-semibold text-berry">Focus mode</span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full ${focus ? "bg-rose-dark" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft ${focus ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

export function SettingsTab() {
  const { state, mutate, flush } = useGame();
  const toast = useToast();

  const toggle = (key: keyof GameSettings, label: string) => (
    <button
      key={key}
      role="switch"
      aria-checked={Boolean(state.settings[key])}
      onClick={() => mutate((draft) => void ((draft.settings[key] as boolean) = !draft.settings[key]))}
      className="pressable flex min-h-12 w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5"
    >
      <span className="text-sm font-semibold text-berry">{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full ${state.settings[key] ? "bg-rose-dark" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft ${state.settings[key] ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <Section title="Feel">
        <div className="flex flex-col gap-2">
          {toggle("haptics", "Haptics")}
          {toggle("sound", "Sound")}
          {toggle("screenShake", "Screen shake")}
          {toggle("drifters", "Things drifting in")}
        </div>
      </Section>

      <Section title="Just the game">
        <FocusToggle />
      </Section>

      <Section title="Performance">
        <div className="flex flex-col gap-2">
          {toggle("reducedMotion", "Reduced motion")}
          {toggle("batterySaver", "Battery saver")}
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="mb-1.5 text-sm font-semibold text-berry">Particles</p>
            <SegmentedControl
              label="Particles"
              value={state.settings.particles}
              onChange={(v) => mutate((draft) => void (draft.settings.particles = v))}
              options={[
                { value: "full", label: "Full" },
                { value: "reduced", label: "Some" },
                { value: "off", label: "Off" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Numbers">
        <div className="rounded-xl border border-line bg-white p-3">
          <SegmentedControl
            label="Number format"
            value={state.settings.numberFormat}
            onChange={(v) => mutate((draft) => void (draft.settings.numberFormat = v))}
            options={[
              { value: "short", label: "1.2K" },
              { value: "scientific", label: "1.2e3" },
              { value: "engineering", label: "eng" },
              { value: "full", label: "Full" },
            ]}
          />
        </div>
      </Section>

      <Section title="Care">
        <div className="flex flex-col gap-2">{toggle("confirmRareSpends", "Ask before spending moons and stars")}</div>
      </Section>

      <Button
        variant="secondary"
        onClick={() => {
          void flush();
          toast("Saved");
        }}
      >
        Save now
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mini-games                                                          */
/* ------------------------------------------------------------------ */

type MiniGame = "catch" | "match" | "reaction";

export function MinigamesTab() {
  const [playing, setPlaying] = useState<MiniGame | null>(null);
  const games: { id: MiniGame; name: string; blurb: string }[] = [
    { id: "catch", name: "Catch what falls", blurb: "Twenty seconds. Nothing reaches the floor." },
    { id: "match", name: "Memory match", blurb: "Six pairs. Fewer turns pays more." },
    { id: "reaction", name: "Reaction", blurb: "Tap the moment it fills. Five rounds." },
  ];

  return (
    <div className="flex flex-col gap-3">
      {games.map((game) => (
        <button
          key={game.id}
          onClick={() => setPlaying(game.id)}
          className="pressable rounded-card border border-line bg-white p-3.5 text-left shadow-soft"
        >
          <p className="text-sm font-semibold text-berry">{game.name}</p>
          <p className="text-xs text-berry-soft">{game.blurb}</p>
        </button>
      ))}
      {playing === "catch" && <CatchGame onClose={() => setPlaying(null)} />}
      {playing === "match" && <MatchGame onClose={() => setPlaying(null)} />}
      {playing === "reaction" && <ReactionGame onClose={() => setPlaying(null)} />}
    </div>
  );
}

function useMiniReward() {
  const { mutate, derived } = useGame();
  const toast = useToast();
  return useCallback(
    (score: number, label: string) => {
      mutate((draft) => {
        earnHearts(draft, Math.max(1, derived.heartsPerSecond * 40 * score), "together");
        addCurrency(draft, "pearls", Math.max(1, Math.floor(score * 3)));
        addCurrency(draft, "shells", Math.max(1, Math.floor(score * 20)));
        draft.stats.minigamesPlayed += 1;
        recordMetric(draft, "minigames", 1);
      });
      toast(`${label}. Added.`);
    },
    [derived.heartsPerSecond, mutate, toast],
  );
}

function CatchGame({ onClose }: { onClose: () => void }) {
  const reward = useMiniReward();
  const [items, setItems] = useState<{ id: number; x: number; y: number }[]>([]);
  const [caught, setCaught] = useState(0);
  const [missed, setMissed] = useState(0);
  const [left, setLeft] = useState(20);
  const nextId = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    const spawn = setInterval(() => {
      setItems((prev) => [...prev.slice(-11), { id: ++nextId.current, x: 6 + Math.random() * 84, y: -8 }]);
    }, 620);
    const fall = setInterval(() => {
      setItems((prev) => {
        const next = prev.map((h) => ({ ...h, y: h.y + 5 }));
        const landed = next.filter((h) => h.y > 92).length;
        if (landed > 0) setMissed((m) => m + landed);
        return next.filter((h) => h.y <= 92);
      });
    }, 110);
    const clock = setInterval(() => setLeft((t) => Math.max(0, t - 1)), 1000);
    return () => {
      clearInterval(spawn);
      clearInterval(fall);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (left > 0 || done.current) return;
    done.current = true;
    reward(Math.max(0.2, caught / Math.max(1, caught + missed)) * (caught / 12), `Caught ${caught}`);
  }, [left, caught, missed, reward]);

  return (
    <Sheet open onClose={onClose} title="Catch what falls" tall>
      <div className="flex h-full flex-col gap-2 pt-1">
        <div className="flex justify-between text-sm font-semibold text-berry">
          <span>Caught {caught}</span>
          <span>Missed {missed}</span>
          <span>{left}s</span>
        </div>
        <div className="relative flex-1 overflow-hidden rounded-card border border-line bg-cream">
          {items.map((item) => (
            <button
              key={item.id}
              aria-label="Catch"
              onClick={() => {
                setItems((prev) => prev.filter((h) => h.id !== item.id));
                setCaught((c) => c + 1);
              }}
              className="absolute flex h-11 w-11 items-center justify-center text-rose-dark"
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
            >
              <HeartIcon className="h-7 w-7" />
            </button>
          ))}
          {left === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90">
              <p className="font-display text-2xl font-semibold text-plum">{caught}</p>
              <Button onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

const SYMBOLS = ["A", "B", "C", "D", "E", "F"];

function MatchGame({ onClose }: { onClose: () => void }) {
  const reward = useMiniReward();
  const [cards] = useState(() => {
    const deck = [...SYMBOLS, ...SYMBOLS].map((symbol, index) => ({ id: index, symbol }));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  });
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const timer = setTimeout(() => {
      if (cards[a].symbol === cards[b].symbol) setMatched((prev) => [...prev, a, b]);
      setFlipped([]);
      setTurns((t) => t + 1);
    }, 650);
    return () => clearTimeout(timer);
  }, [flipped, cards]);

  useEffect(() => {
    if (matched.length < cards.length || done.current) return;
    done.current = true;
    reward(Math.max(0.3, 12 / Math.max(6, turns)), `Matched in ${turns}`);
  }, [matched, cards.length, turns, reward]);

  return (
    <Sheet open onClose={onClose} title="Memory match">
      <div className="space-y-3 pt-1">
        <p className="text-sm text-berry-soft">Turns: {turns}</p>
        <div className="grid grid-cols-4 gap-2">
          {cards.map((card, index) => {
            const open = flipped.includes(index) || matched.includes(index);
            return (
              <button
                key={card.id}
                disabled={open || flipped.length === 2}
                onClick={() => setFlipped((prev) => (prev.length < 2 ? [...prev, index] : prev))}
                className={`pressable flex aspect-square items-center justify-center rounded-xl border text-lg font-bold ${
                  open ? "border-rose-dark bg-blush text-rose-dark" : "border-line bg-white text-transparent"
                }`}
              >
                {open ? card.symbol : "?"}
              </button>
            );
          })}
        </div>
        {matched.length === cards.length && (
          <Button className="w-full" onClick={onClose}>Done in {turns}</Button>
        )}
      </div>
    </Sheet>
  );
}

function ReactionGame({ onClose }: { onClose: () => void }) {
  const reward = useMiniReward();
  const [round, setRound] = useState(0);
  const [go, setGo] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const goAt = useRef(0);
  const done = useRef(false);
  const phase: "wait" | "go" | "done" = round >= 5 ? "done" : go ? "go" : "wait";

  useEffect(() => {
    if (round >= 5) return;
    const timer = setTimeout(() => {
      goAt.current = Date.now();
      setGo(true);
    }, 900 + Math.random() * 2_000);
    return () => clearTimeout(timer);
  }, [round]);

  useEffect(() => {
    if (phase !== "done" || done.current) return;
    done.current = true;
    const average = times.reduce((s, t) => s + t, 0) / Math.max(1, times.length);
    reward(Math.max(0.2, Math.min(1.5, 500 / Math.max(120, average))), `${Math.round(average)}ms`);
  }, [phase, times, reward]);

  return (
    <Sheet open onClose={onClose} title="Reaction">
      <div className="space-y-3 pt-1">
        <p className="text-sm text-berry-soft">Round {Math.min(round + 1, 5)} of 5</p>
        <button
          disabled={phase === "done"}
          onClick={() => {
            if (phase === "go") setTimes((prev) => [...prev, Date.now() - goAt.current]);
            else if (phase === "wait") setTimes((prev) => [...prev, 900]);
            else return;
            setGo(false);
            setRound((r) => r + 1);
          }}
          className={`flex h-48 w-full items-center justify-center rounded-card border text-lg font-bold ${
            phase === "go" ? "border-rose-dark bg-rose-dark text-white" : "border-line bg-white text-berry-soft"
          }`}
        >
          {phase === "go" ? "Now" : phase === "wait" ? "Wait" : "Done"}
        </button>
        {times.length > 0 && <p className="text-sm text-berry">{times.map((t) => `${t}ms`).join(" · ")}</p>}
        {phase === "done" && <Button className="w-full" onClick={onClose}>Done</Button>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Wallet strip                                                        */
/* ------------------------------------------------------------------ */

export function WalletStrip() {
  const { state } = useGame();
  const format = state.settings.numberFormat;
  const shown = CURRENCIES.filter(
    (c) => state.wallet[c.id] > 0 || c.id === "hearts" || c.id === "shells" || c.id === "glass",
  );
  return (
    <div data-tour="wallet" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1">
      {shown.map((c) => (
        <CurrencyPill key={c.id} currency={c.id} amount={state.wallet[c.id]} format={format} compact />
      ))}
    </div>
  );
}
