"use client";

// "Your questions": write questions for the shared rotation, group them into
// private packs, and manage the ones you wrote. Works offline.

import { useMemo, useState } from "react";
import { FolderPlus, Plus, Trash2 } from "lucide-react";
import { useWho } from "@/lib/couple-context";
import {
  categoryLabel, createPack, createQuestion, deleteQuestion,
  type QuestionPack,
} from "@/lib/questions";
import {
  Button, Card, ConfirmDialog, IconButton, Input, Label, Select, Sheet, Textarea, useToast,
} from "@/components/ui";
import type { Question, QuestionKind } from "@/lib/types";

const KIND_LABELS: Record<QuestionKind, string> = {
  open: "Open answer",
  this_or_that: "This or that",
  guess_mine: "Guess mine",
};

const BASE_CATEGORIES = [
  "romantic", "funny", "serious", "future", "memories",
  "preferences", "personal_growth", "relationship", "random",
];

export function CustomQuestions({
  categories,
  mine,
  packs,
  onChanged,
}: {
  categories: string[];
  mine: Question[];
  packs: QuestionPack[];
  onChanged: () => void;
}) {
  const { me } = useWho();
  const toast = useToast();

  const categoryOptions = useMemo(
    () => Array.from(new Set([...BASE_CATEGORIES, ...categories])).sort(),
    [categories],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [packSheetOpen, setPackSheetOpen] = useState(false);
  const [category, setCategory] = useState(categoryOptions[0] ?? "random");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<QuestionKind>("open");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [packId, setPackId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Question | null>(null);

  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");

  const valid =
    prompt.trim().length > 0 &&
    (kind !== "this_or_that" || (optionA.trim().length > 0 && optionB.trim().length > 0));

  const reset = () => {
    setPrompt("");
    setOptionA("");
    setOptionB("");
    setKind("open");
    setPackId("");
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createQuestion(me, {
        category,
        prompt: prompt.trim(),
        kind,
        option_a: kind === "this_or_that" ? optionA.trim() : null,
        option_b: kind === "this_or_that" ? optionB.trim() : null,
        pack_id: packId || null,
      });
      toast("Added to the rotation");
      setSheetOpen(false);
      reset();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const savePack = async () => {
    if (!packName.trim() || saving) return;
    setSaving(true);
    try {
      await createPack(me, packName.trim(), packDescription.trim() || null);
      toast("Pack created");
      setPackSheetOpen(false);
      setPackName("");
      setPackDescription("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (question: Question) => {
    await deleteQuestion(me, question.id);
    setToDelete(null);
    toast("Removed");
    onChanged();
  };

  const byPack = useMemo(() => {
    const groups = new Map<string, Question[]>();
    for (const question of mine) {
      const key = "loose";
      const list = groups.get(key) ?? [];
      list.push(question);
      groups.set(key, list);
    }
    return groups;
  }, [mine]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-plum">Your questions</h2>
        <div className="flex gap-1">
          <IconButton label="New pack" onClick={() => setPackSheetOpen(true)}>
            <FolderPlus className="h-5 w-5" />
          </IconButton>
          <IconButton label="Write a question" onClick={() => setSheetOpen(true)}>
            <Plus className="h-5 w-5" />
          </IconButton>
        </div>
      </div>

      <p className="text-sm text-berry-soft">
        Anything you write here joins the pool the daily question is picked from.
        Both of you will see it eventually.
      </p>

      {packs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {packs.map((pack) => (
            <span
              key={pack.id}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-berry"
              title={pack.description ?? undefined}
            >
              {pack.name}
            </span>
          ))}
        </div>
      )}

      {mine.length === 0 ? (
        <Card className="text-sm text-berry-soft">
          You have not written any yet. The best ones are usually the ones you are
          slightly nervous to ask.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {(byPack.get("loose") ?? []).map((question) => (
            <li
              key={question.id}
              className="flex items-start gap-2 rounded-card border border-line bg-white p-3.5 shadow-soft"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-berry-soft">
                  {categoryLabel(question.category)} · {KIND_LABELS[question.kind]}
                </p>
                <p className="mt-0.5 font-semibold text-berry">{question.prompt}</p>
                {question.kind === "this_or_that" && (
                  <p className="mt-0.5 text-xs text-berry-soft">
                    {question.option_a} or {question.option_b}
                  </p>
                )}
              </div>
              <IconButton
                label="Remove this question"
                onClick={() => setToDelete(question)}
                className="h-9 w-9"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Write a question">
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <Label htmlFor="q-prompt">The question</Label>
            <Textarea
              id="q-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask them something you actually want to know"
              maxLength={300}
            />
          </div>

          <div>
            <Label htmlFor="q-category">Category</Label>
            <Select id="q-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {categoryLabel(option)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="q-kind">Kind</Label>
            <Select
              id="q-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as QuestionKind)}
            >
              {(Object.keys(KIND_LABELS) as QuestionKind[]).map((option) => (
                <option key={option} value={option}>
                  {KIND_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          {kind === "this_or_that" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="q-a">First option</Label>
                <Input id="q-a" value={optionA} onChange={(e) => setOptionA(e.target.value)} maxLength={60} />
              </div>
              <div>
                <Label htmlFor="q-b">Second option</Label>
                <Input id="q-b" value={optionB} onChange={(e) => setOptionB(e.target.value)} maxLength={60} />
              </div>
            </div>
          )}

          {packs.length > 0 && (
            <div>
              <Label htmlFor="q-pack">Pack</Label>
              <Select id="q-pack" value={packId} onChange={(e) => setPackId(e.target.value)}>
                <option value="">No pack</option>
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <Button onClick={() => void save()} disabled={!valid} loading={saving}>
            Add to the rotation
          </Button>
        </div>
      </Sheet>

      <Sheet open={packSheetOpen} onClose={() => setPackSheetOpen(false)} title="New question pack">
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-sm text-berry-soft">
            A pack is a set of questions you write for a particular thing: a trip, a
            hard week, an anniversary.
          </p>
          <div>
            <Label htmlFor="pack-name">Name</Label>
            <Input
              id="pack-name"
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="Road trip questions"
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="pack-desc">Description</Label>
            <Textarea
              id="pack-desc"
              value={packDescription}
              onChange={(e) => setPackDescription(e.target.value)}
              placeholder="What is this pack for?"
              maxLength={200}
            />
          </div>
          <Button onClick={() => void savePack()} disabled={!packName.trim()} loading={saving}>
            Create pack
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Remove this question?"
        message="It will not be asked again. Answers you have already given stay in your history."
        confirmLabel="Remove"
        destructive
        onConfirm={() => toDelete && void remove(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
