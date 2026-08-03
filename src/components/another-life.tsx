"use client";

// In another life. A black screen, a shared counter, and 77777 taps between
// two people. When the number is reached the screen becomes a heart. A small
// message icon lets one person type a note that arrives on the other's phone.

import { useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useWho } from "@/lib/couple-context";
import { displayName } from "@/lib/types";
import { notifyPartner } from "@/lib/notify";
import { enablePush, pushStatus, type PushStatus } from "@/lib/push";
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

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [push, setPush] = useState<PushStatus>("granted");

  const openNote = () => {
    setPush(pushStatus());
    setNoteOpen(true);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (noteOpen) {
      setNoteOpen(false);
      return;
    }
    if (done || !tap()) return;
    const id = ++nextId.current;
    setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => {
      setRipples((r) => r.filter((p) => p.id !== id));
    }, 600);
  };

  const sendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = note.trim();
    if (!text || sending) return;
    setSending(true);
    await notifyPartner("note", crypto.randomUUID(), { body: text });
    setSending(false);
    setNote("");
    setNoteOpen(false);
    setSent(true);
    setTimeout(() => setSent(false), 1600);
  };

  return (
    <div
      className="another-life fixed inset-0 z-[100] bg-black text-white"
      onPointerDown={onPointerDown}
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

      <button
        aria-label="Send a note"
        className="absolute right-3 flex h-10 w-10 items-center justify-center text-white/40"
        style={{ top: "calc(0.75rem + var(--safe-top))" }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => (noteOpen ? setNoteOpen(false) : openNote())}
      >
        <MessageCircle className="h-5 w-5" />
      </button>
      {sent && (
        <span
          className="fade-in pointer-events-none absolute right-14 text-xs text-white/50"
          style={{ top: "calc(1.4rem + var(--safe-top))" }}
        >
          Sent
        </span>
      )}

      {noteOpen && (
        <div
          className="absolute inset-x-0 flex justify-center px-6"
          style={{ top: "calc(4rem + var(--safe-top))" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <form
            onSubmit={sendNote}
            className="rise-in flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-white/25 bg-black p-4"
          >
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={`A note to ${displayName(partner)}`}
              className="w-full border-b border-white/25 bg-transparent pb-2 text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            {push === "default" && (
              <button
                type="button"
                className="text-left text-xs text-white/40 underline"
                onClick={async () => {
                  setPush((await enablePush(me)) ? "granted" : pushStatus());
                }}
              >
                Turn on notifications on this phone
              </button>
            )}
            <div className="flex justify-end gap-5 text-sm">
              <button type="button" className="text-white/40" onClick={() => setNoteOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={!note.trim() || sending}
                className="font-semibold text-white disabled:text-white/30"
              >
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </div>
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
