"use client";

// Shared UI primitives. Keep these small, tactile, and consistent:
// white cards on cream, fine borders, soft shadows, rose accents.

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { HeartIcon } from "./hearts";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-rose-dark text-white hover:bg-rose-deep disabled:bg-rose/50",
  secondary: "bg-blush text-berry hover:bg-blush-deep disabled:opacity-50",
  ghost: "bg-transparent text-berry-soft hover:bg-blush/60 disabled:opacity-50",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const sizes = {
    sm: "px-3.5 py-2 text-sm",
    md: "px-5 py-2.5 text-[0.95rem]",
    lg: "px-6 py-3.5 text-base",
  };
  return (
    <button
      className={`pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-semibold ${buttonStyles[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <HeartIcon className="heart-pulse h-4 w-4" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`pressable inline-flex h-11 w-11 items-center justify-center rounded-full text-berry-soft hover:bg-blush/70 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-line bg-white p-4 shadow-soft ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Label({
  className = "",
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`mb-1.5 block text-sm font-semibold text-berry ${className}`} {...props}>
      {children}
    </label>
  );
}

const fieldClass =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-berry placeholder:text-berry-soft/60 focus:border-rose disabled:opacity-60";

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClass} min-h-24 ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${fieldClass} appearance-none ${className}`} {...props}>
      {children}
    </select>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`pressable min-h-9 flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
            value === opt.value ? "bg-plum text-white" : "text-berry-soft"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <span className="text-blush-deep">{icon ?? <HeartIcon className="h-8 w-8" />}</span>
      <p className="font-display text-xl font-semibold text-plum">{title}</p>
      {hint && <p className="max-w-xs text-sm text-berry-soft">{hint}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet: bottom sheet for composers and pickers.                      */
/* ------------------------------------------------------------------ */

/**
 * Move focus into a dialog, keep it there, and give it back on close.
 *
 * `Sheet` declared a ref for this from the day it was written and never read
 * it, so keyboard focus stayed on the page behind an `aria-modal="true"`
 * overlay: tabbing walked through the chat you could no longer see, and
 * dismissing the dialog left focus wherever it had wandered to.
 */
function useDialogFocus(open: boolean, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;

    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const frame = requestAnimationFrame(() => {
      const first = focusables()[0];
      (first ?? node)?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, ref]);
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(open, ref);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* A full screen close target. Out of the tab order because there is a
          real Close button in the header and this would otherwise be the first
          thing a keyboard reached. */}
      <button
        aria-label="Close"
        tabIndex={-1}
        className="fade-in absolute inset-0 bg-berry/40"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`rise-in relative flex w-full max-w-lg flex-col rounded-t-3xl bg-cream shadow-lift sm:rounded-3xl ${
          tall ? "h-[92dvh] sm:h-[85dvh]" : "max-h-[88dvh]"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="font-display text-2xl font-semibold text-plum">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 pb-8"
          style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(open, ref);

  // Escape and the body scroll lock: `Sheet` has both and this did not, which
  // is an odd pair of siblings in one file given that this is the dialog
  // guarding "revoke this device" and "delete everything".
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button aria-label="Cancel" tabIndex={-1} className="fade-in absolute inset-0 bg-berry/40" onClick={onCancel} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="rise-in relative w-full max-w-sm rounded-card border border-line bg-white p-5 shadow-lift"
      >
        <h2 className="font-display text-xl font-semibold text-plum">{title}</h2>
        <p className="mt-2 text-sm text-berry-soft">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? "danger" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Toasts with optional undo.                                          */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

const ToastContext = createContext<{
  toast: (message: string, undo?: () => void) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, undo?: () => void) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, undo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, undo ? 6000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* The region is always mounted, even with nothing in it.
          It used to be created together with its first toast, and a live region
          inserted into the DOM at the same moment as its content is generally
          not announced: it has to already exist and then change. Every
          confirmation in the app goes through here, so all of them were
          silent. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
            style={{ bottom: "calc(5.5rem + var(--safe-bottom))" }}
            aria-live="polite"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className="rise-in pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-berry px-5 py-2.5 text-sm font-medium text-white shadow-lift"
              >
                {t.message}
                {t.undo && (
                  <button
                    className="font-bold text-blush underline"
                    onClick={() => {
                      t.undo?.();
                      setToasts((prev) => prev.filter((x) => x.id !== t.id));
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Page scaffolding.                                                   */
/* ------------------------------------------------------------------ */

export function TopBar({
  title,
  back,
  action,
}: {
  title: string;
  back?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line-soft bg-cream/95 backdrop-blur-sm"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-2 px-4 lg:max-w-5xl">
        {back && (
          <IconButton label="Back" onClick={back} className="-ml-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        )}
        <h1 className="flex-1 truncate font-display text-2xl font-semibold text-plum">{title}</h1>
        {action}
      </div>
    </header>
  );
}

export function Avatar({
  name,
  url,
  size = "md",
  online = false,
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
}) {
  const sizes = { sm: "h-8 w-8 text-sm", md: "h-11 w-11 text-base", lg: "h-16 w-16 text-xl", xl: "h-24 w-24 text-3xl" };
  return (
    <span className={`relative inline-flex shrink-0 ${sizes[size]}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className="h-full w-full rounded-full border border-line object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full border border-line bg-lavender font-display font-semibold text-plum">
          {name.charAt(0)}
        </span>
      )}
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white"
          title="Online"
        >
          <HeartIcon className="h-2.5 w-2.5 text-success" />
        </span>
      )}
    </span>
  );
}
