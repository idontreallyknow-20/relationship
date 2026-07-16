"use client";

// Side by side answers once both are visible. Handles all three question
// kinds, including the playful guess comparison for guess_mine.

import { HeartIcon } from "@/components/hearts";
import type { Answer, Question } from "@/lib/types";

function guessMatches(guess: string | null, actual: string | undefined): boolean {
  if (!guess || !actual) return false;
  return guess.trim().toLowerCase() === actual.trim().toLowerCase();
}

function AnswerSide({
  name,
  answer,
  question,
  otherAnswer,
  waitingText,
}: {
  name: string;
  answer: Answer | null;
  question: Question;
  otherAnswer: Answer | null;
  waitingText: string;
}) {
  const matched =
    question.kind === "guess_mine" && guessMatches(answer?.guess ?? null, otherAnswer?.answer);

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line-soft bg-cream/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-berry-soft">
        <HeartIcon className="h-3 w-3 text-rose" />
        {name}
      </p>
      {answer ? (
        <>
          <p className="text-sm font-semibold text-berry">{answer.answer}</p>
          {question.kind === "guess_mine" && answer.guess && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-berry-soft">
              Guessed: {answer.guess}
              {otherAnswer &&
                (matched ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-rose-deep">
                    <HeartIcon className="h-3 w-3" /> Matched
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5">
                    <HeartIcon className="h-3 w-3 text-blush-deep" filled={false} /> Close?
                  </span>
                ))}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-berry-soft">{waitingText}</p>
      )}
    </div>
  );
}

export function AnswerPair({
  question,
  myAnswer,
  partnerAnswer,
  myName,
  partnerName,
}: {
  question: Question;
  myAnswer: Answer | null;
  partnerAnswer: Answer | null;
  myName: string;
  partnerName: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <AnswerSide
        name={myName}
        answer={myAnswer}
        question={question}
        otherAnswer={partnerAnswer}
        waitingText="No answer"
      />
      <AnswerSide
        name={partnerName}
        answer={partnerAnswer}
        question={question}
        otherAnswer={myAnswer}
        waitingText={myAnswer ? `Waiting for ${partnerName}` : "Hidden until you answer"}
      />
    </div>
  );
}
