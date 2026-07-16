"use client";

// "Your questions": write questions for the shared rotation pool, and manage
// the ones you wrote.

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWho } from "@/lib/couple-context";
import {
  Button, Card, ConfirmDialog, IconButton, Input, Label, Select, Sheet, Textarea, useToast,
} from "@/components/ui";
import type { Question, QuestionKind } from "@/lib/types";

const KIND_LABELS: Record<QuestionKind, string> = {
  open: "Open answer",
  this_or_that: "This or that",
  guess_mine: "Guess mine",
};

export function CustomQuestions({
  categories,
  mine,
  onChanged,
}: {
  categories: string[];
  mine: Question[];
  onChanged: () => Promise<void> | void;
}) {
  const { me } = useWho();
  const toast = useToast();

  const categoryOptions = categories.length > 0 ? categories : ["ours"];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [category, setCategory] = useState(categoryOptions[0]);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"open" | "this_or_that">("open");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Question | null>(null);

  const openComposer = (question: Question | null) => {
    setEditing(question);
    setCategory(question?.category ?? categoryOptions[0]);
    setPrompt(question?.prompt ?? "");
    setKind(question?.kind === "this_or_that" ? "this_or_that" : "open");
    setOptionA(question?.option_a ?? "");
    setOptionB(question?.option_b ?? "");
    setSheetOpen(true);
  };

  const valid =
    prompt.trim().length > 0 &&
    (kind !== "this_or_that" || (optionA.trim().length > 0 && optionB.trim().length > 0));

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const row = {
      category,
      prompt: prompt.trim(),
      kind,
      option_a: kind === "this_or_that" ? optionA.trim() : null,
      option_b: kind === "this_or_that" ? optionB.trim() : null,
    };
    const sb = supabase();
    const { error } = editing
      ? await sb.from("questions").update(row).eq("id", editing.id)
      : await sb.from("questions").insert({ ...row, created_by: me });
    setSaving(false);
    if (error) {
      toast("Could not save the question");
      return;
    }
    toast(editing ? "Question updated" : "Added to the question pool");
    setSheetOpen(false);
    await onChanged();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase().from("questions").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) {
      toast("Could not delete, it may already be in use");
      return;
    }
    toast("Question deleted");
    await onChanged();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-semibold text-plum">Your questions</h2>
        <Button size="sm" variant="secondary" onClick={() => openComposer(null)}>
          <Plus className="h-4 w-4" />
          Write one
        </Button>
      </div>
      <p className="-mt-2 text-sm text-berry-soft">
        Questions you write join the daily rotation automatically.
      </p>

      {mine.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-white/60 px-4 py-5 text-center text-sm text-berry-soft">
          Nothing yet. Write a question you wish someone would ask you.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {mine.map((q) => (
            <Card key={q.id} className="flex items-start gap-2 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-berry-soft">
                  {q.category} <span className="text-line">|</span> {KIND_LABELS[q.kind]}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-berry">{q.prompt}</p>
                {q.kind === "this_or_that" && (
                  <p className="mt-0.5 text-xs text-berry-soft">
                    {q.option_a} or {q.option_b}
                  </p>
                )}
              </div>
              <IconButton label="Edit question" onClick={() => openComposer(q)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Delete question" onClick={() => setToDelete(q)}>
                <Trash2 className="h-4 w-4 text-danger" />
              </IconButton>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Edit question" : "Write a question"}
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <Label htmlFor="custom-q-category">Category</Label>
            <Select
              id="custom-q-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="custom-q-prompt">Question</Label>
            <Textarea
              id="custom-q-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Something you want to ask each other"
              maxLength={300}
            />
          </div>
          <div>
            <Label htmlFor="custom-q-kind">Kind</Label>
            <Select
              id="custom-q-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "open" | "this_or_that")}
            >
              <option value="open">Open answer</option>
              <option value="this_or_that">This or that</option>
            </Select>
          </div>
          {kind === "this_or_that" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="custom-q-a">Option A</Label>
                <Input
                  id="custom-q-a"
                  value={optionA}
                  onChange={(e) => setOptionA(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="custom-q-b">Option B</Label>
                <Input
                  id="custom-q-b"
                  value={optionB}
                  onChange={(e) => setOptionB(e.target.value)}
                  maxLength={60}
                />
              </div>
            </div>
          )}
          <Button onClick={() => void save()} disabled={!valid} loading={saving}>
            {editing ? "Save changes" : "Add question"}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this question?"
        message="It will leave the rotation pool. Days it already appeared on are kept."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
