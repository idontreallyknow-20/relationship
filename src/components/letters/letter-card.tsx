"use client";

// Inbox letter card: sealed open-when envelopes, unlocked scheduled letters,
// and a blush highlight plus heart badge on anything not yet opened.

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button, Card, ConfirmDialog } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatRelative, formatShortDate } from "@/lib/format";
import type { Letter, LetterKind } from "@/lib/types";

export const KIND_CHIP: Record<LetterKind, string> = {
  instant: "Note",
  scheduled: "Scheduled letter",
  open_when: "Open when",
  compliment: "Compliment",
  appreciation: "Appreciation",
};

export function InboxLetterCard({
  letter,
  authorName,
  onMarkOpened,
}: {
  letter: Letter;
  authorName: string;
  onMarkOpened: (id: string) => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const unopened = letter.opened_at === null;
  const sealed = letter.kind === "open_when" && unopened;

  const open = async () => {
    setOpening(true);
    await onMarkOpened(letter.id);
    setOpening(false);
    setConfirmOpen(false);
  };

  if (sealed) {
    return (
      <>
        <Card className="flex flex-col items-center gap-2.5 border-blush-deep bg-blush/40 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-rose-dark shadow-soft">
            <Mail className="h-6 w-6" />
          </span>
          <p className="font-display text-xl font-semibold text-plum">
            Open when {letter.open_when_label || "the time is right"}
          </p>
          <p className="text-xs text-berry-soft">
            Sealed by {authorName} {formatRelative(letter.created_at)}
          </p>
          <Button size="sm" onClick={() => setConfirmOpen(true)} loading={opening}>
            Open it
          </Button>
        </Card>
        <ConfirmDialog
          open={confirmOpen}
          title="Open this letter now?"
          message={`It is meant for when ${letter.open_when_label || "the time is right"}. There is no sealing it back up.`}
          confirmLabel="Open it"
          onConfirm={() => void open()}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  }

  return (
    <Card className={`flex flex-col gap-2 ${unopened ? "border-blush-deep bg-blush/30" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-rose-dark">
          {KIND_CHIP[letter.kind]}
        </span>
        {letter.kind === "open_when" && letter.open_when_label && (
          <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-plum">
            {letter.open_when_label}
          </span>
        )}
        {letter.kind === "scheduled" && letter.unlock_at && (
          <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-plum">
            Unlocked {formatShortDate(letter.unlock_at)}
          </span>
        )}
        {unopened && <HeartIcon className="ml-auto h-4 w-4 text-rose-deep" />}
      </div>

      {letter.title && (
        <p className="font-display text-xl font-semibold text-plum">{letter.title}</p>
      )}
      <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-berry">{letter.body}</p>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-berry-soft">
          {authorName}, {formatRelative(letter.created_at)}
        </p>
        {unopened && (
          <Button size="sm" variant="ghost" onClick={() => void open()} loading={opening}>
            Mark as read
          </Button>
        )}
      </div>
    </Card>
  );
}
