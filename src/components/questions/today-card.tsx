"use client";

// Today's question: answer composer per kind, waiting state with an early
// reveal toggle, side by side answers once both are visible, and a skip.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWho } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { Button, Card, IconButton, Input, Label, Textarea, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import type { Answer, DailyQuestion, Question } from "@/lib/types";
import { AnswerPair } from "./answer-pair";

interface AnswerDraft {
  answer: string;
  guess: string;
  choice: string;
}

export function TodayCard({
  dq,
  question,
  myAnswer,
  partnerAnswer,
  myName,
  partnerName,
  favorite,
  onToggleFavorite,
  onChanged,
}: {
  dq: DailyQuestion;
  question: Question;
  myAnswer: Answer | null;
  partnerAnswer: Answer | null;
  myName: string;
  partnerName: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { me } = useWho();
  const toast = useToast();
  // Keyed on the question too: after a skip swaps the prompt, a draft
  // written for the old prompt must not reappear under the new one.
  const draftKey = `question-answer:${dq.id}:${dq.question_id}`;

  const [answerText, setAnswerText] = useState("");
  const [guessText, setGuessText] = useState("");
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = loadDraft<AnswerDraft>(draftKey);
    if (stored) {
      setAnswerText(stored.answer ?? "");
      setGuessText(stored.guess ?? "");
      setChoice(stored.choice ?? "");
    }
    hydrated.current = true;
  }, [draftKey]);

  useEffect(() => {
    if (hydrated.current) saveDraft(draftKey, { answer: answerText, guess: guessText, choice });
  }, [draftKey, answerText, guessText, choice]);

  const answerValue = question.kind === "this_or_that" ? choice : answerText.trim();

  const submit = async () => {
    if (!answerValue || saving) return;
    setSaving(true);
    const { error } = await supabase()
      .from("answers")
      .insert({
        daily_question_id: dq.id,
        person: me,
        answer: answerValue,
        guess: question.kind === "guess_mine" && guessText.trim() ? guessText.trim() : null,
      });
    setSaving(false);
    if (error) {
      toast("Could not save your answer");
      return;
    }
    clearDraft(draftKey);
    toast("Answer saved");
    void notifyPartner("answers", `${dq.id}:${me}`, { url: "/questions" });
    await onChanged();
  };

  const toggleReveal = async () => {
    if (!myAnswer || revealing) return;
    setRevealing(true);
    const next = !myAnswer.revealed_early;
    const { error } = await supabase()
      .from("answers")
      .update({ revealed_early: next })
      .eq("id", myAnswer.id);
    setRevealing(false);
    if (error) {
      toast("Could not update that");
      return;
    }
    toast(next ? `${partnerName} can see your answer now` : "Your answer is hidden again");
    await onChanged();
  };

  // Swap today's question for a random one that has never been used.
  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    const sb = supabase();
    const [usedRes, allRes] = await Promise.all([
      sb.from("daily_questions").select("question_id, replaced_question_id"),
      sb.from("questions").select("id"),
    ]);
    const used = new Set<string>();
    for (const r of (usedRes.data ?? []) as {
      question_id: string;
      replaced_question_id: string | null;
    }[]) {
      used.add(r.question_id);
      if (r.replaced_question_id) used.add(r.replaced_question_id);
    }
    const pool = ((allRes.data ?? []) as { id: string }[]).filter((q) => !used.has(q.id));
    if (pool.length === 0) {
      setSkipping(false);
      toast("No fresh questions left to swap in");
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    // Remember the question being swapped out so it is not served again.
    const { error } = await sb
      .from("daily_questions")
      .update({ skipped: true, question_id: pick.id, replaced_question_id: dq.question_id })
      .eq("id", dq.id);
    setSkipping(false);
    if (error) {
      toast("Could not swap the question");
      return;
    }
    toast("Question swapped");
    await onChanged();
  };

  const bothVisible = Boolean(myAnswer && partnerAnswer);
  const canSkip = !myAnswer && !partnerAnswer;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-1 inline-block rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-plum">
            {question.category}
          </p>
          <h2 className="font-display text-2xl font-semibold leading-snug text-plum">
            {question.prompt}
          </h2>
        </div>
        <IconButton
          label={favorite ? "Remove from favorites" : "Add to favorites"}
          onClick={onToggleFavorite}
          className={favorite ? "text-rose-deep" : ""}
        >
          <HeartIcon className="h-5 w-5" filled={favorite} />
        </IconButton>
      </div>

      {myAnswer ? (
        bothVisible ? (
          <AnswerPair
            question={question}
            myAnswer={myAnswer}
            partnerAnswer={partnerAnswer}
            myName={myName}
            partnerName={partnerName}
          />
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-line-soft bg-cream/60 p-4">
            <p className="flex items-center gap-2 text-sm text-berry-soft">
              <HeartIcon className="heart-pulse h-4 w-4 text-rose" />
              Waiting for {partnerName} to answer.
            </p>
            <p className="text-sm text-berry">
              <span className="font-semibold">You said:</span> {myAnswer.answer}
            </p>
            <button
              role="switch"
              aria-checked={myAnswer.revealed_early}
              onClick={() => void toggleReveal()}
              disabled={revealing}
              className="pressable flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5 disabled:opacity-60"
            >
              <span className="text-sm font-semibold text-berry">Reveal mine early</span>
              <span
                aria-hidden="true"
                className={`relative h-7 w-12 shrink-0 rounded-full ${
                  myAnswer.revealed_early ? "bg-rose-deep" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft ${
                    myAnswer.revealed_early ? "left-6" : "left-1"
                  }`}
                />
              </span>
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {partnerAnswer && (
            <p className="rounded-xl bg-blush/50 px-3.5 py-2.5 text-sm text-berry">
              <span className="font-semibold">{partnerName} revealed early:</span>{" "}
              {partnerAnswer.answer}
            </p>
          )}

          {question.kind === "this_or_that" ? (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pick one">
              {[question.option_a, question.option_b].map(
                (option) =>
                  option && (
                    <button
                      key={option}
                      role="radio"
                      aria-checked={choice === option}
                      onClick={() => setChoice(option)}
                      className={`pressable min-h-16 rounded-xl border px-3 py-4 text-center font-semibold ${
                        choice === option
                          ? "border-rose-deep bg-blush text-berry"
                          : "border-line bg-white text-berry-soft"
                      }`}
                    >
                      {option}
                    </button>
                  ),
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="today-answer">Your answer</Label>
              <Textarea
                id="today-answer"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Take your time"
                maxLength={1000}
              />
            </div>
          )}

          {question.kind === "guess_mine" && (
            <div>
              <Label htmlFor="today-guess">Your guess of {partnerName}&apos;s answer</Label>
              <Input
                id="today-guess"
                value={guessText}
                onChange={(e) => setGuessText(e.target.value)}
                placeholder="What will they say?"
                maxLength={300}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              onClick={() => void submit()}
              disabled={!answerValue}
              loading={saving}
            >
              Send answer
            </Button>
            {canSkip && (
              <Button variant="ghost" onClick={() => void skip()} loading={skipping}>
                Skip
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
