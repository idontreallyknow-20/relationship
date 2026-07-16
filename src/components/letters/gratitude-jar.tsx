"use client";

// The shared gratitude jar: tiny notes of thanks from both of us.

import { useState } from "react";
import { Card, Input, Button } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { formatRelative } from "@/lib/format";
import type { Gratitude, Person } from "@/lib/types";

export function GratitudeJar({
  notes,
  count,
  me,
  nameOf,
  onAdd,
}: {
  notes: Gratitude[];
  count: number;
  me: Person;
  nameOf: (person: Person) => string;
  onAdd: (body: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const body = text.trim();
    if (!body || adding) return;
    setAdding(true);
    const ok = await onAdd(body);
    setAdding(false);
    if (ok) setText("");
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-xl font-semibold text-plum">Gratitude jar</h2>
        <span className="text-xs font-semibold text-berry-soft">
          {count} {count === 1 ? "note" : "notes"}
        </span>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="Add a little gratitude"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a little gratitude"
          maxLength={280}
        />
        <Button type="submit" disabled={!text.trim()} loading={adding}>
          Add
        </Button>
      </form>

      {notes.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-white/60 px-4 py-5 text-center text-sm text-berry-soft">
          The jar is empty. Drop in one small thing you are thankful for.
        </p>
      ) : (
        <Card className="flex flex-col gap-3">
          {notes.map((note) => (
            <div key={note.id} className="flex items-start gap-2.5">
              <HeartIcon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  note.person === me ? "text-rose" : "text-rose-deep"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-berry">{note.body}</p>
                <p className="text-xs text-berry-soft">
                  {nameOf(note.person)}, {formatRelative(note.created_at)}
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
