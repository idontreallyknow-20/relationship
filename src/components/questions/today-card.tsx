"use client";

// Today's question. Handles every state the day can be in: not answered yet,
// answered and waiting, revealed early by one side, both answers in, and the
// days nobody got to. Answering works with no connection.

import { useEffect, useRef, useState } from "react";
import { CloudOff, Pencil, Shuffle } from "lucide-react";
import { useWho } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { useSyncStatus } from "@/lib/offline/provider";
import { noteRewardable } from "@/game/rewards-inbox";
import {
  categoryLabel, editAnswer, markSeen, setRevealedEarly, submitAnswer, swapQuestion,
  type DayView, type DQRow,
} from "@/lib/questions";
import { Button, Card, IconButton, Input, Label, Textarea, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { PendingDot } from "@/components/sync-status";
import { AnswerPair } from "./answer-pair";

interface Draft {
  answer: string;
  guess: string;
  choice: string;
}

export function TodayCard({
  view,
  day,
  myName,
  partnerName,
  favorite,
  onToggleFavorite,
  onChanged,
  onSwapped,
}: {
  view: DayView;
  day: string;
  myName: string;
  partnerName: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onChanged: () => void;
  onSwapped: (dq: DQRow) => void;
}) {
  const { me } = useWho();
  const toast = useToast();
  const { online } = useSyncStatus();
  const { dq, question, mine, theirs, phase } = view;
  const draftKey = `question-answer:${dq.id}`;

  // Restore the draft while the state is being created, so a half written
  // answer survives a closed tab without an extra render pass.
  const [stored] = useState<Draft>(
    () => loadDraft<Draft>(draftKey) ?? { answer: "", guess: "", choice: "" },
  );
  const [answerText, setAnswerText] = useState(stored.answer ?? "");
  const [guessText, setGuessText] = useState(stored.guess ?? "");
  const [choice, setChoice] = useState(stored.choice ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const seenSent = useRef(false);

  useEffect(() => {
    if (!editing) saveDraft(draftKey, { answer: answerText, guess: guessText, choice });
  }, [draftKey, answerText, guessText, choice, editing]);

  // Reading their answer is what freezes it. Only fire once it is genuinely
  // on screen, and only once per mount.
  useEffect(() => {
    if (!theirs || seenSent.current) return;
    const visible = phase === "both" || (phase === "revealed" && theirs.revealed_early);
    if (!visible) return;
    seenSent.current = true;
    void markSeen(dq.id);
  }, [theirs, phase, dq.id]);

  if (!question) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold text-plum">Today&apos;s question</h2>
        <p className="text-sm text-berry-soft">
          The question for today is on its way. It will appear here as soon as it lands.
        </p>
      </Card>
    );
  }

  const answerValue = question.kind === "this_or_that" ? choice : answerText.trim();

  const startEdit = () => {
    if (!mine) return;
    setEditing(true);
    if (question.kind === "this_or_that") setChoice(mine.answer);
    else setAnswerText(mine.answer);
    setGuessText(mine.guess ?? "");
  };

  const submit = async () => {
    if (!answerValue || busy) return;
    setBusy(true);
    try {
      if (editing && mine) {
        await editAnswer(me, mine.id, answerValue, question.kind === "guess_mine" ? guessText.trim() || null : null);
        setEditing(false);
        toast(online ? "Answer updated" : "Saved here, will send when you are back");
      } else {
        await submitAnswer(me, dq, answerValue, question.kind === "guess_mine" ? guessText.trim() || null : null);
        clearDraft(draftKey);
        toast(online ? "Answer saved" : "Saved here, will send when you are back");
        void notifyPartner("answers", `${dq.id}:${me}`, { url: "/questions" });
        // A small Love Jar bonus, capped once a day.
        void noteRewardable("question_answered", day, `question:${dq.id}:${me}`);
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggleReveal = async () => {
    if (!mine || busy) return;
    setBusy(true);
    try {
      const next = !mine.revealed_early;
      await setRevealedEarly(me, mine.id, next);
      toast(next ? `${partnerName} can read yours now` : "Hidden again");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const swap = async () => {
    if (busy) return;
    if (!online) {
      toast("Swapping the question needs a connection");
      return;
    }
    setBusy(true);
    try {
      const next = await swapQuestion(dq.id);
      if (next) {
        onSwapped(next);
        toast("Swapped for a different question");
      }
    } catch (err) {
      toast((err as Error).message?.includes("already answered")
        ? "Someone has already answered today"
        : "Could not swap the question");
    } finally {
      setBusy(false);
    }
  };

  const canSwap = !mine && !theirs;
  const composing = !mine || editing;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-plum">
              {categoryLabel(question.category)}
            </span>
            {dq.skipped && (
              <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-berry-soft">
                Swapped
              </span>
            )}
            {view.pending && (
              <span className="flex items-center gap-1 rounded-full bg-blush/70 px-2.5 py-0.5 text-xs font-semibold text-rose-dark">
                <PendingDot /> Waiting to send
              </span>
            )}
          </div>
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

      {phase === "both" && !editing && mine && (
        <>
          <AnswerPair
            question={question}
            myAnswer={mine}
            partnerAnswer={theirs}
            myName={myName}
            partnerName={partnerName}
          />
          <p className="text-xs text-berry-soft">
            Both answers are in. Yours is fixed now that {partnerName} has read it.
          </p>
        </>
      )}

      {phase === "waiting" && !editing && mine && (
        <div className="flex flex-col gap-3 rounded-xl border border-line-soft bg-cream/60 p-4">
          <p className="flex items-center gap-2 text-sm text-berry-soft">
            <HeartIcon className="heart-pulse h-4 w-4 text-rose" />
            Waiting for {partnerName} to answer.
          </p>
          <p className="text-sm text-berry">
            <span className="font-semibold">You said:</span> {mine.answer}
          </p>
          {question.kind === "guess_mine" && mine.guess && (
            <p className="text-sm text-berry-soft">
              <span className="font-semibold">Your guess:</span> {mine.guess}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {view.editable ? (
              <Button variant="secondary" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4" />
                Change my answer
              </Button>
            ) : (
              <p className="text-xs text-berry-soft">
                {partnerName} has read this, so it stays as it is now.
              </p>
            )}
          </div>

          <button
            role="switch"
            aria-checked={mine.revealed_early}
            onClick={() => void toggleReveal()}
            disabled={busy}
            className="pressable flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5 disabled:opacity-60"
          >
            <span className="text-sm font-semibold text-berry">Let them read mine early</span>
            <span
              aria-hidden="true"
              className={`relative h-7 w-12 shrink-0 rounded-full ${
                mine.revealed_early ? "bg-rose-deep" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft ${
                  mine.revealed_early ? "left-6" : "left-1"
                }`}
              />
            </span>
          </button>
        </div>
      )}

      {composing && (
        <div className="flex flex-col gap-3">
          {phase === "revealed" && theirs && (
            <p className="rounded-xl bg-blush/50 px-3.5 py-2.5 text-sm text-berry">
              <span className="font-semibold">{partnerName} revealed early:</span> {theirs.answer}
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

          {!online && (
            <p className="flex items-center gap-2 text-xs text-berry-soft">
              <CloudOff className="h-3.5 w-3.5" />
              You are offline. This saves on your phone and sends itself later.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={() => void submit()} disabled={!answerValue} loading={busy}>
              {editing ? "Save changes" : "Send answer"}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
            {!editing && canSwap && (
              <Button variant="ghost" onClick={() => void swap()} loading={busy}>
                <Shuffle className="h-4 w-4" />
                Swap
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
