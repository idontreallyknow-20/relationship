"use client";

// A drawn mark for each of the eight currencies.
//
// They were coloured dots, which told you nothing and made a row of them look
// like a progress bar. Each one is now the thing it is: a heart, a pearl in a
// shell, a shell, a worn piece of glass, a wave, a moon, a star, a drop.
//
// All eight are one viewBox, one stroke weight and one visual weight, so a row
// of them reads as a set rather than as clip art. Two tones each, both derived
// from the currency's own colour, so adding a currency needs no new palette.

import type { CurrencyId } from "@/game/types";
import { CURRENCY_BY_ID } from "@/game/config/currencies";

interface GlyphProps {
  className?: string;
  color: string;
}

function Hearts({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 20.5c-.8-.7-8-5.6-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5-7.2 9.9-8 10.6z"
        fill={color}
      />
      <path d="M9 10.5a3 3 0 0 1 2.2-2.7" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.55" />
    </svg>
  );
}

function Pearls({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 15c0-5 4-9 9-9s9 4 9 9z" fill={color} opacity="0.35" />
      <path d="M3 15h18" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 15c0-3 1.8-5.5 4-5.5s4 2.5 4 5.5" stroke={color} strokeWidth="1.2" fill="none" opacity="0.6" />
      <circle cx="12" cy="16.5" r="3.6" fill={color} />
      <circle cx="10.7" cy="15.3" r="1.1" fill="#fff" opacity="0.75" />
    </svg>
  );
}

function Shells({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 21C6.5 21 2.5 16.6 2.5 11.5A9.5 9.5 0 0 1 21.5 11.5C21.5 16.6 17.5 21 12 21z" fill={color} />
      <g stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" fill="none">
        <path d="M12 20.4V4" />
        <path d="M12 20.4 6.2 6.6" />
        <path d="M12 20.4 17.8 6.6" />
        <path d="M12 20.4 3.2 12.4" />
        <path d="M12 20.4 20.8 12.4" />
      </g>
    </svg>
  );
}

function Glass({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* Worn smooth, so no corner is sharp. */}
      <path
        d="M8.5 3.5c3.5-1.4 8 .3 9.6 3.6 1.8 3.7.3 8.6-3 10.9-3.5 2.4-8.7 1.6-10.8-1.8C2 12.6 3.4 5.6 8.5 3.5z"
        fill={color}
        opacity="0.75"
      />
      <path d="M9.5 8.5c1.8-1 4-.6 5.2.9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.6" />
    </svg>
  );
}

function Tide({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <g stroke={color} strokeWidth="2.1" strokeLinecap="round">
        <path d="M2.5 8.5c2-2 3.7-2 5.5 0s3.5 2 5.5 0 3.7-2 5.5 0" opacity="0.45" />
        <path d="M2.5 13c2-2 3.7-2 5.5 0s3.5 2 5.5 0 3.7-2 5.5 0" opacity="0.75" />
        <path d="M2.5 17.5c2-2 3.7-2 5.5 0s3.5 2 5.5 0 3.7-2 5.5 0" />
      </g>
    </svg>
  );
}

function Moons({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M20 14.5A8.6 8.6 0 0 1 9 3.6a9 9 0 1 0 11 10.9z" fill={color} />
      <circle cx="13.2" cy="15.4" r="1.5" fill="#fff" opacity="0.35" />
      <circle cx="8.4" cy="11.6" r="1" fill="#fff" opacity="0.28" />
    </svg>
  );
}

function Stars({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* A four-point star, which sits better beside a moon than a five. */}
      <path d="M12 2.2c.9 5 3.9 8 8.8 8.8-4.9.9-7.9 3.9-8.8 8.8-.9-4.9-3.9-7.9-8.8-8.8 4.9-.8 7.9-3.8 8.8-8.8z" fill={color} />
      <path d="M19.4 17.2c.4 2 1.4 3 3.4 3.4-2 .4-3 1.4-3.4 3.4-.4-2-1.4-3-3.4-3.4 2-.4 3-1.4 3.4-3.4z" fill={color} opacity="0.5" />
    </svg>
  );
}

function Drops({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2.5c4 5.2 6.5 8.8 6.5 11.8a6.5 6.5 0 0 1-13 0c0-3 2.5-6.6 6.5-11.8z" fill={color} />
      <path d="M8.8 14.6a3.4 3.4 0 0 0 2.1 3.1" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.6" />
    </svg>
  );
}

const GLYPHS: Record<CurrencyId, (props: GlyphProps) => React.ReactElement> = {
  hearts: Hearts,
  pearls: Pearls,
  shells: Shells,
  glass: Glass,
  tide: Tide,
  moons: Moons,
  stars: Stars,
  drops: Drops,
};

export function CurrencyIcon({ currency, className = "h-4 w-4" }: {
  currency: CurrencyId;
  className?: string;
}) {
  const Glyph = GLYPHS[currency];
  const color = CURRENCY_BY_ID[currency]?.color ?? "var(--color-berry-soft)";
  if (!Glyph) return null;
  return <Glyph className={className} color={color} />;
}
