"use client";

// Bottom-sheet composer for adding a new memory.

import { useEffect, useRef, useState } from "react";
import { Camera, Film, HeartHandshake, NotebookPen, CalendarHeart } from "lucide-react";
import { Button, Input, Label, Sheet, Textarea, useToast } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { supabase } from "@/lib/supabase";
import { compressImage, uploadMedia, validateUpload } from "@/lib/media";
import { notifyPartner } from "@/lib/notify";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import type { Memory, MemoryKind, Person } from "@/lib/types";

type ComposerKind = Extract<MemoryKind, "photo" | "video" | "note" | "milestone" | "date">;

const KIND_OPTIONS: { value: ComposerKind; label: string; icon: React.ReactNode }[] = [
  { value: "photo", label: "Photo", icon: <Camera className="h-4 w-4" /> },
  { value: "video", label: "Video", icon: <Film className="h-4 w-4" /> },
  { value: "note", label: "Note", icon: <NotebookPen className="h-4 w-4" /> },
  { value: "milestone", label: "Milestone", icon: <HeartHandshake className="h-4 w-4" /> },
  { value: "date", label: "Date", icon: <CalendarHeart className="h-4 w-4" /> },
];

const DRAFT_KEY = "memory-composer";

interface DraftShape {
  kind: ComposerKind;
  title: string;
  caption: string;
  happenedOn: string;
  location: string;
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function MemoryComposer({
  open,
  onClose,
  me,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  me: Person;
  onSaved: (memory: Memory) => void;
}) {
  const toast = useToast();
  // Restore any saved draft once on mount; drafts persist across sessions.
  const [draft] = useState<DraftShape | null>(() =>
    typeof window === "undefined" ? null : loadDraft<DraftShape>(DRAFT_KEY),
  );
  const [kind, setKind] = useState<ComposerKind>(draft?.kind ?? "photo");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [caption, setCaption] = useState(draft?.caption ?? "");
  const [happenedOn, setHappenedOn] = useState(draft?.happenedOn || today());
  const [location, setLocation] = useState(draft?.location ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Persist the draft continuously while composing.
  useEffect(() => {
    if (!open) return;
    saveDraft(DRAFT_KEY, { kind, title, caption, happenedOn, location } satisfies DraftShape);
  }, [open, kind, title, caption, happenedOn, location]);

  // Object URLs are tracked in a ref so they can be revoked on unmount.
  const previewRef = useRef<string | null>(null);
  const pickFile = (f: File | null) => {
    setFile(f);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setPreviewUrl(previewRef.current);
  };
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const needsFile = kind === "photo" || kind === "video";

  const reset = () => {
    setKind("photo");
    setTitle("");
    setCaption("");
    setHappenedOn(today());
    setLocation("");
    pickFile(null);
  };

  const submit = async () => {
    if (needsFile && !file) {
      toast(kind === "photo" ? "Pick a photo first." : "Pick a video first.");
      return;
    }
    if (!needsFile && !title.trim() && !caption.trim()) {
      toast("Add a title or a few words first.");
      return;
    }
    setSaving(true);
    try {
      let mediaPath: string | null = null;
      let mediaMeta: Memory["media_meta"] = null;
      if (kind === "photo" && file) {
        const { blob, width, height } = await compressImage(file);
        const err = validateUpload(blob, "image");
        if (err) {
          toast(err);
          return;
        }
        mediaPath = await uploadMedia("memories", me, blob);
        mediaMeta = { width, height, mime: blob.type };
      } else if (kind === "video" && file) {
        const err = validateUpload(file, "video");
        if (err) {
          toast(err);
          return;
        }
        mediaPath = await uploadMedia("memories", me, file);
        mediaMeta = { mime: file.type };
      }
      const { data, error } = await supabase()
        .from("memories")
        .insert({
          kind,
          title: title.trim() || null,
          caption: caption.trim() || null,
          media_path: mediaPath,
          media_meta: mediaMeta,
          happened_on: happenedOn || null,
          location: location.trim() || null,
          created_by: me,
        })
        .select()
        .single();
      if (error || !data) {
        toast("Could not save that memory.");
        return;
      }
      const saved = data as Memory;
      void notifyPartner(kind === "milestone" ? "milestones" : "plans", saved.id, {
        body: "A new memory was added",
        url: "/memories",
      });
      clearDraft(DRAFT_KEY);
      toast("Memory added");
      onSaved(saved);
      reset();
      onClose();
    } catch {
      toast("Could not save that memory.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New memory">
      <div className="space-y-4 pt-2">
        <div>
          <Label>What kind of memory?</Label>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setKind(opt.value)}
                aria-pressed={kind === opt.value}
                className={`pressable flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold ${
                  kind === opt.value
                    ? "border-rose-dark bg-rose-dark text-white"
                    : "border-line bg-white text-berry-soft"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {needsFile && (
          <div>
            <Label htmlFor="memory-file">{kind === "photo" ? "Photo" : "Video"}</Label>
            <input
              id="memory-file"
              type="file"
              accept={kind === "photo" ? "image/*" : "video/*"}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-berry file:mr-3 file:rounded-full file:border-0 file:bg-blush file:px-4 file:py-2 file:text-sm file:font-semibold file:text-berry"
            />
            {previewUrl && kind === "photo" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview"
                className="mt-2 max-h-48 w-full rounded-xl border border-line object-cover"
              />
            )}
            {previewUrl && kind === "video" && (
              <video src={previewUrl} controls className="mt-2 max-h-48 w-full rounded-xl border border-line" />
            )}
          </div>
        )}

        <div>
          <Label htmlFor="memory-title">Title</Label>
          <Input
            id="memory-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "milestone" ? "Our first trip together" : "Give it a name"}
            maxLength={120}
          />
        </div>

        <div>
          <Label htmlFor="memory-caption">{kind === "note" ? "Your note" : "Caption"}</Label>
          <Textarea
            id="memory-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What made this moment special?"
            maxLength={4000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="memory-date">When</Label>
            <Input
              id="memory-date"
              type="date"
              value={happenedOn}
              onChange={(e) => setHappenedOn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="memory-location">Where</Label>
            <Input
              id="memory-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
              maxLength={120}
            />
          </div>
        </div>

        <Button className="w-full" size="lg" loading={saving} onClick={() => void submit()}>
          {!saving && <HeartIcon className="h-4 w-4" />}
          Save memory
        </Button>
      </div>
    </Sheet>
  );
}
