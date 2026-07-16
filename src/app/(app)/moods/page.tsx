"use client";

// Moods: emotional check-ins for both of us. Current state up top, gentle
// responses to the partner's mood, and a soft history underneath.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCouple, useWho } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { Button, EmptyState, TopBar, useToast } from "@/components/ui";
import { HeartDivider, HeartIcon, HeartSpinner } from "@/components/hearts";
import type { MoodEntry, Signal } from "@/lib/types";
import { MoodComposer } from "@/components/moods/composer";
import { CurrentMoodCard } from "@/components/moods/current-mood";
import { MoodHistory } from "@/components/moods/history";

const HISTORY_DAYS = 31;
const SIGNAL_WINDOW_HOURS = 48;

function isActive(entry: MoodEntry): boolean {
  if (entry.cleared_at) return false;
  if (entry.expires_at && new Date(entry.expires_at).getTime() <= Date.now()) return false;
  return true;
}

function MoodsScreen() {
  const { me: meProfile, partner: partnerProfile } = useCouple();
  const { me, partner } = useWho();
  const toast = useToast();
  const params = useSearchParams();

  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(params.get("new") === "1");

  const load = useCallback(async () => {
    const sb = supabase();
    const since = new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString();
    const signalsSince = new Date(
      Date.now() - SIGNAL_WINDOW_HOURS * 3600_000,
    ).toISOString();
    const [moodsRes, signalsRes] = await Promise.all([
      sb
        .from("moods")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
      sb
        .from("signals")
        .select("*")
        .in("kind", ["send_support", "give_space"])
        .gte("created_at", signalsSince)
        .order("created_at", { ascending: false }),
    ]);
    if (!moodsRes.error) setEntries((moodsRes.data ?? []) as MoodEntry[]);
    if (!signalsRes.error) setSignals((signalsRes.data ?? []) as Signal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const sb = supabase();
    const channel = sb
      .channel("moods-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "moods" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [load]);

  const myCurrent = entries.find((e) => e.person === me && isActive(e)) ?? null;
  const partnerCurrent =
    entries.find((e) => e.person === partner && e.visible && isActive(e)) ?? null;

  // Support and space the partner sent me recently, not yet acknowledged.
  const incoming = signals.filter((s) => s.from_person === partner && !s.acknowledged_at);

  const clearMood = async () => {
    if (!myCurrent) return;
    const id = myCurrent.id;
    const clearedAt = new Date().toISOString();
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, cleared_at: clearedAt } : e)));
    const { error } = await supabase().from("moods").update({ cleared_at: clearedAt }).eq("id", id);
    if (error) {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, cleared_at: null } : e)));
      toast("Could not clear your mood");
      return;
    }
    toast("Mood cleared", () => {
      void supabase()
        .from("moods")
        .update({ cleared_at: null })
        .eq("id", id)
        .then(() => void load());
    });
  };

  const respond = async (kind: "send_support" | "give_space") => {
    const { data, error } = await supabase()
      .from("signals")
      .insert({ from_person: me, kind })
      .select("id")
      .single();
    if (error || !data) {
      toast("Could not send that, try again");
      return;
    }
    void notifyPartner("moods", (data as { id: string }).id, { url: "/moods" });
    toast(kind === "send_support" ? "Support sent" : "Space given, gently");
  };

  const dismissSignal = async (signal: Signal) => {
    const ackAt = new Date().toISOString();
    setSignals((prev) =>
      prev.map((s) => (s.id === signal.id ? { ...s, acknowledged_at: ackAt } : s)),
    );
    await supabase().from("signals").update({ acknowledged_at: ackAt }).eq("id", signal.id);
  };

  const partnerName = partnerProfile?.display_name ?? "your partner";
  const myName = meProfile.display_name;

  return (
    <>
      <TopBar title="Moods" />
      <main className="flex flex-col gap-4 px-4 py-4">
        {incoming.map((signal) => (
          <button
            key={signal.id}
            onClick={() => void dismissSignal(signal)}
            className="pressable flex min-h-11 items-center gap-3 rounded-card border border-line bg-lavender px-4 py-3 text-left"
          >
            <HeartIcon className="h-5 w-5 shrink-0 text-rose-deep" />
            <span className="flex-1 text-sm text-berry">
              {signal.kind === "send_support"
                ? `${partnerName} sent you some support.`
                : `${partnerName} is giving you a little space, with love.`}
            </span>
            <span className="text-xs font-semibold text-berry-soft">Got it</span>
          </button>
        ))}

        <Button size="lg" onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4" />
          Share how you feel
        </Button>

        {loading ? (
          <HeartSpinner />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3">
              <CurrentMoodCard
                title={myName}
                entry={myCurrent}
                mine
                emptyHint="No mood shared right now."
                onUpdate={() => setComposerOpen(true)}
                onClear={() => void clearMood()}
              />
              <CurrentMoodCard
                title={partnerName}
                entry={partnerCurrent}
                mine={false}
                emptyHint={
                  partnerProfile
                    ? `${partnerName} has not shared a mood right now.`
                    : "Waiting for your partner to join."
                }
                onSupport={() => void respond("send_support")}
                onSpace={() => void respond("give_space")}
              />
            </section>

            <HeartDivider />

            {entries.length === 0 ? (
              <EmptyState
                title="No check-ins yet"
                hint="Share how you feel and it will live here for both of you."
                action={
                  <Button size="sm" variant="secondary" onClick={() => setComposerOpen(true)}>
                    Check in now
                  </Button>
                }
              />
            ) : (
              <MoodHistory entries={entries} me={me} />
            )}
          </>
        )}
      </main>

      <MoodComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSaved={() => void load()}
      />
    </>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title="Moods" />
          <HeartSpinner />
        </>
      }
    >
      <MoodsScreen />
    </Suspense>
  );
}
