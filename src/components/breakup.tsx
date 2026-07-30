"use client";

// The whole app now resolves to this: a heart that breaks, then a blackout.
// Everything else in src/ is left intact but unreachable, because the root
// layout renders this instead of the routed children.

import { useEffect, useState } from "react";

// How long the break animation runs before the screen goes black.
const BREAK_MS = 4200;
const BREAK_MS_REDUCED = 1200;

// The two halves share the same jagged seam, so they sit flush until they part.
// A whole heart sits underneath them until the split, so the seam does not
// show as a hairline while the heart is still beating.
const HEART = "M12 21c-.6-.5-9-6.4-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 5.6-8.4 11.5-9 12z";
const SEAM = "L12.6 18.2 L10.9 15.8 L13.3 13.4 L11 10.8 L13.1 8.6 Z";
const LEFT_HALF = `M12 6 A5 5 0 0 0 3 9 C3 14.6 11.4 20.5 12 21 ${SEAM}`;
const RIGHT_HALF = `M12 6 A5 5 0 0 1 21 9 C21 14.6 12.6 20.5 12 21 ${SEAM}`;
const CRACK = "M12 6 L13.1 8.6 L11 10.8 L13.3 13.4 L10.9 15.8 L12.6 18.2 L12 21";

function BrokenHeart() {
  return (
    <div className="breakup-beat">
      <svg
        viewBox="0 0 24 24"
        className="h-44 w-44 overflow-visible text-rose-deep"
        aria-hidden="true"
      >
        <path className="breakup-whole" d={HEART} fill="currentColor" />
        <path className="breakup-half-left" d={LEFT_HALF} fill="currentColor" />
        <path className="breakup-half-right" d={RIGHT_HALF} fill="currentColor" />
        <path
          className="breakup-crack"
          d={CRACK}
          fill="none"
          stroke="var(--color-cream)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function BreakStage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      <BrokenHeart />
      <p className="breakup-line font-display text-4xl text-rose-dark">
        it&apos;s over
      </p>
    </main>
  );
}

function Blackout({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="breakup-blackout fixed inset-0 z-50 flex items-center justify-center bg-black px-6 text-center">
      <p className="breakup-echo font-display text-3xl tracking-wide text-[#6b6469]">
        maybe in another{" "}
        <button type="button" onClick={onReplay} className="breakup-egg" aria-label="Play it again">
          life
        </button>
        ...
      </p>
    </div>
  );
}

export function Breakup() {
  const [dark, setDark] = useState(false);
  // Bumping this remounts the stage so the animation replays from the top.
  const [run, setRun] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setDark(true), reduced ? BREAK_MS_REDUCED : BREAK_MS);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <>
      <BreakStage key={run} />
      {dark && (
        <Blackout
          onReplay={() => {
            setDark(false);
            setRun((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
