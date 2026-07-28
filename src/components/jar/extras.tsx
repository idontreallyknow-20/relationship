"use client";

// Shop, events, statistics, the couple leaderboard, the codex, settings and
// the mini-games.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Gift, PartyPopper, Trophy } from "lucide-react";
import { useCouple, useWho } from "@/lib/couple-context";
import { useCachedQuery } from "@/lib/offline/cache";
import { displayName } from "@/lib/types";
import { useGame } from "@/game/store";
import { SHOP_ITEMS } from "@/game/config/shop";
import { EVENTS, activeEvents } from "@/game/config/events";
import { CURRENCIES, CURRENCY_BY_ID } from "@/game/config/currencies";
import { UPGRADES, UPGRADE_TREES } from "@/game/config/upgrades";
import { SKILLS } from "@/game/config/skills";
import { PETS, RARITY_META } from "@/game/config/pets";
import { BOSSES, WORLDS } from "@/game/config/worlds";
import { CHALLENGES } from "@/game/config/objectives";
import { CHARM_SETS, CHARM_SLOTS } from "@/game/config/charms";
import { RESET_LAYERS } from "@/game/config/resets";
import { buyShopItem, claimEventShopItem } from "@/game/actions";
import { addCurrency, earnHearts, recordMetric } from "@/game/engine";
import { loadDailyScores, loadLeaderboard, type DailyRow, type LeaderRow } from "@/game/persistence";
import { formatDurationShort, formatNumber, formatMultiplier } from "@/game/numbers";
import type { GameSettings } from "@/game/types";
import { Button, SegmentedControl, Sheet, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { Bar, CurrencyPill, EmptyRow, Section, Stat } from "./bits";

/* ------------------------------------------------------------------ */
/* Shop                                                                */
/* ------------------------------------------------------------------ */

export function ShopTab() {
  const { state, mutate, version } = useGame();
  const toast = useToast();
  const [category, setCategory] = useState<"cosmetic" | "pets" | "boosts" | "utility">("cosmetic");
  const format = state.settings.numberFormat;

  const items = useMemo(
    () =>
      SHOP_ITEMS.filter((item) => item.category === category).map((item) => ({
        item,
        owned: item.once && state.shopPurchases.includes(item.id),
        unlocked: !item.unlockLifetime || state.lifetime.hearts >= item.unlockLifetime,
        affordable: Object.entries(item.cost).every(
          ([currency, amount]) => state.wallet[currency as keyof typeof state.wallet] >= (amount as number),
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, category],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-berry-soft">
        Everything here is bought with currencies you earned by playing. There is no real money
        in this app, and nothing here is required to progress.
      </p>

      <SegmentedControl
        label="Shop category"
        value={category}
        onChange={setCategory}
        options={[
          { value: "cosmetic", label: "Looks" },
          { value: "pets", label: "Pets" },
          { value: "boosts", label: "Boosts" },
          { value: "utility", label: "Utility" },
        ]}
      />

      <ul className="flex flex-col gap-2">
        {items.map(({ item, owned, unlocked, affordable }) => (
          <li key={item.id} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
            <div className="flex items-start gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush text-rose-dark">
                <Gift className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-berry">{item.name}</p>
                <p className="text-xs text-berry-soft">{item.description}</p>
                {!unlocked && (
                  <p className="mt-1 text-[0.65rem] text-berry-soft">
                    Unlocks at {formatNumber(item.unlockLifetime!, format)} lifetime hearts.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                disabled={owned || !unlocked || !affordable}
                onClick={() =>
                  mutate((draft) => {
                    const result = buyShopItem(draft, item.id, Date.now());
                    toast(result.message ?? "Could not buy that");
                  })
                }
              >
                {owned
                  ? "Owned"
                  : Object.entries(item.cost)
                      .map(([currency, amount]) => `${formatNumber(amount as number, format)} ${CURRENCY_BY_ID[currency as keyof typeof CURRENCY_BY_ID]?.short}`)
                      .join(" ")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export function EventsTab() {
  const { state, mutate, version, now } = useGame();
  const { couple } = useCouple();
  const toast = useToast();
  const format = state.settings.numberFormat;

  const running = useMemo(
    () => activeEvents(new Date(now), couple.start_date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, couple.start_date],
  );

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Running now"
        hint={`${formatNumber(state.wallet.event, format)} event tokens in your wallet`}
      >
        {running.length === 0 ? (
          <EmptyRow>
            No event is running right now. Weekends, Mondays, Wednesdays and the first of the
            month all have one, and so does your anniversary.
          </EmptyRow>
        ) : (
          <ul className="flex flex-col gap-3">
            {running.map((event) => {
              const progress = state.events[event.id] ?? { progress: 0, claimed: [], currency: 0 };
              return (
                <li key={event.id} className="overflow-hidden rounded-card border border-line bg-white shadow-soft">
                  <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ backgroundColor: event.accent }}>
                    <PartyPopper className="h-4 w-4 text-white" />
                    <p className="font-display text-lg font-semibold text-white">{event.name}</p>
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm text-berry">{event.blurb}</p>
                    <p className="mt-1 text-xs italic text-berry-soft">{event.story}</p>
                    <p className="mt-2 text-xs font-semibold text-rose-dark">
                      While it runs:{" "}
                      {Object.entries(event.mods.mul ?? {})
                        .map(([key, value]) => `${formatMultiplier(value as number)} ${key}`)
                        .join(", ") || "special rules"}
                    </p>
                    <p className="mt-1 text-[0.65rem] text-berry-soft">{event.tokenRule}</p>

                    <div className="mt-3">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-berry-soft">
                        Event missions
                      </p>
                      <ul className="space-y-1.5">
                        {event.missions.map((mission) => (
                          <li key={mission.id} className="rounded-xl border border-line-soft px-3 py-2">
                            <p className="text-xs font-semibold text-berry">{mission.name}</p>
                            <p className="text-[0.65rem] text-berry-soft">
                              Goal {formatNumber(mission.goal, format)} ·{" "}
                              {Object.entries(mission.reward)
                                .filter(([, value]) => typeof value === "number")
                                .map(([key, value]) => `${value} ${key}`)
                                .join(", ")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-3">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-berry-soft">
                        Event shop
                      </p>
                      <ul className="space-y-1.5">
                        {event.shop.map((item) => {
                          const bought = progress.claimed.includes(item.id);
                          return (
                            <li
                              key={item.id}
                              className="flex items-center gap-2 rounded-xl border border-line-soft px-3 py-2"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-berry">{item.name}</span>
                                <span className="block text-[0.65rem] text-berry-soft">
                                  {item.description}
                                </span>
                              </span>
                              <Button
                                size="sm"
                                disabled={bought || state.wallet.event < item.cost}
                                onClick={() =>
                                  mutate((draft) => {
                                    const result = claimEventShopItem(draft, event.id, item.id);
                                    toast(result.message ?? "Could not buy that");
                                  })
                                }
                              >
                                {bought ? "Bought" : `${item.cost}`}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="The event calendar">
        <ul className="flex flex-col gap-1.5">
          {EVENTS.map((event) => (
            <li key={event.id} className="rounded-xl border border-line bg-white px-3.5 py-2.5">
              <p className="text-sm font-semibold text-berry">{event.name}</p>
              <p className="text-xs text-berry-soft">{scheduleText(event.schedule)}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function scheduleText(schedule: (typeof EVENTS)[number]["schedule"]): string {
  switch (schedule.kind) {
    case "dates": return `Every year from ${schedule.from} to ${schedule.to}`;
    case "weekdays":
      return `Every ${schedule.days
        .map((d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d])
        .join(" and ")}`;
    case "monthday": return `The ${schedule.day}st of every month`;
    case "anniversary": return "Around your anniversary";
    default: return "Always running";
  }
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
    ["Generators", state.stats.heartsFromPassive],
    ["Criticals", state.stats.heartsFromCrits],
    ["Abilities", state.stats.heartsFromSkills],
    ["Pets", state.stats.heartsFromPets],
    ["Offline", state.stats.heartsFromOffline],
    ["Golden hearts", state.stats.heartsFromGolden],
    ["Bosses", state.stats.heartsFromBosses],
    ["Together", state.stats.heartsFromPartner],
  ] as const;
  const breakdownTotal = Math.max(1, breakdown.reduce((sum, [, value]) => sum + value, 0));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Right now">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Hearts" value={formatNumber(state.wallet.hearts, format)} tone="accent" />
          <Stat label="Lifetime hearts" value={formatNumber(state.lifetime.hearts, format)} />
          <Stat label="Per tap" value={formatNumber(derived.heartsPerClick, format)} />
          <Stat label="Per second" value={formatNumber(derived.heartsPerSecond, format)} />
          <Stat label="This run" value={formatNumber(state.runHearts, format)} />
          <Stat label="This era" value={formatNumber(state.eraHearts, format)} />
        </div>
      </Section>

      <Section title="Where your hearts came from">
        <ul className="space-y-1.5">
          {breakdown.map(([label, value]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-berry-soft">{label}</span>
              <span className="flex-1">
                <Bar value={value} max={breakdownTotal} height="0.4rem" />
              </span>
              <span className="w-16 shrink-0 text-right text-[0.65rem] font-semibold text-berry">
                {formatNumber(value, format)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="The last two weeks">
        {history.length === 0 ? (
          <EmptyRow>Nothing recorded yet. Come back tomorrow.</EmptyRow>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {history.map((day) => (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className="w-full rounded-t bg-rose-dark"
                  style={{ height: `${Math.max(2, (day.hearts / maxDay) * 100)}%` }}
                  title={`${day.day}: ${formatNumber(day.hearts, format)} hearts, ${day.clicks} taps`}
                />
                <span className="text-[0.5rem] text-berry-soft">{day.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Everything else">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total taps" value={formatNumber(state.stats.totalClicks, format)} />
          <Stat label="Perfect taps" value={formatNumber(state.stats.perfectClicks, format)} />
          <Stat label="Criticals" value={formatNumber(state.stats.criticalClicks, format)} />
          <Stat label="Mega criticals" value={formatNumber(state.stats.megaCriticalClicks, format)} />
          <Stat label="Best combo" value={`${state.stats.bestCombo}`} />
          <Stat label="Combo finishers" value={`${state.stats.comboFinishers}`} />
          <Stat label="Upgrades bought" value={formatNumber(state.stats.upgradesBought, format)} />
          <Stat label="Abilities used" value={formatNumber(state.stats.skillsUsed, format)} />
          <Stat label="Eggs opened" value={`${state.stats.eggsOpened}`} />
          <Stat label="Pets evolved" value={`${state.stats.petsEvolved}`} />
          <Stat label="Pets fused" value={`${state.stats.petsFused}`} />
          <Stat label="Charms crafted" value={`${state.stats.charmsCrafted}`} />
          <Stat label="Bosses defeated" value={`${state.stats.bossesDefeated}`} />
          <Stat label="Challenges" value={`${state.stats.challengesCompleted}`} />
          <Stat label="Missions" value={`${state.stats.missionsCompleted}`} />
          <Stat label="Mini-games" value={`${state.stats.minigamesPlayed}`} />
          <Stat label="Rebirths" value={`${state.rebirths}`} />
          <Stat label="Ascensions" value={`${state.ascensions}`} />
          <Stat
            label="Fastest rebirth"
            value={state.stats.fastestRebirthMs ? formatDurationShort(state.stats.fastestRebirthMs) : "not yet"}
          />
          <Stat
            label="Longest session"
            value={formatDurationShort(state.stats.longestSessionMs)}
          />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export function LeaderboardTab() {
  const { state, mutate, now } = useGame();
  const { me, partner } = useWho();
  const { partner: partnerProfile } = useCouple();
  const format = state.settings.numberFormat;

  const board = useCachedQuery<LeaderRow[]>("game:leaderboard", () => loadLeaderboard(), []);
  const since = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const daily = useCachedQuery<DailyRow[]>("game:daily", () => loadDailyScores(since), [since]);

  const partnerName = partnerProfile?.display_name ?? displayName(partner);

  const weekTotals = useMemo(() => {
    const totals: Record<string, number> = { [me]: 0, [partner]: 0 };
    for (const row of daily.data ?? []) totals[row.person] = (totals[row.person] ?? 0) + Number(row.hearts);
    return totals;
  }, [daily.data, me, partner]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayTotals = useMemo(() => {
    const totals: Record<string, number> = { [me]: 0, [partner]: 0 };
    for (const row of daily.data ?? []) {
      if (row.day === todayKey) totals[row.person] = (totals[row.person] ?? 0) + Number(row.hearts);
    }
    return totals;
  }, [daily.data, me, partner, todayKey]);

  if (!state.settings.competitionOptIn) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyRow>
          Comparison is turned off. Nothing about your game is shown to your partner while it is.
        </EmptyRow>
        <Button
          onClick={() => mutate((draft) => void (draft.settings.competitionOptIn = true))}
        >
          Turn comparison back on
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title="Today" hint="Hearts earned since midnight in your shared timezone.">
        <Versus
          mine={todayTotals[me] ?? 0}
          theirs={todayTotals[partner] ?? 0}
          partnerName={partnerName}
          format={format}
        />
      </Section>

      <Section title="This week">
        <Versus
          mine={weekTotals[me] ?? 0}
          theirs={weekTotals[partner] ?? 0}
          partnerName={partnerName}
          format={format}
        />
      </Section>

      <Section title="All time" hint="Server side numbers. Anything implausible is rejected before it lands here.">
        {board.data && board.data.length > 0 ? (
          <ul className="space-y-2">
            {[...board.data]
              .sort((a, b) => Number(b.lifetime_hearts) - Number(a.lifetime_hearts))
              .map((row) => (
                <li key={row.person} className="rounded-card border border-line bg-white p-3.5 shadow-soft">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
                    <Trophy className="h-4 w-4 text-rose-dark" />
                    {row.person === me ? "You" : partnerName}
                    {state.activeTitle && row.person === me && (
                      <span className="rounded-full bg-blush px-2 py-0.5 text-[0.6rem] font-bold text-rose-dark">
                        {state.activeTitle}
                      </span>
                    )}
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <Stat label="Lifetime" value={formatNumber(Number(row.lifetime_hearts), format)} />
                    <Stat label="Best combo" value={`${row.best_combo}`} />
                    <Stat label="Rebirths" value={`${row.rebirths}`} />
                    <Stat label="Ascensions" value={`${row.ascensions}`} />
                    <Stat label="Pets" value={`${row.pets_collected}`} />
                    <Stat label="Bosses" value={`${row.bosses_defeated}`} />
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <EmptyRow>
            {board.stale ? "Showing your last saved copy." : "No scores yet. Play a little and come back."}
          </EmptyRow>
        )}
      </Section>

      <Section title="Personal bests">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Best combo" value={`${state.stats.bestCombo}`} />
          <Stat label="Best session" value={formatNumber(state.stats.bestSessionHearts, format)} />
          <Stat
            label="Fastest rebirth"
            value={state.stats.fastestRebirthMs ? formatDurationShort(state.stats.fastestRebirthMs) : "not yet"}
          />
          <Stat
            label="Fastest ascension"
            value={state.stats.fastestAscensionMs ? formatDurationShort(state.stats.fastestAscensionMs) : "not yet"}
          />
        </div>
      </Section>

      <Button
        variant="ghost"
        onClick={() => mutate((draft) => void (draft.settings.competitionOptIn = false))}
      >
        Turn comparison off
      </Button>
    </div>
  );
}

function Versus({
  mine,
  theirs,
  partnerName,
  format,
}: {
  mine: number;
  theirs: number;
  partnerName: string;
  format: GameSettings["numberFormat"];
}) {
  const total = Math.max(1, mine + theirs);
  return (
    <div className="rounded-card border border-line bg-white p-3.5 shadow-soft">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-rose-dark">You {formatNumber(mine, format)}</span>
        <span className="font-semibold text-lavender-deep">
          {partnerName} {formatNumber(theirs, format)}
        </span>
      </div>
      <span className="flex h-3 w-full overflow-hidden rounded-full bg-cream">
        <span style={{ width: `${(mine / total) * 100}%`, backgroundColor: "var(--color-rose-dark)" }} />
        <span style={{ width: `${(theirs / total) * 100}%`, backgroundColor: "var(--color-lavender-deep)" }} />
      </span>
      <p className="mt-1.5 text-xs text-berry-soft">
        {mine === theirs
          ? "Dead even."
          : mine > theirs
            ? "You are ahead. It is not a competition, but you are ahead."
            : `${partnerName} is ahead.`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Codex                                                               */
/* ------------------------------------------------------------------ */

type CodexSection = "currencies" | "upgrades" | "pets" | "skills" | "charms" | "hearts" | "bosses" | "challenges" | "worlds" | "layers";

export function CodexTab() {
  const { state } = useGame();
  const [section, setSection] = useState<CodexSection>("currencies");

  const sections: { id: CodexSection; label: string }[] = [
    { id: "currencies", label: "Currencies" },
    { id: "upgrades", label: "Upgrades" },
    { id: "pets", label: "Pets" },
    { id: "skills", label: "Abilities" },
    { id: "charms", label: "Charms" },
    { id: "hearts", label: "Heart types" },
    { id: "bosses", label: "Bosses" },
    { id: "challenges", label: "Challenges" },
    { id: "worlds", label: "Worlds" },
    { id: "layers", label: "Resets" },
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
        <p className="text-xs text-berry-soft">
          Entries you have not reached yet stay vague on purpose.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {section === "currencies" &&
          CURRENCIES.map((entry) => (
            <Entry
              key={entry.id}
              title={entry.name}
              body={`${entry.source} ${entry.purpose}`}
              tag={entry.rare ? "Rare" : undefined}
              color={entry.color}
            />
          ))}

        {section === "upgrades" &&
          UPGRADE_TREES.map((tree) => (
            <Entry
              key={tree.id}
              title={tree.name}
              body={`${tree.blurb} ${UPGRADES.filter((u) => u.tree === tree.id).length} upgrades in this tree.`}
            />
          ))}

        {section === "pets" &&
          PETS.map((pet) => {
            const known = state.petCodex.includes(pet.id);
            return (
              <Entry
                key={pet.id}
                title={known ? pet.name : "Not met yet"}
                body={known ? `${pet.ability} Best for: ${pet.playstyle}.` : `A ${RARITY_META[pet.rarity].label.toLowerCase()} pet somebody has seen.`}
                tag={RARITY_META[pet.rarity].label}
                color={known ? pet.color : "var(--color-line)"}
              />
            );
          })}

        {section === "skills" &&
          SKILLS.map((skill) => {
            const known = (state.skills[skill.id]?.level ?? 0) > 0;
            return (
              <Entry
                key={skill.id}
                title={skill.name}
                body={
                  known
                    ? `${skill.description} Cooldown ${formatDurationShort(skill.cooldownMs)}${skill.durationMs ? `, lasts ${formatDurationShort(skill.durationMs)}` : ""}.`
                    : skill.description
                }
              />
            );
          })}

        {section === "charms" && (
          <>
            {CHARM_SLOTS.map((slot) => (
              <Entry key={slot.id} title={slot.name} body={slot.description} />
            ))}
            {CHARM_SETS.map((set) => (
              <Entry
                key={set.id}
                title={set.name}
                body={`${set.description} ${set.tiers.map((t) => `${t.count} pieces: ${t.label}`).join(". ")}.`}
              />
            ))}
          </>
        )}

        {section === "hearts" && (
          <>
            <Entry title="Golden heart" body="Worth a large burst of hearts and a golden heart or two. Catch it before it drifts away." color="#d0a84a" />
            <Entry title="Treasure heart" body="Fragments, dust, treats and sometimes a love letter for the collection." color="#5aa8b0" />
            <Entry title="Mimic heart" body="Pays out based on your combo, then takes the combo. Worth it only when the combo is high." color="#8a6a4a" />
            <Entry title="Healing heart" body="Restores your combo and refills your energy. Appears when your combo has broken." color="#7fa06a" />
            <Entry title="Exploding heart" body="A burst of hearts and a short click power buff." color="#c05c5c" />
            <Entry title="Shielded heart" body="Takes four taps to open. Pays in fragments." color="#7f8fd0" />
          </>
        )}

        {section === "bosses" &&
          BOSSES.map((boss) => {
            const record = state.bosses[boss.id];
            return (
              <Entry
                key={boss.id}
                title={record ? boss.name : "An unopened fight"}
                body={record ? `${boss.blurb} ${boss.mechanicText} Defeated ${record.defeated} times.` : boss.blurb}
                color={record ? boss.color : "var(--color-line)"}
              />
            );
          })}

        {section === "challenges" &&
          CHALLENGES.map((challenge) => (
            <Entry
              key={challenge.id}
              title={challenge.name}
              body={challenge.description}
              tag={`${"·".repeat(challenge.difficulty)}`}
            />
          ))}

        {section === "worlds" &&
          WORLDS.map((world) => {
            const known = state.worldsUnlocked.includes(world.id);
            return (
              <Entry
                key={world.id}
                title={world.name}
                body={known ? `${world.blurb} ${world.rule}` : world.blurb}
                color={world.accent}
              />
            );
          })}

        {section === "layers" &&
          RESET_LAYERS.map((layer) => (
            <Entry
              key={layer.id}
              title={layer.name}
              body={`${layer.blurb} Resets: ${layer.resets.join("; ")}. Keeps: ${layer.keeps.join("; ")}.`}
            />
          ))}
      </ul>
    </div>
  );
}

function Entry({
  title,
  body,
  tag,
  color,
}: {
  title: string;
  body: string;
  tag?: string;
  color?: string;
}) {
  return (
    <li className="rounded-card border border-line bg-white p-3.5 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-berry">
        {color && (
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        )}
        <span className="truncate">{title}</span>
        {tag && (
          <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[0.6rem] font-bold text-berry-soft">
            {tag}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-berry-soft">{body}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

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
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft ${
            state.settings[key] ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <Section title="Feel">
        <div className="flex flex-col gap-2">
          {toggle("haptics", "Haptic feedback")}
          {toggle("sound", "Sound effects")}
          {toggle("screenShake", "Screen shake on mega criticals")}
          {toggle("showDamageNumbers", "Number popups")}
        </div>
      </Section>

      <Section title="Performance" hint="Turn these on if the game feels heavy on your phone.">
        <div className="flex flex-col gap-2">
          {toggle("reducedMotion", "Reduced motion")}
          {toggle("batterySaver", "Battery saver")}
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="mb-1.5 text-sm font-semibold text-berry">Particles</p>
            <SegmentedControl
              label="Particle level"
              value={state.settings.particles}
              onChange={(value) => mutate((draft) => void (draft.settings.particles = value))}
              options={[
                { value: "full", label: "Full" },
                { value: "reduced", label: "Reduced" },
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
            onChange={(value) => mutate((draft) => void (draft.settings.numberFormat = value))}
            options={[
              { value: "short", label: "1.2K" },
              { value: "scientific", label: "1.2e3" },
              { value: "engineering", label: "eng" },
              { value: "full", label: "Full" },
            ]}
          />
        </div>
      </Section>

      <Section title="Safety">
        <div className="flex flex-col gap-2">
          {toggle("confirmRareSpends", "Confirm before spending rare currencies")}
          {toggle("competitionOptIn", "Compare progress with your partner")}
        </div>
      </Section>

      <Button
        variant="secondary"
        onClick={() => {
          void flush();
          toast("Saved and queued for sync");
        }}
      >
        Save and sync now
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
    { id: "catch", name: "Catch falling hearts", blurb: "Twenty seconds. Tap every heart before it lands." },
    { id: "match", name: "Memory match", blurb: "Six pairs. Fewer turns pays better." },
    { id: "reaction", name: "Reaction check", blurb: "Tap the moment the heart fills. Five rounds." },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-berry-soft">
        Optional, short, and worth playing. Never required.
      </p>
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
        const hearts = Math.max(1, derived.heartsPerSecond * 30 * score + derived.heartsPerClick * 20 * score);
        earnHearts(draft, hearts, "event");
        addCurrency(draft, "golden", Math.max(1, Math.floor(score * 4)));
        addCurrency(draft, "treats", Math.max(1, Math.floor(score * 10)));
        draft.stats.minigamesPlayed += 1;
        recordMetric(draft, "minigames", 1);
      });
      toast(`${label}. Rewards added.`);
    },
    [derived.heartsPerClick, derived.heartsPerSecond, mutate, toast],
  );
}

function CatchGame({ onClose }: { onClose: () => void }) {
  const reward = useMiniReward();
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [caught, setCaught] = useState(0);
  const [missed, setMissed] = useState(0);
  const [left, setLeft] = useState(20);
  const nextId = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    const spawn = setInterval(() => {
      setHearts((prev) => [...prev.slice(-11), { id: ++nextId.current, x: 6 + Math.random() * 84, y: -8 }]);
    }, 620);
    const fall = setInterval(() => {
      setHearts((prev) => {
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
    const accuracy = caught / Math.max(1, caught + missed);
    reward(Math.max(0.2, accuracy) * (caught / 12), `Caught ${caught} hearts`);
  }, [left, caught, missed, reward]);

  return (
    <Sheet open onClose={onClose} title="Catch falling hearts" tall>
      <div className="flex h-full flex-col gap-2 pt-1">
        <div className="flex justify-between text-sm font-semibold text-berry">
          <span>Caught {caught}</span>
          <span>Missed {missed}</span>
          <span>{left}s</span>
        </div>
        <div className="relative flex-1 overflow-hidden rounded-card border border-line bg-cream">
          {hearts.map((heart) => (
            <button
              key={heart.id}
              aria-label="Catch"
              onClick={() => {
                setHearts((prev) => prev.filter((h) => h.id !== heart.id));
                setCaught((c) => c + 1);
              }}
              className="absolute flex h-11 w-11 items-center justify-center text-rose-dark"
              style={{ left: `${heart.x}%`, top: `${heart.y}%` }}
            >
              <HeartIcon className="h-7 w-7" />
            </button>
          ))}
          {left === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90">
              <p className="font-display text-2xl font-semibold text-plum">{caught} caught</p>
              <Button onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

const MATCH_SYMBOLS = ["A", "B", "C", "D", "E", "F"];

function MatchGame({ onClose }: { onClose: () => void }) {
  const reward = useMiniReward();
  const [cards] = useState(() => {
    const deck = [...MATCH_SYMBOLS, ...MATCH_SYMBOLS].map((symbol, index) => ({ id: index, symbol }));
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
    reward(Math.max(0.3, 12 / Math.max(6, turns)), `Matched in ${turns} turns`);
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
          <Button className="w-full" onClick={onClose}>
            Done in {turns} turns
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function ReactionGame({ onClose }: { onClose: () => void }) {
  const reward = useMiniReward();
  const [round, setRound] = useState(0);
  // `go` is the only thing a timer flips; everything else follows from `round`.
  const [go, setGo] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const goAt = useRef(0);
  const done = useRef(false);
  const phase: "wait" | "go" | "done" = round >= 5 ? "done" : go ? "go" : "wait";

  useEffect(() => {
    if (round >= 5) return;
    const delay = 900 + Math.random() * 2_000;
    const timer = setTimeout(() => {
      goAt.current = Date.now();
      setGo(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [round]);

  useEffect(() => {
    if (phase !== "done" || done.current) return;
    done.current = true;
    const average = times.reduce((sum, t) => sum + t, 0) / Math.max(1, times.length);
    reward(Math.max(0.2, Math.min(1.5, 500 / Math.max(120, average))), `Average ${Math.round(average)}ms`);
  }, [phase, times, reward]);

  return (
    <Sheet open onClose={onClose} title="Reaction check">
      <div className="space-y-3 pt-1">
        <p className="text-sm text-berry-soft">Round {Math.min(round + 1, 5)} of 5</p>
        <button
          disabled={phase === "done"}
          onClick={() => {
            if (phase === "go") {
              setTimes((prev) => [...prev, Date.now() - goAt.current]);
            } else if (phase === "wait") {
              // Too early: costs you the round.
              setTimes((prev) => [...prev, 900]);
            } else {
              return;
            }
            setGo(false);
            setRound((r) => r + 1);
          }}
          className={`flex h-48 w-full items-center justify-center rounded-card border text-lg font-bold ${
            phase === "go"
              ? "border-rose-dark bg-rose-dark text-white"
              : "border-line bg-white text-berry-soft"
          }`}
        >
          {phase === "go" ? "Now" : phase === "wait" ? "Wait for it" : "Finished"}
        </button>
        {times.length > 0 && (
          <p className="text-sm text-berry">
            {times.map((t) => `${t}ms`).join(" · ")}
          </p>
        )}
        {phase === "done" && (
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/** Small wallet strip shown above every tab. */
export function WalletStrip() {
  const { state } = useGame();
  const format = state.settings.numberFormat;
  const shown = CURRENCIES.filter(
    (currency) => state.wallet[currency.id] > 0 || currency.id === "hearts" || currency.id === "golden",
  );
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1">
      {shown.map((currency) => (
        <CurrencyPill
          key={currency.id}
          currency={currency.id}
          amount={state.wallet[currency.id]}
          format={format}
          compact
        />
      ))}
    </div>
  );
}
