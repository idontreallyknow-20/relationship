"use client";

// Telling the player what just happened.
//
// Every stage reveals something, and something appearing with no explanation
// is exactly how the game became unreadable in the first place. So when a
// stage opens, this says what the new thing is in two sentences and gets out
// of the way. It fires once, tracked by `stageSeen` in the save, and stays
// re-readable afterwards from the question mark beside any section heading.

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useGame } from "@/game/store";
import { STAGES, STAGE_BY_INDEX } from "@/game/config/stages";
import { Button, Sheet } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";

/**
 * The sheet that appears when the game gets bigger.
 *
 * It catches up rather than queueing: if a long offline stretch crossed three
 * stages at once, the newest one is shown and the rest are readable from the
 * help sheet. Three modals in a row would be worse than none.
 */
export function StageAnnounce() {
  const { state, derived, mutate } = useGame();

  const pending = derived.stage > state.stageSeen ? STAGE_BY_INDEX[derived.stage] : null;
  if (!pending) return null;

  // Marking it seen is what closes it: there is no separate dismissed flag to
  // keep in step with the save, and closing the app before reading it means
  // the explanation is still waiting next time.
  const close = () => {
    mutate((draft) => {
      draft.stageSeen = pending.index;
    });
  };

  return (
    <div className="fixed inset-0 z-[62] flex items-end justify-center p-4 sm:items-center">
      <div className="fade-in absolute inset-0 bg-berry/45" />
      <div className="reveal relative w-full max-w-sm rounded-card border border-line bg-white p-5 shadow-lift">
        <div className="flex items-center gap-2">
          <HeartIcon className="h-6 w-6 text-rose-dark" />
          <p className="text-[0.6rem] font-bold uppercase tracking-wide text-berry-soft">
            Something new
          </p>
        </div>
        <h2 className="mt-1 font-display text-2xl font-semibold text-plum">{pending.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-berry-soft">{pending.body}</p>
        <Button className="mt-4 w-full" onClick={close}>
          Got it
        </Button>
      </div>
    </div>
  );
}

/**
 * The question mark next to a heading.
 *
 * Same words as the announcement, available forever. Nothing in this game
 * should be explained exactly once and then never again.
 */
export function Explain({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`What is ${title}?`}
        className="pressable shrink-0 text-berry-soft"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-3 pt-1 text-sm leading-relaxed text-berry">{children}</div>
      </Sheet>
    </>
  );
}

/** Everything explained so far, for the settings screen. */
export function ExplainAll() {
  const { derived } = useGame();
  const known = STAGES.filter((s) => s.index <= derived.stage);
  return (
    <ul className="flex flex-col gap-2">
      {known.map((stage) => (
        <li key={stage.index} className="rounded-card border border-line bg-white p-3.5">
          <p className="text-sm font-semibold text-berry">{stage.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-berry-soft">{stage.body}</p>
        </li>
      ))}
    </ul>
  );
}
