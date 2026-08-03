"use client";

// In another life. A black screen, a shared counter, and 77777 taps between
// two people. When the number is reached the screen becomes a heart.

import { useRef, useState } from "react";
import { useWho } from "@/lib/couple-context";
import { displayName } from "@/lib/types";
import { useAnotherLife, TARGET } from "@/lib/use-another-life";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function AnotherLife() {
  const { me, partner } = useWho();
  const { counts, total, done, tap } = useAnotherLife();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!tap()) return;
    const id = ++nextId.current;
    setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => {
      setRipples((r) => r.filter((p) => p.id !== id));
    }, 600);
  };

  return (
    <div
      className="another-life fixed inset-0 z-50 bg-black text-white"
      onPointerDown={done ? undefined : onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {done ? (
        <div className="flex h-full items-center justify-center">
          <SketchHeart className="h-[62vmin] w-[62vmin]" />
        </div>
      ) : (
        <>
          <div className="flex h-full items-center justify-center">
            <span className="text-3xl tabular-nums tracking-wide" aria-live="polite">
              {counts ? `${total}/${TARGET}` : ""}
            </span>
          </div>
          {counts && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-8 text-xs text-white/50"
              style={{ paddingBottom: "calc(1.25rem + var(--safe-bottom))" }}
            >
              <span>
                {displayName(me)} {counts[me]}
              </span>
              <span>
                {displayName(partner)} {counts[partner]}
              </span>
            </div>
          )}
          {ripples.map((r) => (
            <span
              key={r.id}
              className="tap-ripple pointer-events-none absolute h-12 w-12 rounded-full border border-white/40"
              style={{ left: r.x, top: r.y }}
              aria-hidden="true"
            />
          ))}
        </>
      )}
    </div>
  );
}

// A white outline heart that reads as hand drawn: a confident main stroke,
// a lighter second pass slightly off the first, a loose dashed sketch pass,
// and a few stray construction marks near the lobes.
function SketchHeart({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      role="img"
      aria-label="Heart"
    >
      <path
        d="M100 167 C 63 140, 26 111, 22 75 C 19 53, 37 34, 59 35 C 79 36, 93 48, 100 63 C 107 48, 121 36, 141 35 C 163 34, 181 53, 178 75 C 174 111, 137 140, 100 167 Z"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M101 163 C 67 137, 32 109, 28 77 C 25 57, 41 40, 61 41 C 79 42, 92 53, 100 67 C 108 53, 121 41, 139 40 C 159 39, 174 56, 172 76 C 169 108, 135 135, 101 163 Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path
        d="M98 171 C 59 142, 20 112, 18 72 C 16 49, 36 30, 60 32 C 81 34, 94 46, 100 59 C 106 45, 120 31, 142 30 C 165 29, 184 50, 181 74 C 178 113, 140 143, 98 171"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
        strokeDasharray="26 9 44 6 31 11"
      />
      <path
        d="M52 42 C 47 46, 42 52, 40 59"
        stroke="white"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M148 41 C 154 45, 159 51, 161 58"
        stroke="white"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M100 70 C 101 74, 101 78, 100 82"
        stroke="white"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.25"
      />
    </svg>
  );
}
