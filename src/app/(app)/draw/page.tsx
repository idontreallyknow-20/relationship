"use client";

// Draw together. Without ?id this shows recent shared drawings and a
// start-fresh CTA; with ?id=<uuid> it opens that drawing for live editing.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Brush } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { Drawing } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { loadDraft, clearDraft } from "@/lib/drafts";
import { Button, Card, EmptyState, TopBar } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { DrawEditor, type DrawDraft } from "@/components/draw/editor";
import { DrawingThumb, StrokeThumb } from "@/components/draw/thumb";

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Draw" />
          <HeartSpinner />
        </>
      }
    >
      <DrawRouter />
    </Suspense>
  );
}

function DrawRouter() {
  const router = useRouter();
  const search = useSearchParams();
  const urlId = search.get("id");

  // A drawing started from the landing page keeps a client-generated id
  // until its row exists and the URL catches up via replaceState.
  const [freshId, setFreshId] = useState<string | null>(null);
  const activeId = urlId ?? freshId;

  const exit = useCallback(() => {
    setFreshId(null);
    router.push("/draw");
  }, [router]);

  if (activeId) {
    return (
      <DrawEditor
        key={activeId}
        id={activeId}
        isNew={activeId === freshId}
        onExit={exit}
      />
    );
  }
  return (
    <Landing
      onStart={() => setFreshId(crypto.randomUUID())}
      onOpen={(id) => router.push(`/draw?id=${id}`)}
    />
  );
}

/* ------------------------------ landing ----------------------------- */

function Landing({
  onStart,
  onOpen,
}: {
  onStart: () => void;
  onOpen: (id: string) => void;
}) {
  const [drawings, setDrawings] = useState<Drawing[] | null>(null);
  const [error, setError] = useState(false);
  const [resume, setResume] = useState<{ id: string; draft: DrawDraft } | null>(null);

  const load = useCallback(async () => {
    setError(false);
    setDrawings(null);
    const { data, error: err } = await supabase()
      .from("drawings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(24);
    if (err) {
      setError(true);
      return;
    }
    const rows = (data ?? []) as Drawing[];
    setDrawings(rows.filter((d) => d.is_shared));

    // Offer to continue an unsent drawing that still has a local draft.
    const last = loadDraft<{ id: string }>("draw:last");
    if (last?.id) {
      const row = rows.find((d) => d.id === last.id);
      const draft = loadDraft<DrawDraft>(`draw:${last.id}`);
      if ((row && row.is_shared) || !draft || draft.strokes.length === 0) {
        clearDraft("draw:last");
      } else {
        setResume({ id: last.id, draft });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <TopBar title="Draw" />
      <div className="flex flex-1 flex-col gap-5 px-4 pb-6 pt-4">
        {resume && (
          <Card className="flex items-center gap-4">
            <div className="w-20 shrink-0 overflow-hidden rounded-xl border border-line">
              <StrokeThumb
                strokes={resume.draft.strokes}
                background={resume.draft.background}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-plum">
                Continue where you left off
              </p>
              <p className="text-sm text-berry-soft">
                An unsent drawing is waiting for you.
              </p>
            </div>
            <Button size="sm" onClick={() => onOpen(resume.id)}>
              Continue
            </Button>
          </Card>
        )}

        {drawings === null && !error && <HeartSpinner label="Loading drawings" />}

        {error && (
          <EmptyState
            title="Could not load drawings"
            hint="Check your connection and try again."
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        )}

        {drawings !== null && drawings.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-semibold text-plum">
              Our drawings
            </h2>
            <p className="text-sm text-berry-soft">Tap one to keep drawing on it.</p>
            <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
              {drawings.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onOpen(d.id)}
                  className="pressable w-28 shrink-0 text-left"
                  aria-label={d.caption ? `Open drawing: ${d.caption}` : "Open drawing"}
                >
                  <span className="block overflow-hidden rounded-card border border-line bg-white shadow-soft">
                    <DrawingThumb drawing={d} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-berry-soft">
                    {d.caption ?? formatRelative(d.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {drawings !== null && drawings.length === 0 && (
          <EmptyState
            icon={<Brush className="h-8 w-8" />}
            title="No drawings yet"
            hint="Doodle something sweet and send it in chat, or keep it as a memory."
          />
        )}

        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <HeartIcon className="h-7 w-7 text-blush-deep" />
          <div>
            <p className="font-display text-2xl font-semibold text-plum">
              Start a new drawing
            </p>
            <p className="mt-1 text-sm text-berry-soft">
              Draw live together when you are both here.
            </p>
          </div>
          <Button size="lg" onClick={onStart}>
            <Plus className="h-5 w-5" />
            Start fresh
          </Button>
        </Card>
      </div>
    </>
  );
}
