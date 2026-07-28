"use client";

// Missions, challenges, achievements and collections.

import { useMemo, useState } from "react";
import { CheckCircle2, Flag, Swords, Trophy } from "lucide-react";
import { useGame } from "@/game/store";
import {
  CHALLENGES, MISSION_BY_ID, METRIC_LABEL, type ChallengeDef, type MissionPeriod,
} from "@/game/config/objectives";
import { ACHIEVEMENTS, ACHIEVEMENT_TOTAL, COLLECTIONS, LETTER_TEXT } from "@/game/config/awards";
import { claimMission, finishChallenge, rerollMission, startChallenge } from "@/game/actions";
import { metricTotal } from "@/game/engine";
import { hasFlag } from "@/game/formulas";
import { formatDurationShort, formatNumber } from "@/game/numbers";
import { Button, ConfirmDialog, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { Bar, EmptyRow, Section } from "./bits";

const PERIOD_LABEL: Record<MissionPeriod, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  story: "Story",
  mastery: "Mastery",
};

export function MissionsTab() {
  const { state, mutate, today, version } = useGame();
  const toast = useToast();
  const format = state.settings.numberFormat;

  const grouped = useMemo(() => {
    const groups = new Map<MissionPeriod, typeof state.missions>();
    for (const mission of state.missions) {
      const def = MISSION_BY_ID[mission.defId];
      if (!def) continue;
      const list = groups.get(def.period) ?? [];
      list.push(mission);
      groups.set(def.period, list);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const order: MissionPeriod[] = ["story", "daily", "weekly", "monthly", "mastery"];

  return (
    <div className="flex flex-col gap-5">
      {order.map((period) => {
        const missions = grouped.get(period) ?? [];
        if (missions.length === 0) return null;
        return (
          <Section key={period} title={PERIOD_LABEL[period]}>
            <ul className="flex flex-col gap-2">
              {missions.map((mission) => {
                const def = MISSION_BY_ID[mission.defId];
                if (!def) return null;
                // Long-lived missions read the lifetime total; short ones
                // measure what you did during their window.
                const progress =
                  period === "story" || period === "mastery" || def.metric === "bestCombo"
                    ? Math.max(mission.progress, metricTotal(state, def.metric))
                    : mission.progress;
                const complete = progress >= mission.goal;
                return (
                  <li
                    key={mission.id}
                    className={`rounded-card border bg-white p-3.5 shadow-soft ${
                      mission.claimed ? "border-line-soft opacity-60" : "border-line"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-rose-dark">
                        {mission.claimed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Flag className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-berry">{def.name}</p>
                        <p className="text-xs text-berry-soft">
                          {formatNumber(Math.min(progress, mission.goal), format)} /{" "}
                          {formatNumber(mission.goal, format)} {METRIC_LABEL[def.metric]}
                        </p>
                        <div className="mt-1.5">
                          <Bar value={progress} max={mission.goal} height="0.3rem" />
                        </div>
                        <p className="mt-1 text-[0.65rem] text-berry-soft">
                          {Object.entries(def.reward)
                            .filter(([, value]) => typeof value === "number")
                            .map(([key, value]) => `${value} ${key}`)
                            .join(" · ") || "A collectible"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button
                          size="sm"
                          disabled={!complete || mission.claimed}
                          onClick={() =>
                            mutate((draft) => {
                              const result = claimMission(draft, mission.id);
                              toast(result.message ?? "Not finished yet");
                            })
                          }
                        >
                          {mission.claimed ? "Claimed" : "Claim"}
                        </Button>
                        {period === "daily" && !mission.claimed && !mission.rerolled && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              mutate((draft) => {
                                const result = rerollMission(draft, mission.id, today);
                                toast(result.message ?? "Could not reroll");
                              })
                            }
                          >
                            Reroll
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}

      {state.missions.length === 0 && (
        <EmptyRow>Missions arrive with the new day. Come back after midnight.</EmptyRow>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

export function ChallengesTab() {
  const { state, mutate, version, now, notify } = useGame();
  const toast = useToast();
  const [confirm, setConfirm] = useState<ChallengeDef | null>(null);
  const format = state.settings.numberFormat;
  const unlocked = hasFlag(state, "challenges");
  const active = state.activeChallenge;
  const activeDef = active ? CHALLENGES.find((c) => c.id === active.defId) : null;

  const rows = useMemo(
    () =>
      CHALLENGES.map((def) => ({
        def,
        record: state.challenges[def.id] ?? { completed: 0, best: 0 },
        available:
          state.lifetime.hearts >= def.unlockLifetime &&
          (!def.requiresRebirths || state.rebirths >= def.requiresRebirths),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  if (!unlocked) {
    return (
      <EmptyRow>
        Challenge modes unlock with a rebirth upgrade. They are runs with one rule removed and one
        reward that only comes from there.
      </EmptyRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {active && activeDef && (
        <div className="rounded-card border border-rose-dark bg-white p-3.5 shadow-soft">
          <p className="text-sm font-semibold text-berry">Running: {activeDef.name}</p>
          <p className="text-xs text-berry-soft">{activeDef.description}</p>
          <div className="mt-2">
            <div className="flex items-baseline justify-between text-xs text-berry-soft">
              <span>{METRIC_LABEL[activeDef.goal.metric]}</span>
              <span>
                {formatNumber(active.score, format)} / {formatNumber(activeDef.goal.amount, format)}
              </span>
            </div>
            <Bar value={active.score} max={activeDef.goal.amount} />
          </div>
          {active.endsAt && (
            <p className="mt-1.5 text-xs text-berry-soft">
              {formatDurationShort(Math.max(0, active.endsAt - now))} left
            </p>
          )}
          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() =>
                mutate((draft) => {
                  const result = finishChallenge(draft, Date.now(), false);
                  if (result.cleared) {
                    notify({ kind: "reward", title: result.message ?? "Cleared", detail: "Rewards added." });
                  } else {
                    toast(result.message ?? "Not there yet");
                  }
                })
              }
            >
              Finish now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                mutate((draft) => {
                  finishChallenge(draft, Date.now(), true);
                  toast("Challenge abandoned. Your run is back.");
                })
              }
            >
              Abandon
            </Button>
          </div>
        </div>
      )}

      <Section
        title="Challenges"
        hint="Entering one puts your run aside and gives it back when you finish."
      >
        <ul className="flex flex-col gap-2">
          {rows.map(({ def, record, available }) => (
            <li
              key={def.id}
              className={`rounded-card border bg-white p-3.5 shadow-soft ${
                available ? "border-line" : "border-line-soft opacity-60"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-rose-dark">
                  <Swords className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                    <span className="truncate">{def.name}</span>
                    <span className="shrink-0 text-[0.65rem] font-bold text-berry-soft">
                      {"·".repeat(def.difficulty)}
                    </span>
                    {record.completed > 0 && (
                      <span className="shrink-0 rounded-full bg-blush px-2 py-0.5 text-[0.6rem] font-bold text-rose-dark">
                        {record.completed}x
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-berry-soft">{def.description}</p>
                  <p className="mt-1 text-[0.65rem] text-berry-soft">
                    Goal: {formatNumber(def.goal.amount, format)} {METRIC_LABEL[def.goal.metric]}
                    {def.timeLimit ? ` in ${Math.round(def.timeLimit / 60)} minutes` : ", no timer"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!available || Boolean(active)}
                  onClick={() => setConfirm(def)}
                >
                  Start
                </Button>
              </div>
              {!available && (
                <p className="mt-1.5 text-[0.65rem] text-berry-soft">
                  {def.requiresRebirths && state.rebirths < def.requiresRebirths
                    ? `Needs ${def.requiresRebirths} rebirths.`
                    : `Needs ${formatNumber(def.unlockLifetime, format)} lifetime hearts.`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? `Start ${confirm.name}?` : ""}
        message={
          confirm
            ? `${confirm.description} Your current run is saved and handed back when the challenge ends, so this costs you nothing but time.`
            : ""
        }
        confirmLabel="Start"
        onConfirm={() => {
          if (!confirm) return;
          mutate((draft) => {
            const result = startChallenge(draft, confirm.id, Date.now());
            toast(result.message ?? "Could not start that");
          });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export function AchievementsTab() {
  const { state, version } = useGame();
  const [showHidden, setShowHidden] = useState<"all" | "earned" | "remaining">("all");
  const format = state.settings.numberFormat;

  const rows = useMemo(
    () =>
      ACHIEVEMENTS.map((def) => {
        const tier = state.achievements[def.id]?.tier ?? 0;
        const total = metricTotal(state, def.metric);
        const nextGoal = tier < def.tiers.length ? def.tiers[tier] : def.tiers[def.tiers.length - 1];
        return { def, tier, total, nextGoal, done: tier >= def.tiers.length };
      }).filter((row) => {
        if (row.def.hidden && row.tier === 0) return false;
        if (showHidden === "earned") return row.tier > 0;
        if (showHidden === "remaining") return !row.done;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, showHidden],
  );

  const earned = ACHIEVEMENTS.reduce((sum, def) => sum + (state.achievements[def.id]?.tier ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <Section title="Achievements" hint={`${earned} of ${ACHIEVEMENT_TOTAL} unlocked`}>
        <Bar value={earned} max={ACHIEVEMENT_TOTAL} />
      </Section>

      <SegmentedControl
        label="Achievement filter"
        value={showHidden}
        onChange={setShowHidden}
        options={[
          { value: "all", label: "All" },
          { value: "earned", label: "Earned" },
          { value: "remaining", label: "Remaining" },
        ]}
      />

      <ul className="flex flex-col gap-2">
        {rows.map(({ def, tier, total, nextGoal, done }) => (
          <li key={def.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 ${tier > 0 ? "text-rose-dark" : "text-line"}`}>
                <Trophy className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                  <span className="truncate">{def.name}</span>
                  {tier > 0 && (
                    <span className="shrink-0 rounded-full bg-blush px-2 py-0.5 text-[0.6rem] font-bold text-rose-dark">
                      tier {tier}/{def.tiers.length}
                    </span>
                  )}
                </p>
                <p className="text-xs text-berry-soft">{def.description}</p>
                {!done && (
                  <>
                    <div className="mt-1.5">
                      <Bar value={total} max={nextGoal} height="0.25rem" />
                    </div>
                    <p className="mt-0.5 text-[0.65rem] text-berry-soft">
                      {formatNumber(total, format)} / {formatNumber(nextGoal, format)}
                    </p>
                  </>
                )}
                {done && <p className="mt-1 text-[0.65rem] font-semibold text-success">Every tier earned</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-berry-soft">
        Hidden achievements only appear here once you have found them.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export function CollectionsTab() {
  const { state, mutate, version } = useGame();
  const [letter, setLetter] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      COLLECTIONS.map((collection) => {
        const owned = state.collections[collection.id] ?? [];
        return { collection, owned, complete: owned.length >= collection.items.length };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <div className="flex flex-col gap-5">
      {rows.map(({ collection, owned, complete }) => (
        <Section
          key={collection.id}
          title={collection.name}
          hint={`${owned.length} of ${collection.items.length}${complete ? " · complete" : ""}`}
        >
          <ul className="grid grid-cols-2 gap-2">
            {collection.items.map((item) => {
              const has = owned.includes(item.id);
              const isTitle = collection.id === "titles";
              const isLetter = collection.id === "letters";
              return (
                <li key={item.id}>
                  <button
                    disabled={!has || (!isTitle && !isLetter)}
                    onClick={() => {
                      if (isLetter) setLetter(item.id);
                      if (isTitle) mutate((draft) => void (draft.activeTitle = item.name));
                    }}
                    className={`flex w-full flex-col gap-0.5 rounded-xl border p-3 text-left ${
                      has ? "border-line bg-white" : "border-dashed border-line bg-white/50"
                    } ${state.activeTitle === item.name ? "ring-2 ring-rose-dark" : ""}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: has
                            ? item.rarity === "legendary"
                              ? "#c99a3f"
                              : item.rarity === "rare"
                                ? "#4f7bd0"
                                : "#8a7f86"
                            : "var(--color-line)",
                        }}
                      />
                      <span className="truncate text-xs font-bold text-berry">
                        {has ? item.name : "Not found"}
                      </span>
                    </span>
                    <span className="text-[0.65rem] text-berry-soft">{item.source}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {complete && (
            <p className="rounded-xl bg-blush/50 px-3.5 py-2 text-xs font-semibold text-rose-dark">
              Set complete. Reward:{" "}
              {Object.entries(collection.completion)
                .map(([key, value]) => `${value} ${key}`)
                .join(", ")}
            </p>
          )}
        </Section>
      ))}

      <Sheet open={Boolean(letter)} onClose={() => setLetter(null)} title="A love letter">
        <p className="pt-2 font-display text-lg leading-relaxed text-plum">
          {letter ? LETTER_TEXT[letter] : ""}
        </p>
      </Sheet>
    </div>
  );
}
