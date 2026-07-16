"use client";

// Bottom-sheet composer for creating and editing calendar events.

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import {
  Button, ConfirmDialog, Input, Label, Select, Sheet, Textarea, useToast,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { notifyPartner } from "@/lib/notify";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import type { CoupleEvent, EventKind, Person, Recurrence } from "@/lib/types";

const KIND_OPTIONS: { value: EventKind; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "call", label: "Call" },
  { value: "anniversary", label: "Anniversary" },
  { value: "birthday", label: "Birthday" },
  { value: "trip", label: "Trip" },
  { value: "reminder", label: "Reminder" },
  { value: "custom", label: "Something else" },
];

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No reminder" },
  { value: "0", label: "At the time" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

const DRAFT_KEY = "event-composer";

interface DraftShape {
  title: string;
  kind: EventKind;
  date: string;
  time: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
  recurrence: Recurrence;
  reminder: string;
}

export function EventComposer({
  open,
  onClose,
  me,
  editing,
  prefillTitle,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  me: Person;
  /** Event being edited, or null when creating. */
  editing: CoupleEvent | null;
  /** Optional title prefill when planning a date idea. */
  prefillTitle?: string | null;
  onSaved: (event: CoupleEvent, isNew: boolean) => void;
  onDeleted?: (event: CoupleEvent) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EventKind>("date");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("19:00");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [reminder, setReminder] = useState("none");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Populate fields whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const starts = new Date(editing.starts_at);
      setTitle(editing.title);
      setKind(editing.kind);
      setDate(format(starts, "yyyy-MM-dd"));
      setTime(format(starts, "HH:mm"));
      setEndTime(editing.ends_at ? format(new Date(editing.ends_at), "HH:mm") : "");
      setAllDay(editing.all_day);
      setLocation(editing.location ?? "");
      setNotes(editing.notes ?? "");
      setRecurrence(editing.recurrence);
      setReminder(editing.remind_minutes === null ? "none" : String(editing.remind_minutes));
    } else {
      const draft = loadDraft<DraftShape>(DRAFT_KEY);
      if (draft && !prefillTitle) {
        setTitle(draft.title);
        setKind(draft.kind);
        setDate(draft.date || format(new Date(), "yyyy-MM-dd"));
        setTime(draft.time || "19:00");
        setEndTime(draft.endTime);
        setAllDay(draft.allDay);
        setLocation(draft.location);
        setNotes(draft.notes);
        setRecurrence(draft.recurrence);
        setReminder(draft.reminder);
      } else {
        setTitle(prefillTitle ?? "");
        setKind("date");
        setDate(format(new Date(), "yyyy-MM-dd"));
        setTime("19:00");
        setEndTime("");
        setAllDay(false);
        setLocation("");
        setNotes("");
        setRecurrence("none");
        setReminder("none");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, prefillTitle]);

  // Keep a draft for new events only.
  useEffect(() => {
    if (!open || editing) return;
    saveDraft(DRAFT_KEY, {
      title, kind, date, time, endTime, allDay, location, notes, recurrence, reminder,
    } satisfies DraftShape);
  }, [open, editing, title, kind, date, time, endTime, allDay, location, notes, recurrence, reminder]);

  const submit = async () => {
    if (!title.trim()) {
      toast("Give the event a title.");
      return;
    }
    if (!date) {
      toast("Pick a date.");
      return;
    }
    setSaving(true);
    try {
      const starts = new Date(`${date}T${allDay ? "00:00" : time || "00:00"}`);
      const ends = !allDay && endTime ? new Date(`${date}T${endTime}`) : null;
      const payload = {
        title: title.trim(),
        kind,
        starts_at: starts.toISOString(),
        ends_at: ends ? ends.toISOString() : null,
        all_day: allDay,
        location: location.trim() || null,
        notes: notes.trim() || null,
        recurrence,
        remind_minutes: reminder === "none" ? null : Number(reminder),
      };
      if (editing) {
        const { data, error } = await supabase()
          .from("events")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error || !data) {
          toast("Could not save the event.");
          return;
        }
        toast("Event updated");
        onSaved(data as CoupleEvent, false);
      } else {
        const { data, error } = await supabase()
          .from("events")
          .insert({ ...payload, created_by: me })
          .select()
          .single();
        if (error || !data) {
          toast("Could not save the event.");
          return;
        }
        const saved = data as CoupleEvent;
        void notifyPartner("events", saved.id, { body: saved.title, url: "/plans" });
        clearDraft(DRAFT_KEY);
        toast("Event added");
        onSaved(saved, true);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const { error } = await supabase().from("events").delete().eq("id", editing.id);
    if (error) {
      toast("Could not delete the event.");
      return;
    }
    toast("Event deleted");
    onDeleted?.(editing);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit event" : "New event"}>
      <div className="space-y-4 pt-2">
        <div>
          <Label htmlFor="event-title">Title</Label>
          <Input
            id="event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dinner at our place"
            maxLength={120}
          />
        </div>

        <div>
          <Label htmlFor="event-kind">Kind</Label>
          <Select id="event-kind" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="event-date">Date</Label>
          <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-berry">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-5 w-5 accent-[#8f4560]"
          />
          All day
        </label>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="event-time">Starts</Label>
              <Input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="event-end">Ends (optional)</Label>
              <Input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="event-location">Location</Label>
          <Input
            id="event-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
            maxLength={160}
          />
        </div>

        <div>
          <Label htmlFor="event-notes">Notes</Label>
          <Textarea
            id="event-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to remember"
            maxLength={2000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="event-recurrence">Repeats</Label>
            <Select
              id="event-recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="event-reminder">Reminder</Label>
            <Select id="event-reminder" value={reminder} onChange={(e) => setReminder(e.target.value)}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <Button className="w-full" size="lg" loading={saving} onClick={() => void submit()}>
          {editing ? "Save changes" : "Add event"}
        </Button>

        {editing && (
          <Button
            variant="ghost"
            className="w-full text-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete event
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this event?"
        message="It will be removed from both of your calendars."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
      />
    </Sheet>
  );
}
