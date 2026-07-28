"use client";

// First run pointer tour. Six steps, an arrow at each one, skippable at any
// point. It reads element positions from the DOM rather than hard-coding
// coordinates, so it survives layout changes and small screens.

import { useCallback, useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { Button } from "@/components/ui";

interface Step {
  /** data-tour value of the element to point at, or null for a centred card. */
  anchor: string | null;
  /** Tab to switch to before this step is measured. */
  tab: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    anchor: null,
    tab: "jar",
    title: "Your jar",
    body: "One jar, two people. Everything either of you does fills the same water.",
  },
  {
    anchor: "tap",
    tab: "jar",
    title: "Tap",
    body: "Tap for hearts. Hold until the ring turns gold to drop a shell to the floor.",
  },
  {
    anchor: "vessel",
    tab: "jar",
    title: "Otters and crabs",
    body: "Otters crack things open at the surface. Crabs carry the pieces up from the floor.",
  },
  {
    anchor: "wallet",
    tab: "jar",
    title: "What you keep",
    body: "Hearts spend on upgrades. Shells and sea glass come from the floor.",
  },
  {
    anchor: "tabs",
    tab: "upgrades",
    title: "Three trees",
    body: "Cami's tree, Joseph's tree, and the shared one. Your own tree costs less and gives more.",
  },
  {
    anchor: "tabs",
    tab: "us",
    title: "Together",
    body: "Gifts, shared totals, and a bonus when you both play the same evening.",
  },
];

interface Rect { top: number; left: number; width: number; height: number }

export function Tour({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { state, mutate } = useGame();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const active = !state.settings.tutorialDone;
  const step = STEPS[index];

  const finish = useCallback(() => {
    mutate((draft) => {
      draft.settings.tutorialDone = true;
    });
  }, [mutate]);

  // Switch to the tab this step lives on before measuring it.
  useEffect(() => {
    if (!active || !step) return;
    onOpenTab(step.tab);
  }, [active, step, onOpenTab]);

  // Measure the anchor once the tab switch above has painted, then follow it
  // through scrolls and resizes. Measuring inside rAF rather than in the effect
  // body means the target has actually been laid out by the time we read it.
  useEffect(() => {
    if (!active || !step) return;
    const anchor = step.anchor;
    const measure = () => {
      const node = anchor ? document.querySelector(`[data-tour="${anchor}"]`) : null;
      if (!node) {
        setRect(null);
        return;
      }
      const box = node.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active, step]);

  if (!active || !step) return null;

  const next = () => {
    if (index + 1 >= STEPS.length) {
      finish();
      onOpenTab("jar");
    } else {
      setIndex(index + 1);
    }
  };

  // The card sits under the anchor when there is room, otherwise above it,
  // leaving a gap for the arrow either way.
  const viewport = typeof window === "undefined" ? 800 : window.innerHeight;
  const below = rect ? rect.top + rect.height + 30 : 0;
  const roomBelow = rect ? viewport - below > 190 : true;
  const cardTop = rect ? (roomBelow ? below : Math.max(12, rect.top - 208)) : viewport / 2 - 100;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label={`Tour, step ${index + 1} of ${STEPS.length}`}>
      <div className="absolute inset-0 bg-berry/45" onClick={next} />

      {rect && (
        <>
          {/* The hole */}
          <div
            aria-hidden="true"
            className="absolute rounded-card border-2 border-white"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: "0 0 0 9999px rgba(74, 42, 58, 0.45)",
            }}
          />
          {/* The arrow, pointing from the card at the thing being described */}
          <svg
            aria-hidden="true"
            className="absolute"
            width="26"
            height="18"
            viewBox="0 0 26 18"
            style={{
              top: roomBelow ? rect.top + rect.height + 7 : rect.top - 25,
              left: Math.min(
                Math.max(12, rect.left + rect.width / 2 - 13),
                (typeof window === "undefined" ? 360 : window.innerWidth) - 38,
              ),
              transform: roomBelow ? "rotate(180deg)" : "none",
            }}
          >
            <path d="M13 17 L2 1 L24 1 Z" fill="#fff" />
          </svg>
        </>
      )}

      <div
        className="rise-in absolute left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-card border border-line bg-white p-4 shadow-lift"
        style={{ top: cardTop }}
      >
        <p className="text-[0.6rem] font-bold uppercase tracking-wide text-berry-soft">
          {index + 1} of {STEPS.length}
        </p>
        <p className="mt-0.5 font-display text-lg font-semibold text-plum">{step.title}</p>
        <p className="mt-1 text-sm text-berry-soft">{step.body}</p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={next}>
            {index + 1 >= STEPS.length ? "Start" : "Next"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              finish();
              onOpenTab("jar");
            }}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
