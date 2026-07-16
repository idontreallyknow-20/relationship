"use client";

// Daily couple questions: today's prompt, a history of past ones, and a
// pool of questions we write for each other.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useCouple, useWho } from "@/lib/couple-context";
import { EmptyState, TopBar, useToast } from "@/components/ui";
import { HeartDivider, HeartSpinner } from "@/components/hearts";
import type { Answer, DailyQuestion, Question } from "@/lib/types";
import { displayName } from "@/lib/types";
import { TodayCard } from "@/components/questions/today-card";
import { QuestionHistory, type HistoryItem } from "@/components/questions/history";
import { CustomQuestions } from "@/components/questions/custom-questions";

type DQRow = DailyQuestion & { question: Question | null };

export default function Page() {
  const { me: meProfile, partner: partnerProfile } = useCouple();
  const { me, partner } = useWho();
  const toast = useToast();

  const today = format(new Date(), "yyyy-MM-dd");

  const [todayDq, setTodayDq] = useState<DQRow | null>(null);
  const [historyDqs, setHistoryDqs] = useState<DQRow[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = supabase();
    const [todayRes, histRes, favRes, questionsRes] = await Promise.all([
      sb
        .from("daily_questions")
        .select("*, question:questions(*)")
        .eq("for_date", today)
        .maybeSingle(),
      sb
        .from("daily_questions")
        .select("*, question:questions(*)")
        .lt("for_date", today)
        .order("for_date", { ascending: false })
        .limit(30),
      sb.from("question_favorites").select("question_id, person"),
      sb.from("questions").select("*").order("created_at", { ascending: false }),
    ]);

    const dq = (todayRes.data as DQRow | null) ?? null;
    const hist = (histRes.data ?? []) as DQRow[];
    setTodayDq(dq);
    setHistoryDqs(hist);
    setAllQuestions((questionsRes.data ?? []) as Question[]);
    setFavorites(
      new Set(
        ((favRes.data ?? []) as { question_id: string; person: string }[])
          .filter((f) => f.person === me)
          .map((f) => f.question_id),
      ),
    );

    const ids = [...hist.map((h) => h.id), ...(dq ? [dq.id] : [])];
    if (ids.length > 0) {
      const answersRes = await sb.from("answers").select("*").in("daily_question_id", ids);
      setAnswers((answersRes.data ?? []) as Answer[]);
    } else {
      setAnswers([]);
    }
    setLoading(false);
  }, [today, me]);

  useEffect(() => {
    void load();
    const sb = supabase();
    const channel = sb
      .channel("questions-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_questions" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [load]);

  const answerFor = useCallback(
    (dqId: string, person: string) =>
      answers.find((a) => a.daily_question_id === dqId && a.person === person) ?? null,
    [answers],
  );

  const toggleFavorite = async (questionId: string) => {
    const sb = supabase();
    const isFav = favorites.has(questionId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    const { error } = isFav
      ? await sb
          .from("question_favorites")
          .delete()
          .eq("question_id", questionId)
          .eq("person", me)
      : await sb
          .from("question_favorites")
          .upsert({ question_id: questionId, person: me });
    if (error) {
      // Roll back on failure.
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
      toast("Could not update favorites");
    }
  };

  const historyItems: HistoryItem[] = useMemo(
    () =>
      historyDqs
        .filter((dq) => dq.question !== null)
        .map((dq) => ({
          dq,
          question: dq.question as Question,
          myAnswer: answerFor(dq.id, me),
          partnerAnswer: answerFor(dq.id, partner),
        })),
    [historyDqs, answerFor, me, partner],
  );

  const categories = useMemo(
    () => [...new Set(allQuestions.map((q) => q.category))].sort(),
    [allQuestions],
  );
  const myQuestions = useMemo(
    () => allQuestions.filter((q) => q.created_by === me),
    [allQuestions, me],
  );

  const myName = meProfile.display_name;
  const partnerName = partnerProfile?.display_name ?? displayName(partner);

  return (
    <>
      <TopBar title="Questions" />
      <main className="flex flex-col gap-5 px-4 py-4">
        {loading ? (
          <HeartSpinner />
        ) : (
          <>
            {todayDq?.question ? (
              <TodayCard
                dq={todayDq}
                question={todayDq.question}
                myAnswer={answerFor(todayDq.id, me)}
                partnerAnswer={answerFor(todayDq.id, partner)}
                myName={myName}
                partnerName={partnerName}
                favorite={favorites.has(todayDq.question.id)}
                onToggleFavorite={() => void toggleFavorite(todayDq.question!.id)}
                onChanged={load}
              />
            ) : (
              <EmptyState
                title="Today's question arrives soon"
                hint="A new question lands here every day. Check back in a little while."
              />
            )}

            <HeartDivider />

            <QuestionHistory
              items={historyItems}
              favorites={favorites}
              onToggleFavorite={(id) => void toggleFavorite(id)}
              myName={myName}
              partnerName={partnerName}
            />

            <HeartDivider />

            <CustomQuestions categories={categories} mine={myQuestions} onChanged={load} />
          </>
        )}
      </main>
    </>
  );
}
