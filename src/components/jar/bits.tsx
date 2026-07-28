"use client";

// Small shared pieces for the Love Jar screens. Everything here is presentation
// only: no game rules live in this file.

import { useState } from "react";
import { CURRENCY_BY_ID } from "@/game/config/currencies";
import { formatNumber } from "@/game/numbers";
import type { CurrencyId, GameState } from "@/game/types";
import { HeartIcon } from "@/components/hearts";
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

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5">
      <p className="truncate text-[0.6rem] font-semibold uppercase tracking-wide text-berry-soft">
        {label}
      </p>
      <p
        className={`truncate font-display text-base font-semibold ${
          tone === "accent" ? "text-rose-dark" : "text-plum"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function Bar({
  value,
  max,
  color = "var(--color-rose-dark)",
  height = "0.5rem",
  label,
}: {
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

/** A currency balance with an explanation behind a tap. */
export function CurrencyPill({
  currency,
  amount,
  format,
  compact = false,
}: {
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
        aria-label={`${def.name}: ${formatNumber(amount, "full")}. What is this?`}
        className={`pressable flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white font-semibold ${
          compact ? "px-2 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-xs"
        }`}
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: def.color }}
        />
        <span className="text-berry">{formatNumber(amount, format)}</span>
        {!compact && <span className="text-berry-soft">{def.short}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={def.name}>
        <div className="space-y-3 pt-1">
          <p className="font-display text-3xl font-semibold" style={{ color: def.color }}>
            {formatNumber(amount, "full")}
          </p>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-berry-soft">Where it comes from</p>
            <p className="text-sm text-berry">{def.source}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-berry-soft">What it is for</p>
            <p className="text-sm text-berry">{def.purpose}</p>
          </div>
          {def.rare && (
            <p className="rounded-xl bg-blush/60 px-3.5 py-2.5 text-sm text-berry">
              This one is rare. The game asks before you spend it.
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Buy button that confirms first when a rare currency is involved. */
export function SpendButton({
  currency,
  amount,
  format,
  disabled,
  confirm,
  label,
  onSpend,
  className = "",
}: {
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
  const needsConfirm = confirm && def?.rare;

  return (
    <>
      <button
        disabled={disabled}
        onClick={() => (needsConfirm ? setAsking(true) : onSpend())}
        className={`pressable flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
          disabled ? "bg-cream text-berry-soft" : "bg-rose-dark text-white"
        } ${className}`}
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: disabled ? "var(--color-line)" : "#ffffff" }}
        />
        {formatNumber(amount, format)}
      </button>

      <ConfirmDialog
        open={asking}
        title={label}
        message={`This spends ${formatNumber(amount, "full")} ${def?.name}. That currency is rare and slow to earn.`}
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

export function RarityTag({ rarity, color }: { rarity: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {rarity}
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

export function JarGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path
        d="M7 4h10v2c1.6 1.4 2.4 3 2.4 5v8a3 3 0 0 1-3 3H7.6a3 3 0 0 1-3-3v-8c0-2 .8-3.6 2.4-5V4z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M6 2.6h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12 17c-.3-.3-4-2.8-4-5.3A2.2 2.2 0 0 1 12 10a2.2 2.2 0 0 1 4 1.7c0 2.5-3.7 5-4 5.3z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HeartTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-dark">
      <HeartIcon className="h-3 w-3" />
      {children}
    </span>
  );
}
