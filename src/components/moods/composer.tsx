"use client";

// Bottom-sheet composer for a new mood check-in. Draft-persisted so an
// accidental close never loses what was typed.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWho } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { Button, Input, Label, Select, Sheet, Textarea, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import type { Mood } from "@/lib/types";
import { MOOD_OPTIONS } from "./meta";
import { noteRewardable } from "@/game/rewards-inbox";

type ExpireOption = "never" | "1h" | "tonight" | "24h";

interface MoodDraft {
  mood: Mood | null;
  customLabel: string;
  intensity: number;
  note: string;
  wouldHelp: string;
  visible: boolean;
  expire: ExpireOption;
}

const DRAFT_KEY = "mood-composer";

const EMPTY: MoodDraft = {
  mood: null,
  customLabel: "",
  intensity: 3,
  note: "",
  wouldHelp: "",
  visible: true,
  expire: "never",
};

function expiresAt(option: ExpireOption): string | null {
  const now = new Date();
  if (option === "1h") return new Date(now.getTime() + 3600_000).toISOString();
  if (option === "24h") return new Date(now.getTime() + 24 * 3600_000).toISOString();
  if (option === "tonight") {
    const tonight = new Date(now);
    tonight.setHours(23, 59, 59, 0);
    return tonight.toISOString();
  }
  return null;
}

export function MoodComposer({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { me } = useWho();
  const toast = useToast();
  const [draft, setDraft] = useState<MoodDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  // Restore the draft once on mount, then persist every change.
  useEffect(() => {
    const stored = loadDraft<MoodDraft>(DRAFT_KEY);
    if (stored) setDraft({ ...EMPTY, ...stored });
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveDraft(DRAFT_KEY, draft);
  }, [draft]);

  const set = <K extends keyof MoodDraft>(key: K, value: MoodDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const valid =
    draft.mood !== null && (draft.mood !== "custom" || draft.customLabel.trim().length > 0);

  const submit = async () => {
    if (!valid || !draft.mood || saving) return;
    setSaving(true);
    const { data, error } = await supabase()
      .from("moods")
      .insert({
        person: me,
        mood: draft.mood,
        custom_label: draft.mood === "custom" ? draft.customLabel.trim() : null,
        intensity: draft.intensity,
        note: draft.note.trim() || null,
        would_help: draft.wouldHelp.trim() || null,
        visible: draft.visible,
        expires_at: expiresAt(draft.expire),
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      toast("Could not save your mood, try again");
      return;
    }
    if (draft.visible) {
      void notifyPartner("moods", (data as { id: string }).id, { url: "/moods" });
      void noteRewardable(
        "mood_shared",
        new Date().toISOString().slice(0, 10),
        `mood:${(data as { id: string }).id}`,
      );
    }
    clearDraft(DRAFT_KEY);
    setDraft(EMPTY);
    toast(draft.visible ? "Mood shared" : "Mood saved just for you");
    onClose();
    onSaved();
  };

  return (
    <Sheet open={open} onClose={onClose} title="How are you feeling?" tall>
      <div className="flex flex-col gap-5 pt-2">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mood">
          {MOOD_OPTIONS.map((option) => {
            const selected = draft.mood === option.value;
            return (
              <button
                key={option.value}
                role="radio"
                aria-checked={selected}
                onClick={() => set("mood", option.value)}
                className={`pressable flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold ${
                  selected
                    ? "border-rose-deep bg-blush text-berry"
                    : "border-line bg-white text-berry-soft"
                }`}
              >
                <HeartIcon className={`h-4 w-4 shrink-0 ${option.color}`} filled={selected} />
                {option.label}
              </button>
            );
          })}
        </div>

        {draft.mood === "custom" && (
          <div>
            <Label htmlFor="mood-custom-label">Name this feeling</Label>
            <Input
              id="mood-custom-label"
              value={draft.customLabel}
              onChange={(e) => set("customLabel", e.target.value)}
              placeholder="Label"
              maxLength={40}
            />
          </div>
        )}

        <div>
          <Label id="mood-intensity-label">How strongly?</Label>
          <div
            role="radiogroup"
            aria-labelledby="mood-intensity-label"
            className="flex items-center gap-1"
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                role="radio"
                aria-checked={draft.intensity === i}
                aria-label={`Intensity ${i} of 5`}
                onClick={() => set("intensity", i)}
                className="pressable flex h-11 w-11 items-center justify-center rounded-full text-rose-deep hover:bg-blush/60"
              >
                <HeartIcon className="h-6 w-6" filled={i <= draft.intensity} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="mood-note">A note, if you like</Label>
          <Textarea
            id="mood-note"
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="What is on your mind"
            maxLength={500}
          />
        </div>

        <div>
          <Label htmlFor="mood-help">What would help right now?</Label>
          <Input
            id="mood-help"
            value={draft.wouldHelp}
            onChange={(e) => set("wouldHelp", e.target.value)}
            placeholder="Optional"
            maxLength={200}
          />
        </div>

        <button
          role="switch"
          aria-checked={draft.visible}
          onClick={() => set("visible", !draft.visible)}
          className="pressable flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5"
        >
          <span className="text-sm font-semibold text-berry">Share with partner</span>
          <span
            aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full ${
              draft.visible ? "bg-rose-deep" : "bg-line"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft ${
                draft.visible ? "left-6" : "left-1"
              }`}
            />
          </span>
        </button>

        <div>
          <Label htmlFor="mood-expire">Disappears</Label>
          <Select
            id="mood-expire"
            value={draft.expire}
            onChange={(e) => set("expire", e.target.value as ExpireOption)}
          >
            <option value="never">Never</option>
            <option value="1h">1 hour</option>
            <option value="tonight">Until tonight</option>
            <option value="24h">24 hours</option>
          </Select>
        </div>

        <Button size="lg" onClick={() => void submit()} disabled={!valid} loading={saving}>
          Save mood
        </Button>
      </div>
    </Sheet>
  );
}
