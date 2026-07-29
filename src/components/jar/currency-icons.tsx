"use client";

// A drawn mark for each of the seven currencies.
//
// Each one is the thing it is: a heart, a ribbon tied round a jar lid, a little
// keepsake box, a moon, a star, a sun, an hourglass.
//
// Reported as "the icons are all confusing", and they were, for a specific
// reason worth writing down: three of them were another currency's drawing
// reused. Ribbons borrowed the shell, keepsakes borrowed the wave and suns
// borrowed the raindrop, left over from the sea currencies they replaced. So
// the wallet held three marks that pictured something the game no longer has,
// and two of them pictured the same kind of thing as each other. They are
// drawn now.
//
// All seven are one viewBox and one visual weight, so a row of them reads as a
// set rather than as clip art, and two tones each, both derived from the
// currency's own colour, so adding a currency needs no new palette.

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


function Hours({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* An hourglass, most of the sand already through. */}
      <path d="M6.5 3h11a1 1 0 0 1 .8 1.6L13.3 12l5 7.4a1 1 0 0 1-.8 1.6h-11a1 1 0 0 1-.8-1.6l5-7.4-5-7.4A1 1 0 0 1 6.5 3z" fill={color} />
      <path d="M9 18.4c.9-1.4 1.9-2.3 3-2.3s2.1.9 3 2.3z" fill="#fff" opacity="0.45" />
      <circle cx="12" cy="9.4" r="1" fill="#fff" opacity="0.5" />
    </svg>
  );
}

function Ribbons({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* A ribbon tied round a jar lid: a knot and two tails. */}
      <path d="M3.2 8.4h17.6v3.2H3.2z" fill={color} opacity="0.55" />
      <circle cx="12" cy="10" r="2.4" fill={color} />
      <path d="M12 12.2 8.6 20l3.4-2.1 3.4 2.1z" fill={color} />
      <circle cx="12" cy="10" r="0.9" fill="#fff" opacity="0.5" />
    </svg>
  );
}

function Keepsakes({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* A small box with a lid, for the things the two of you keep. */}
      <path d="M4 10.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill={color} />
      <path d="M3 7.2h18v3.3H3z" fill={color} opacity="0.6" />
      <path d="M12 7.2c-1.6-2.4-4.6-2.6-4.6-.6 0 .3.2.5.5.6z" fill={color} opacity="0.8" />
      <path d="M12 7.2c1.6-2.4 4.6-2.6 4.6-.6 0 .3-.2.5-.5.6z" fill={color} opacity="0.8" />
      <rect x="11.1" y="10.5" width="1.8" height="10" fill="#fff" opacity="0.4" />
    </svg>
  );
}

function Suns({ className, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill={color} />
      <g stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.7">
        <path d="M12 1.6v2.8M12 19.6v2.8M1.6 12h2.8M19.6 12h2.8" />
        <path d="M4.6 4.6 6.6 6.6M17.4 17.4l2 2M19.4 4.6l-2 2M6.6 17.4l-2 2" />
      </g>
      <circle cx="10.3" cy="10.3" r="1.4" fill="#fff" opacity="0.35" />
    </svg>
  );
}

const GLYPHS: Record<CurrencyId, (props: GlyphProps) => React.ReactElement> = {
  hearts: Hearts,
  ribbons: Ribbons,
  keepsakes: Keepsakes,
  moons: Moons,
  stars: Stars,
  suns: Suns,
  hours: Hours,
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
