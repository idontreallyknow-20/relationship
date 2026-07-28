"use client";

// Daily couple questions.
//
// The page paints from the cached bundle first and reconciles with the server
// afterwards, so it opens instantly and keeps working with no connection. The
// day boundary comes from the couple's timezone, not the device's, which is
// what makes both partners see the same question at the same time.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCouple, useWho } from "@/lib/couple-context";
import { msUntilNextDay, todayIn } from "@/lib/day";
import { useCachedQuery } from "@/lib/offline/cache";
import { useSyncStatus } from "@/lib/offline/provider";
import {
  buildDayView, bundleKey, dayForDevice, loadBundle, pendingAnswerIds,
  recordMilestone, toggleFavorite as toggleFavoriteOp,
  type DayView, type DQRow, type QuestionsBundle,
} from "@/lib/questions";
import { displayName } from "@/lib/types";
import { Card, EmptyState, TopBar, useToast } from "@/components/ui";
import { HeartDivider, HeartSpinner } from "@/components/hearts";
import { SyncBadge } from "@/components/sync-status";
import { TodayCard } from "@/components/questions/today-card";
import { QuestionHistory } from "@/components/questions/history";
import { CustomQuestions } from "@/components/questions/custom-questions";
import { StreakCard } from "@/components/questions/streak";

export default function Page() {
  const { me: meProfile, partner: partnerProfile, couple } = useCouple();
  const { me, partner } = useWho();
  const toast = useToast();
  const { online } = useSyncStatus();

  const [today, setToday] = useState(() => todayIn(couple.timezone));
  const [swapped, setSwapped] = useState<DQRow | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const query = useCachedQuery<QuestionsBundle>(
    bundleKey(me),
    () => loadBundle(me, couple.timezone),
    [today, couple.timezone],
  );
  const { data, status, stale, error, refresh, set } = query;

  // Re-render at the exact moment the couple's day rolls over, so a phone
  // left open overnight picks up tomorrow's question without a refresh.
  useEffect(() => {
    const timer = setTimeout(() => {
      setToday(todayIn(couple.timezone));
    }, msUntilNextDay(couple.timezone));
    return () => clearTimeout(timer);
  }, [couple.timezone, today]);

  // Keep the pending-answer markers current as the outbox drains.
  useEffect(() => {
    const update = () => setPendingIds(pendingAnswerIds());
    update();
    const interval = setInterval(update, 1_500);
    return () => clearInterval(interval);
  }, []);

  // Live updates from the partner's device.
  useEffect(() => {
    const sb = supabase();
    const channel = sb
      .channel("questions-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "answers" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_questions" }, () => void refresh())
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [refresh]);

  const favorites = useMemo(() => new Set(data?.favorites ?? []), [data?.favorites]);

  const todayRow = swapped ?? data?.today ?? null;

  const todayView: DayView | null = useMemo(() => {
    if (!todayRow || !data) return null;
    return buildDayView(todayRow, data.answers, me, partner, today, pendingIds);
  }, [todayRow, data, me, partner, today, pendingIds]);

  const historyViews: DayView[] = useMemo(() => {
    if (!data) return [];
    return data.history.map((dq) => buildDayView(dq, data.answers, me, partner, today, pendingIds));
  }, [data, me, partner, today, pendingIds]);

  const weekViews: DayView[] = useMemo(() => {
    const rows = [...(todayView ? [todayView] : []), ...historyViews].slice(0, 7);
    return rows.reverse();
  }, [todayView, historyViews]);

  // Record a shared milestone the first time a streak length is reached.
  useEffect(() => {
    if (!data) return;
    void recordMilestone(data.stats.current_streak, today, data.milestones).then((milestone) => {
      if (milestone) toast(`Milestone: ${milestone.label}`);
    });
  }, [data, today, toast]);

  const handleToggleFavorite = useCallback(
    async (questionId: string) => {
      const isFavorite = favorites.has(questionId);
      set((current) =>
        current
          ? {
              ...current,
              favorites: isFavorite
                ? current.favorites.filter((id) => id !== questionId)
                : [...current.favorites, questionId],
            }
          : current!,
      );
      await toggleFavoriteOp(me, questionId, !isFavorite);
    },
    [favorites, me, set],
  );

  const myName = meProfile.display_name;
  const partnerName = partnerProfile?.display_name ?? displayName(partner);
  const { coupleDay, deviceDay } = dayForDevice(couple.timezone);
  const travelling = coupleDay !== deviceDay;

  const myQuestions = useMemo(
    () => (data?.questions ?? []).filter((q) => q.created_by === me),
    [data?.questions, me],
  );
  const categories = useMemo(
    () => Array.from(new Set((data?.questions ?? []).map((q) => q.category))).sort(),
    [data?.questions],
  );

  return (
    <>
      <TopBar title="Questions" action={<SyncBadge />} />
      <main className="flex flex-col gap-5 px-4 py-4">
        {status === "loading" && !data ? (
          <HeartSpinner />
        ) : !data ? (
          <EmptyState
            title={online ? "Could not load your questions" : "Nothing saved on this device yet"}
            hint={
              online
                ? error ?? "Try again in a moment."
                : "Open this page once with a connection and it will work offline afterwards."
            }
          />
        ) : (
          <>
            {stale && (
              <p className="text-center text-xs text-berry-soft">
                Showing your last saved copy. It will update when you are back online.
              </p>
            )}

            {travelling && (
              <Card className="flex items-start gap-2 py-3 text-sm text-berry-soft">
                <Globe className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Your phone says {deviceDay}, but your shared day is {coupleDay} in{" "}
                  {couple.timezone.replace(/_/g, " ")}. The question changes on the shared
                  day so you both always get the same one.
                </span>
              </Card>
            )}

            <StreakCard
              stats={data.stats}
              days={weekViews}
              milestones={data.milestones}
              timezone={couple.timezone}
              partnerName={partnerName}
            />

            {todayView ? (
              <TodayCard
                view={todayView}
                day={today}
                myName={myName}
                partnerName={partnerName}
                favorite={todayView.question ? favorites.has(todayView.question.id) : false}
                onToggleFavorite={() =>
                  todayView.question && void handleToggleFavorite(todayView.question.id)
                }
                onChanged={() => void refresh()}
                onSwapped={(dq) => {
                  setSwapped(dq);
                  void refresh();
                }}
              />
            ) : (
              <EmptyState
                title="Today's question is on its way"
                hint={
                  online
                    ? "It is being picked now. Pull this page again in a moment."
                    : "It will appear the next time you have a connection."
                }
              />
            )}

            <HeartDivider />

            <QuestionHistory
              items={historyViews}
              favorites={favorites}
              onToggleFavorite={(id) => void handleToggleFavorite(id)}
              myName={myName}
              partnerName={partnerName}
              timezone={couple.timezone}
            />

            <HeartDivider />

            <CustomQuestions
              categories={categories}
              mine={myQuestions}
              packs={data.packs}
              onChanged={() => void refresh()}
            />
          </>
        )}
      </main>
    </>
  );
}
