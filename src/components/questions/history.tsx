"use client";

// Past daily questions, newest first, with a favorites filter.

import { useState } from "react";
import { Card, EmptyState, IconButton, SegmentedControl } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatDay } from "@/lib/format";
import type { Answer, DailyQuestion, Question } from "@/lib/types";
import { AnswerPair } from "./answer-pair";

export interface HistoryItem {
  dq: DailyQuestion;
  question: Question;
  myAnswer: Answer | null;
  partnerAnswer: Answer | null;
}

type Tab = "all" | "favorites";

export function QuestionHistory({
  items,
  favorites,
  onToggleFavorite,
  myName,
  partnerName,
}: {
  items: HistoryItem[];
  favorites: Set<string>;
  onToggleFavorite: (questionId: string) => void;
  myName: string;
  partnerName: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const shown = tab === "favorites" ? items.filter((i) => favorites.has(i.question.id)) : items;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 font-display text-xl font-semibold text-plum">Past questions</h2>
        <div className="w-44 shrink-0">
          <SegmentedControl<Tab>
            label="Filter past questions"
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All" },
              { value: "favorites", label: "Favorites" },
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={tab === "favorites" ? "No favorites yet" : "No past questions yet"}
          hint={
            tab === "favorites"
              ? "Tap the heart on a question you both loved."
              : "Answered questions collect here day by day."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map(({ dq, question, myAnswer, partnerAnswer }) => {
            const favorite = favorites.has(question.id);
            return (
              <Card key={dq.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-berry-soft">
                      {formatDay(dq.for_date + "T00:00:00")}
                      <span className="ml-2 normal-case tracking-normal text-plum">
                        {question.category}
                      </span>
                    </p>
                    <p className="mt-0.5 font-display text-lg font-semibold leading-snug text-plum">
                      {question.prompt}
                    </p>
                  </div>
                  <IconButton
                    label={favorite ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => onToggleFavorite(question.id)}
                    className={favorite ? "text-rose-deep" : ""}
                  >
                    <HeartIcon className="h-5 w-5" filled={favorite} />
                  </IconButton>
                </div>
                <AnswerPair
                  question={question}
                  myAnswer={myAnswer}
                  partnerAnswer={partnerAnswer}
                  myName={myName}
                  partnerName={partnerName}
                />
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
