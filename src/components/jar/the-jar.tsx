"use client";

// The jar, with the hearts actually in it.
//
// The old one was a 176 pixel rounded rectangle with a coloured block for
// water, a line for the surface and a bar for the floor. It was a tank, because
// creatures lived in it and needed depth to swim in and floor to walk on. They
// sit on the table now, so this can be what it was always supposed to be: a
// jar, with hearts piling up inside it that you can count.
//
// The shape is lifted from `JarSvg` on the home screen, which has been drawing
// a proper mason jar since the first week and was the right drawing all along.
// The two now match, which they never did.
//
// Nothing here simulates anything. `heartsToPile` turns the balance into a bag
// of coloured hearts and this draws the bag, so the picture cannot drift from
// the number and both phones agree without being told.

import { useMemo } from "react";
import {
  HEART_TIERS, heartsToPile, highestTier, mergeProgress,
} from "@/game/config/hearts";
import type { JarDef } from "@/game/config/jars";
import { seededRandom } from "@/game/numbers";

const HEART_PATH =
  "M12 21c-.6-.5-9-6.4-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 5.6-8.4 11.5-9 12z";

/** The inside of the jar in view units, which everything below is placed in. */
const INNER = { x: 16, y: 30, w: 68, h: 74 };

interface Placed {
  key: string;
  tier: number;
  x: number;
  y: number;
  size: number;
  rotate: number;
}

/**
 * Stack the pile from the bottom of the jar upward, biggest hearts first.
 *
 * Deterministic: position and angle come from a seeded hash of the heart's
 * index, so the jar does not reshuffle itself on every render, and a heart that
 * was in the middle stays in the middle when its neighbour merges away.
 */
function place(pile: { tier: number; count: number }[]): Placed[] {
  const out: Placed[] = [];
  const total = pile.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return out;

  // Fill from the bottom in rows, widening the jar's usable width as we go up.
  const perRow = Math.max(4, Math.min(9, Math.ceil(Math.sqrt(total * 1.4))));
  const rows = Math.ceil(total / perRow);
  const rowHeight = Math.min(11, INNER.h / Math.max(1, rows));
  const size = Math.max(5, Math.min(13, rowHeight * 1.15));

  let index = 0;
  for (const entry of pile) {
    for (let n = 0; n < entry.count; n++) {
      const row = Math.floor(index / perRow);
      const col = index % perRow;
      const jitterX = seededRandom(`x${index}`) * 3 - 1.5;
      const jitterY = seededRandom(`y${index}`) * 2 - 1;
      const step = INNER.w / perRow;
      out.push({
        key: `${entry.tier}:${n}`,
        tier: entry.tier,
        x: INNER.x + col * step + step / 2 + jitterX,
        y: INNER.y + INNER.h - row * rowHeight - rowHeight / 2 + jitterY,
        size,
        rotate: seededRandom(`r${index}`) * 44 - 22,
      });
      index += 1;
    }
  }
  return out;
}

export function TheJar({
  hearts,
  jar,
  capacity,
  reducedMotion,
  className = "",
}: {
  hearts: number;
  jar: JarDef;
  capacity: number;
  reducedMotion: boolean;
  className?: string;
}) {
  const pile = useMemo(() => heartsToPile(hearts, 96), [hearts]);
  const placed = useMemo(() => place(pile), [pile]);
  const top = highestTier(hearts);
  const nextMerge = mergeProgress(hearts);
  const full = capacity > 0 ? Math.min(1, hearts / capacity) : 0;

  // The level behind the hearts. Fills toward the jar being ready to seal, so
  // there is one thing to watch that answers "how close am I".
  const levelTop = INNER.y + INNER.h * (1 - full);

  return (
    <svg
      viewBox="0 0 100 120"
      className={className}
      role="img"
      aria-label={`${jar.name}, holding ${Math.floor(hearts).toLocaleString()} hearts`}
    >
      <defs>
        <clipPath id="jar-inside">
          <path d="M28 26 c-6 6 -10 14 -10 24 v52 a14 14 0 0 0 14 14 h36 a14 14 0 0 0 14 -14 v-52 c0 -10 -4 -18 -10 -24 z" />
        </clipPath>
      </defs>

      {/* The glass */}
      <path
        d="M28 18 h44 v6 c6 6 10 14 10 24 v52 a14 14 0 0 1 -14 14 h-36 a14 14 0 0 1 -14 -14 v-52 c0 -10 4 -18 10 -24 z"
        fill={jar.backdrop}
        stroke={jar.glass}
        strokeWidth="2.5"
      />

      <g clipPath="url(#jar-inside)">
        {/* How full it is, behind everything. */}
        {full > 0.001 && (
          <rect
            x="16"
            y={levelTop}
            width="68"
            height={INNER.y + INNER.h - levelTop + 4}
            fill={HEART_TIERS[top]?.color ?? "#f0b8c8"}
            opacity={0.14}
          />
        )}

        {placed.map((heart) => {
          const tier = HEART_TIERS[heart.tier];
          return (
            <g
              key={heart.key}
              transform={`translate(${heart.x} ${heart.y}) scale(${heart.size / 24}) rotate(${heart.rotate}) translate(-12 -13)`}
            >
              <path d={HEART_PATH} fill={tier.color} stroke={tier.edge} strokeWidth={1.2} />
            </g>
          );
        })}
      </g>

      {/* The lid */}
      <rect x="24" y="8" width="52" height="10" rx="5" fill={jar.glass} />

      {/* How close the next merge is, drawn on the lid's shadow so it never
          competes with the hearts for attention. */}
      {nextMerge > 0.02 && nextMerge < 1 && (
        <rect
          x="24"
          y="19.5"
          width={52 * nextMerge}
          height="2"
          rx="1"
          fill={HEART_TIERS[Math.min(top + 1, HEART_TIERS.length - 1)]?.color ?? "#e08aa4"}
          opacity={0.75}
          className={reducedMotion ? undefined : "fade-in"}
        />
      )}
    </svg>
  );
}

/** The colour ladder, for the panel that explains it. */
export function HeartLadder({ hearts }: { hearts: number }) {
  const top = highestTier(hearts);
  const shown = HEART_TIERS.slice(0, Math.min(HEART_TIERS.length, top + 2));

  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((tier) => {
        const met = tier.tier <= top;
        return (
          <li
            key={tier.tier}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${
              met ? "border-line bg-white text-berry" : "border-line-soft bg-cream text-berry-soft"
            }`}
          >
            <svg viewBox="0 0 24 26" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <path
                d={HEART_PATH}
                fill={met ? tier.color : "var(--color-line)"}
                stroke={met ? tier.edge : "var(--color-line)"}
                strokeWidth={1.2}
              />
            </svg>
            {met ? tier.name : "?"}
          </li>
        );
      })}
    </ul>
  );
}
