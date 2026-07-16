"use client";

// Bucket list, date ideas, and to-dos. Bucket and date ideas share one
// component; to-dos are a simpler checklist.

import { useMemo, useState } from "react";
import {
  Check, ChevronDown, ChevronUp, CalendarPlus, PencilLine, Plus, Trash2,
} from "lucide-react";
import {
  Button, ConfirmDialog, EmptyState, IconButton, Input, Label, Sheet, Textarea,
} from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import type { ListItem, ListStatus, Person } from "@/lib/types";

export interface ListVote {
  item_id: string;
  person: Person;
}

const STATUS_LABELS: Record<ListStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  completed: "Completed",
};

const STATUS_STYLES: Record<ListStatus, string> = {
  idea: "bg-lavender text-lavender-deep",
  planned: "bg-blush text-rose-dark",
  completed: "bg-blush-deep text-plum",
};

export function ListTab({
  category,
  items,
  votes,
  me,
  onAdd,
  onSetStatus,
  onSaveNotes,
  onToggleVote,
  onDelete,
  onPlanIt,
}: {
  category: "bucket" | "date_idea";
  items: ListItem[];
  votes: ListVote[];
  me: Person;
  onAdd: (title: string) => Promise<void>;
  onSetStatus: (item: ListItem, status: ListStatus) => void;
  onSaveNotes: (item: ListItem, notes: string) => Promise<void>;
  onToggleVote: (item: ListItem) => void;
  onDelete: (item: ListItem) => void;
  onPlanIt: (item: ListItem) => void;
}) {
  const isIdeas = category === "date_idea";
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [notesItem, setNotesItem] = useState<ListItem | null>(null);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ListItem | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = useMemo(() => items.filter((i) => i.status !== "completed"), [items]);
  const done = useMemo(() => items.filter((i) => i.status === "completed"), [items]);

  const submitAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await onAdd(title);
      setNewTitle("");
    } finally {
      setAdding(false);
    }
  };

  const votersOf = (item: ListItem) => votes.filter((v) => v.item_id === item.id).map((v) => v.person);

  const renderItem = (item: ListItem) => {
    const voters = votersOf(item);
    const bothWant = isIdeas && voters.length === 2;
    return (
      <div key={item.id} className="rounded-card border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={`font-semibold text-berry ${
                item.status === "completed" ? "text-berry-soft line-through" : ""
              }`}
            >
              {item.title}
            </p>
            {item.notes && <p className="clamp-2 mt-0.5 text-sm text-berry-soft">{item.notes}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setStatusMenuId(statusMenuId === item.id ? null : item.id)}
                  className={`pressable min-h-9 rounded-full px-3 text-xs font-semibold ${STATUS_STYLES[item.status]}`}
                  aria-haspopup="menu"
                  aria-expanded={statusMenuId === item.id}
                >
                  {STATUS_LABELS[item.status]}
                </button>
                {statusMenuId === item.id && (
                  <>
                    <button
                      aria-label="Close menu"
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setStatusMenuId(null)}
                    />
                    <div
                      role="menu"
                      className="absolute left-0 top-10 z-40 w-40 rounded-card border border-line bg-white p-1.5 shadow-lift"
                    >
                      {(Object.keys(STATUS_LABELS) as ListStatus[]).map((s) => (
                        <button
                          key={s}
                          role="menuitem"
                          className="pressable flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-berry hover:bg-blush/60"
                          onClick={() => {
                            setStatusMenuId(null);
                            if (s !== item.status) onSetStatus(item, s);
                          }}
                        >
                          {s === item.status && <Check className="h-4 w-4 text-rose-dark" />}
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {bothWant && (
                <span className="flex items-center gap-1 rounded-full bg-blush px-2.5 py-1 text-xs font-semibold text-rose-dark">
                  <HeartIcon className="h-3 w-3" />
                  Both want this
                </span>
              )}
            </div>
          </div>

          {isIdeas && (
            <button
              onClick={() => onToggleVote(item)}
              aria-label={voters.includes(me) ? "Remove your vote" : "Vote for this idea"}
              aria-pressed={voters.includes(me)}
              className="pressable flex min-h-11 min-w-11 items-center justify-end gap-0.5 px-1"
            >
              {voters.length === 0 ? (
                <HeartIcon className="h-5 w-5 text-berry-soft" filled={false} />
              ) : (
                voters.map((p) => <HeartIcon key={p} className="h-4 w-4 text-rose-dark" />)
              )}
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1 border-t border-line-soft pt-2">
          <IconButton
            label="Edit notes"
            onClick={() => {
              setNotesItem(item);
              setNotesText(item.notes ?? "");
            }}
          >
            <PencilLine className="h-4 w-4" />
          </IconButton>
          {isIdeas && item.status !== "completed" && (
            <button
              onClick={() => onPlanIt(item)}
              className="pressable flex min-h-9 items-center gap-1.5 rounded-full bg-blush px-3.5 text-xs font-semibold text-berry"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Plan it
            </button>
          )}
          <span className="flex-1" />
          <IconButton label="Delete" onClick={() => setDeleteItem(item)}>
            <Trash2 className="h-4 w-4 text-danger" />
          </IconButton>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitAdd();
          }}
          placeholder={isIdeas ? "A date you would love" : "Something to do together"}
          aria-label={isIdeas ? "New date idea" : "New bucket list item"}
        />
        <IconButton
          label="Add"
          className="shrink-0 bg-rose-dark text-white hover:bg-rose-deep"
          disabled={adding || !newTitle.trim()}
          onClick={() => void submitAdd()}
        >
          <Plus className="h-5 w-5" />
        </IconButton>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={isIdeas ? "No date ideas yet" : "Your bucket list is empty"}
          hint={
            isIdeas
              ? "Add ideas for dates, vote with a heart, and plan the ones you both love."
              : "Dream a little. Add things you want to do together someday."
          }
        />
      ) : (
        <>
          {open.map(renderItem)}
          {done.length > 0 && (
            <div>
              <button
                className="pressable flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-berry-soft"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
              >
                {showDone ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Done ({done.length})
              </button>
              {showDone && <div className="space-y-3">{done.map(renderItem)}</div>}
            </div>
          )}
        </>
      )}

      <Sheet open={notesItem !== null} onClose={() => setNotesItem(null)} title="Notes">
        <div className="space-y-4 pt-2">
          <p className="font-semibold text-berry">{notesItem?.title}</p>
          <div>
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea
              id="item-notes"
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Details, links, wishes"
              maxLength={2000}
            />
          </div>
          <Button
            className="w-full"
            loading={savingNotes}
            onClick={() => {
              if (!notesItem) return;
              setSavingNotes(true);
              void onSaveNotes(notesItem, notesText).finally(() => {
                setSavingNotes(false);
                setNotesItem(null);
              });
            }}
          >
            Save notes
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleteItem !== null}
        title="Delete this item?"
        message="It will be removed for both of you."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => {
          if (deleteItem) onDelete(deleteItem);
          setDeleteItem(null);
        }}
      />
    </div>
  );
}

export function TodoTab({
  items,
  onAdd,
  onToggle,
  onDelete,
}: {
  items: ListItem[];
  onAdd: (title: string) => Promise<void>;
  onToggle: (item: ListItem) => void;
  onDelete: (item: ListItem) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ListItem | null>(null);

  const submitAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await onAdd(title);
      setNewTitle("");
    } finally {
      setAdding(false);
    }
  };

  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed")),
    [items],
  );

  return (
    <div className="space-y-3 pb-4">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitAdd();
          }}
          placeholder="Something to take care of"
          aria-label="New to-do"
        />
        <IconButton
          label="Add"
          className="shrink-0 bg-rose-dark text-white hover:bg-rose-deep"
          disabled={adding || !newTitle.trim()}
          onClick={() => void submitAdd()}
        >
          <Plus className="h-5 w-5" />
        </IconButton>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No to-dos"
          hint="A tiny shared checklist for the practical stuff."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-soft">
          <ul>
            {sorted.map((item) => {
              const doneItem = item.status === "completed";
              return (
                <li key={item.id} className="flex items-center gap-2 border-b border-line-soft px-3 last:border-b-0">
                  <button
                    onClick={() => onToggle(item)}
                    role="checkbox"
                    aria-checked={doneItem}
                    aria-label={item.title}
                    className={`pressable my-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      doneItem ? "border-rose-dark bg-rose-dark text-white" : "border-line bg-white"
                    }`}
                  >
                    {doneItem && <Check className="h-4 w-4" />}
                  </button>
                  <span
                    className={`min-w-0 flex-1 py-3 text-sm ${
                      doneItem ? "text-berry-soft line-through" : "text-berry"
                    }`}
                  >
                    {item.title}
                  </span>
                  <IconButton label="Delete to-do" onClick={() => setDeleteItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={deleteItem !== null}
        title="Delete this to-do?"
        message="It will be removed for both of you."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => {
          if (deleteItem) onDelete(deleteItem);
          setDeleteItem(null);
        }}
      />
    </div>
  );
}
