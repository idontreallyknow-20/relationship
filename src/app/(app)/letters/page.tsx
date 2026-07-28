"use client";

// Letters: instant notes, scheduled letters, sealed open-when envelopes,
// compliments and appreciation, plus the shared gratitude jar.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readCache, settled, writeCache } from "@/lib/offline/cache";
import { queueDelete, queueInsert } from "@/lib/offline/ops";
import { useCouple, useWho } from "@/lib/couple-context";
import {
  Card, ConfirmDialog, EmptyState, IconButton, SegmentedControl, TopBar, useToast,
} from "@/components/ui";
import { HeartDivider, HeartSpinner } from "@/components/hearts";
import { formatRelative, formatShortDate, formatTime } from "@/lib/format";
import type { Gratitude, Letter, Person } from "@/lib/types";
import { displayName } from "@/lib/types";
import { ComposeLetter } from "@/components/letters/compose";
import { InboxLetterCard, KIND_CHIP } from "@/components/letters/letter-card";
import { GratitudeJar } from "@/components/letters/gratitude-jar";

type Tab = "inbox" | "sent" | "write";

function sentStatus(letter: Letter): string {
  if (letter.opened_at) return `Opened ${formatRelative(letter.opened_at)}`;
  if (letter.kind === "scheduled" && letter.unlock_at) {
    const unlock = new Date(letter.unlock_at);
    if (unlock.getTime() > Date.now()) {
      return `Scheduled for ${formatShortDate(unlock)} ${formatTime(unlock)}`;
    }
  }
  return "Sealed until opened";
}

const CACHE_KEY = "letters:page";

interface CachedLetters {
  letters: Letter[];
  gratitude: Gratitude[];
  gratitudeCount: number;
}

function LettersScreen() {
  const { me: meProfile, partner: partnerProfile } = useCouple();
  const { me, partner } = useWho();
  const toast = useToast();
  const params = useSearchParams();

  const [tab, setTab] = useState<Tab>(params.get("new") === "1" ? "write" : "inbox");
  const [letters, setLetters] = useState<Letter[]>([]);
  const [gratitude, setGratitude] = useState<Gratitude[]>([]);
  const [gratitudeCount, setGratitudeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<Letter | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [lettersRes, gratitudeRes] = await Promise.all([
      settled(sb.from("letters").select("*").order("created_at", { ascending: false })),
      settled(sb
        .from("gratitude")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(20)),
    ]);
    const cached = (await readCache<CachedLetters>(CACHE_KEY))?.data ?? null;
    if (lettersRes.error && gratitudeRes.error) {
      if (cached) {
        setLetters(cached.letters);
        setGratitude(cached.gratitude);
        setGratitudeCount(cached.gratitudeCount);
      }
      setLoading(false);
      return;
    }
    // A failed half keeps what it had. Writing an empty array over a good
    // cached copy meant a single timed-out request emptied the screen for
    // every future offline open.
    const nextLetters = (lettersRes.error ? cached?.letters ?? [] : (lettersRes.data ?? [])) as Letter[];
    const nextGratitude = (gratitudeRes.error ? cached?.gratitude ?? [] : (gratitudeRes.data ?? [])) as Gratitude[];
    const nextCount = gratitudeRes.error ? cached?.gratitudeCount ?? 0 : gratitudeRes.count ?? 0;
    setLetters(nextLetters);
    setGratitude(nextGratitude);
    setGratitudeCount(nextCount);
    if (!lettersRes.error && !gratitudeRes.error) {
      void writeCache<CachedLetters>(CACHE_KEY, {
        letters: nextLetters,
        gratitude: nextGratitude,
        gratitudeCount: nextCount,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const sb = supabase();
    const channel = sb
      .channel("letters-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "letters" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gratitude" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [load]);

  const inbox = useMemo(() => letters.filter((l) => l.author === partner), [letters, partner]);
  const sent = useMemo(() => letters.filter((l) => l.author === me), [letters, me]);

  const partnerName = partnerProfile?.display_name ?? displayName(partner);
  const nameOf = (person: Person) =>
    person === me ? meProfile.display_name : partnerName;

  const markOpened = async (id: string) => {
    const { error } = await supabase().rpc("mark_letter_opened", { letter: id });
    if (error) {
      toast("Could not open the letter, try again");
      return;
    }
    setLetters((prev) =>
      prev.map((l) => (l.id === id ? { ...l, opened_at: new Date().toISOString() } : l)),
    );
  };

  const deleteLetter = async () => {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(null);
    await queueDelete("letters", { id }, "Delete letter");
    setLetters((prev) => prev.filter((l) => l.id !== id));
    toast("Letter deleted");
  };

  const addGratitude = async (body: string): Promise<boolean> => {
    const row: Gratitude = {
      id: crypto.randomUUID(),
      person: me,
      body,
      created_at: new Date().toISOString(),
    };
    await queueInsert("gratitude", { ...row }, "Gratitude");
    setGratitude((prev) => [row, ...prev].slice(0, 20));
    setGratitudeCount((n) => n + 1);
    toast("Added to the jar");
    return true;
  };

  return (
    <>
      <TopBar title="Letters" />
      <main className="flex flex-col gap-4 px-4 py-4">
        <SegmentedControl<Tab>
          label="Letters section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "inbox", label: "Inbox" },
            { value: "sent", label: "Sent" },
            { value: "write", label: "Write" },
          ]}
        />

        {loading ? (
          <HeartSpinner />
        ) : tab === "write" ? (
          <ComposeLetter partnerName={partnerName} onSent={() => setTab("sent")} />
        ) : tab === "sent" ? (
          sent.length === 0 ? (
            <EmptyState
              title="Nothing sent yet"
              hint={`Write ${partnerName} something sweet, or schedule a surprise.`}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {sent.map((letter) => (
                <Card key={letter.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-rose-dark">
                      {KIND_CHIP[letter.kind]}
                    </span>
                    {letter.kind === "open_when" && letter.open_when_label && (
                      <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs font-semibold text-plum">
                        {letter.open_when_label}
                      </span>
                    )}
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-berry-soft">
                      {sentStatus(letter)}
                    </span>
                    {!letter.opened_at && (
                      <IconButton
                        label="Delete letter"
                        onClick={() => setToDelete(letter)}
                        className="-my-2 ml-auto"
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </IconButton>
                    )}
                  </div>
                  {letter.title && (
                    <p className="font-display text-xl font-semibold text-plum">{letter.title}</p>
                  )}
                  <p className="clamp-2 whitespace-pre-wrap text-sm text-berry">{letter.body}</p>
                  <p className="text-xs text-berry-soft">{formatRelative(letter.created_at)}</p>
                </Card>
              ))}
            </div>
          )
        ) : (
          <>
            {inbox.length === 0 ? (
              <EmptyState
                title="No letters yet"
                hint={`When ${partnerName} writes to you, letters will land here.`}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {inbox.map((letter) => (
                  <InboxLetterCard
                    key={letter.id}
                    letter={letter}
                    authorName={partnerName}
                    onMarkOpened={markOpened}
                  />
                ))}
              </div>
            )}

            <HeartDivider />

            <GratitudeJar
              notes={gratitude}
              count={gratitudeCount}
              me={me}
              nameOf={nameOf}
              onAdd={addGratitude}
            />
          </>
        )}
      </main>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this letter?"
        message={`${partnerName} has not opened it. It will be gone for good.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void deleteLetter()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Letters" />
          <HeartSpinner />
        </>
      }
    >
      <LettersScreen />
    </Suspense>
  );
}
