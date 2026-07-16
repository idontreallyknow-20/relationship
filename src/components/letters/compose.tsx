"use client";

// Letter composer: five kinds presented as pretty cards, drafts persisted
// per kind, and the right notification behavior for each kind.

import { useEffect, useRef, useState } from "react";
import { Clock, Mail, Send, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWho } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { Button, Input, Label, Textarea, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import type { LetterKind } from "@/lib/types";
import { formatShortDate, formatTime } from "@/lib/format";

interface LetterDraft {
  title: string;
  body: string;
  whenLabel: string;
  unlockAt: string;
}

const EMPTY_DRAFT: LetterDraft = { title: "", body: "", whenLabel: "", unlockAt: "" };

const KIND_CARDS: {
  value: LetterKind;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "instant", label: "Instant note", hint: "Lands right away", icon: Send },
  { value: "scheduled", label: "Scheduled letter", hint: "Unlocks at a chosen time", icon: Clock },
  { value: "open_when", label: "Open when...", hint: "Sealed until the moment is right", icon: Mail },
  { value: "compliment", label: "Compliment card", hint: "A little boost", icon: Star },
  {
    value: "appreciation",
    label: "Appreciation note",
    hint: "Thank them for something",
    icon: ({ className }) => <HeartIcon className={className} />,
  },
];

export function ComposeLetter({
  partnerName,
  onSent,
}: {
  partnerName: string;
  onSent: () => void;
}) {
  const { me } = useWho();
  const toast = useToast();

  const [kind, setKind] = useState<LetterKind>("instant");
  const [draft, setDraft] = useState<LetterDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedKind = useRef<LetterKind | null>(null);

  // Load the draft for the selected kind; each kind keeps its own draft.
  useEffect(() => {
    const stored = loadDraft<LetterDraft>(`letter:${kind}`);
    setDraft(stored ? { ...EMPTY_DRAFT, ...stored } : EMPTY_DRAFT);
    setError(null);
    loadedKind.current = kind;
  }, [kind]);

  useEffect(() => {
    if (loadedKind.current === kind) saveDraft(`letter:${kind}`, draft);
  }, [kind, draft]);

  const set = <K extends keyof LetterDraft>(key: K, value: LetterDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const send = async () => {
    if (saving) return;
    setError(null);
    if (!draft.body.trim()) {
      setError("Write something first.");
      return;
    }
    let unlockIso: string | null = null;
    if (kind === "scheduled") {
      const when = draft.unlockAt ? new Date(draft.unlockAt) : null;
      if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        setError("Pick a time in the future.");
        return;
      }
      unlockIso = when.toISOString();
    }
    if (kind === "open_when" && !draft.whenLabel.trim()) {
      setError("Add the moment, like: you miss me.");
      return;
    }

    setSaving(true);
    const { data, error: insertError } = await supabase()
      .from("letters")
      .insert({
        author: me,
        kind,
        title: draft.title.trim() || null,
        body: draft.body.trim(),
        open_when_label: kind === "open_when" ? draft.whenLabel.trim() : null,
        unlock_at: unlockIso,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insertError || !data) {
      toast("Could not send the letter, try again");
      return;
    }

    const id = (data as { id: string }).id;
    // Scheduled letters are announced by the server at unlock time, not here.
    if (kind === "open_when") {
      void notifyPartner("letters", id, {
        body: "An open-when letter is waiting",
        url: "/letters",
      });
    } else if (kind !== "scheduled") {
      void notifyPartner("letters", id, { url: "/letters" });
    }

    clearDraft(`letter:${kind}`);
    setDraft(EMPTY_DRAFT);
    if (kind === "scheduled" && unlockIso) {
      toast(`Scheduled for ${formatShortDate(unlockIso)} at ${formatTime(unlockIso)}`);
    } else if (kind === "open_when") {
      toast("Sealed and waiting");
    } else {
      toast(`Sent to ${partnerName}`);
    }
    onSent();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Letter kind">
        {KIND_CARDS.map((card) => {
          const selected = kind === card.value;
          return (
            <button
              key={card.value}
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(card.value)}
              className={`pressable flex min-h-11 items-center gap-2.5 rounded-card border px-3 py-2.5 text-left shadow-soft ${
                selected ? "border-rose-deep bg-blush" : "border-line bg-white"
              }`}
            >
              <card.icon className="h-4.5 w-4.5 shrink-0 text-rose-dark" />
              <span className="text-sm font-semibold text-berry">{card.label}</span>
            </button>
          );
        })}
      </div>

      {kind === "scheduled" && (
        <div>
          <Label htmlFor="letter-unlock">Unlocks at</Label>
          <Input
            id="letter-unlock"
            type="datetime-local"
            value={draft.unlockAt}
            onChange={(e) => set("unlockAt", e.target.value)}
          />
          <p className="mt-1 text-xs text-berry-soft">
            {partnerName} will not see it until then.
          </p>
        </div>
      )}

      {kind === "open_when" && (
        <div>
          <Label htmlFor="letter-when">Open when...</Label>
          <Input
            id="letter-when"
            value={draft.whenLabel}
            onChange={(e) => set("whenLabel", e.target.value)}
            placeholder="you miss me"
            maxLength={80}
          />
        </div>
      )}

      <div>
        <Label htmlFor="letter-title">Title, if you like</Label>
        <Input
          id="letter-title"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="A few words"
          maxLength={120}
        />
      </div>

      <div>
        <Label htmlFor="letter-body">Your letter</Label>
        <Textarea
          id="letter-body"
          value={draft.body}
          onChange={(e) => set("body", e.target.value)}
          placeholder={`Dear ${partnerName},`}
          className="min-h-40"
          maxLength={5000}
        />
      </div>

      {error && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      )}

      <Button size="lg" onClick={() => void send()} loading={saving} disabled={!draft.body.trim()}>
        {kind === "scheduled" ? "Schedule letter" : kind === "open_when" ? "Seal letter" : "Send"}
      </Button>
    </div>
  );
}
