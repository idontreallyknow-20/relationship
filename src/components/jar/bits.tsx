"use client";

// Small shared pieces. Presentation only: no game rules live here.

import { useState } from "react";
import { CURRENCY_BY_ID } from "@/game/config/currencies";
import { formatNumber } from "@/game/numbers";
import type { CurrencyId, GameState } from "@/game/types";
import { ConfirmDialog, Sheet } from "@/components/ui";

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-plum">{title}</h2>
          {hint && <p className="text-xs text-berry-soft">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = "default" }: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5">
      <p className="truncate text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">{label}</p>
      <p className={`truncate font-display text-base font-semibold ${tone === "accent" ? "text-rose-dark" : "text-plum"}`}>
        {value}
      </p>
    </div>
  );
}

export function Bar({ value, max, color = "var(--color-rose-dark)", height = "0.5rem", label }: {
  value: number;
  max: number;
  color?: string;
  height?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block w-full overflow-hidden rounded-full bg-cream"
      style={{ height }}
    >
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </span>
  );
}

export function CurrencyPill({ currency, amount, format, compact = false }: {
  currency: CurrencyId;
  amount: number;
  format: GameState["settings"]["numberFormat"];
  compact?: boolean;
}) {
  const def = CURRENCY_BY_ID[currency];
  const [open, setOpen] = useState(false);
  if (!def) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${def.name}: ${formatNumber(amount, "full")}`}
        className={`pressable flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white font-semibold ${
          compact ? "px-2 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-xs"
        }`}
      >
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: def.color }} />
        <span className="text-berry">{formatNumber(amount, format)}</span>
        {!compact && <span className="text-berry-soft">{def.short}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={def.name}>
        <div className="space-y-3 pt-1">
          <p className="font-display text-3xl font-semibold" style={{ color: def.color }}>
            {formatNumber(amount, "full")}
          </p>
          <p className="text-sm text-berry">{def.source}</p>
          <p className="text-sm text-berry-soft">{def.purpose}</p>
        </div>
      </Sheet>
    </>
  );
}

export function SpendButton({ currency, amount, format, disabled, confirm, label, onSpend, className = "" }: {
  currency: CurrencyId;
  amount: number;
  format: GameState["settings"]["numberFormat"];
  disabled?: boolean;
  confirm: boolean;
  label: string;
  onSpend: () => void;
  className?: string;
}) {
  const def = CURRENCY_BY_ID[currency];
  const [asking, setAsking] = useState(false);
  // Moons and stars are slow to earn, so spending them asks first.
  const rare = currency === "moons" || currency === "stars";
  const needsConfirm = confirm && rare;

  return (
    <>
      <button
        disabled={disabled}
        onClick={() => (needsConfirm ? setAsking(true) : onSpend())}
        className={`pressable flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
          disabled ? "bg-cream text-berry-soft" : "bg-rose-dark text-white"
        } ${className}`}
      >
        {formatNumber(amount, format)}
      </button>

      <ConfirmDialog
        open={asking}
        title={label}
        message={`Spends ${formatNumber(amount, "full")} ${def?.name}.`}
        confirmLabel="Spend"
        onConfirm={() => {
          setAsking(false);
          onSpend();
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

export function LockedRow({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-3">
      <p className="text-sm font-semibold text-berry-soft">{title}</p>
      <p className="text-xs text-berry-soft">{hint}</p>
    </div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-6 text-center text-sm text-berry-soft">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Creature shapes. Drawn rather than iconographic, so an otter reads    */
/* as an otter at 32 pixels.                                            */
/* ------------------------------------------------------------------ */

export function OtterGlyph({ className = "h-8 w-8", color = "#a87f6a" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <ellipse cx="16" cy="19" rx="9" ry="7" fill={color} />
      <circle cx="16" cy="10" r="6" fill={color} />
      <circle cx="12.5" cy="7" r="2" fill={color} />
      <circle cx="19.5" cy="7" r="2" fill={color} />
      <circle cx="13.8" cy="10" r="1.1" fill="#2f2620" />
      <circle cx="18.2" cy="10" r="1.1" fill="#2f2620" />
      <ellipse cx="16" cy="12.6" rx="1.6" ry="1.1" fill="#2f2620" />
      <ellipse cx="16" cy="19" rx="4.5" ry="3.4" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}

export function CrabGlyph({ className = "h-8 w-8", color = "#8a5a4a" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <ellipse cx="16" cy="18" rx="9" ry="6.5" fill={color} />
      <circle cx="12.5" cy="16" r="1.3" fill="#ffffff" />
      <circle cx="19.5" cy="16" r="1.3" fill="#ffffff" />
      <circle cx="12.5" cy="16" r="0.6" fill="#2f2620" />
      <circle cx="19.5" cy="16" r="0.6" fill="#2f2620" />
      <path d="M6 12c-2 0-3 1.5-2.5 3S6 17 7 15.5" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M26 12c2 0 3 1.5 2.5 3S26 17 25 15.5" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M9 23l-3 3M14 24.5v3.5M18 24.5v3.5M23 23l3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CreatureGlyph({ line, color, className }: {
  line: "otter" | "crab";
  color: string;
  className?: string;
}) {
  return line === "otter"
    ? <OtterGlyph className={className} color={color} />
    : <CrabGlyph className={className} color={color} />;
}
