"use client";

// The living home screen: greets the current person and surfaces whatever
// is most alive right now. Cards only render when they have something to
// say, so the screen never feels crowded.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Sparkle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCouple } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { formatRelative, formatTime, relationshipDays } from "@/lib/format";
import { todayIn } from "@/lib/day";
import { displayName, partnerOf } from "@/lib/types";
import type { DailyQuestion, Message, MoodEntry, Question, Signal } from "@/lib/types";
import { Button, Card, useToast } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { InstallGuide } from "@/components/install-guide";
import { LoveJar } from "@/components/love-jar";
import { isIos, isStandalone, pushAvailableNow, pushStatus } from "@/lib/push";

const MOOD_LABELS: Record<string, string> = {
  great: "Great", happy: "Happy", calm: "Calm", tired: "Tired",
  stressed: "Stressed", sad: "Sad", upset: "Upset",
  need_comfort: "Needs comfort", need_space: "Needs space", custom: "Custom",
};

const MOOD_COLORS: Record<string, string> = {
  great: "text-rose-dark", happy: "text-rose", calm: "text-lavender-deep",
  tired: "text-plum/60", stressed: "text-danger/70", sad: "text-lavender-deep/70",
  upset: "text-danger", need_comfort: "text-rose-deep", need_space: "text-plum",
  custom: "text-berry-soft",
};

interface HomeData {
  myMood: MoodEntry | null;
  partnerMood: MoodEntry | null;
  lastMessage: Message | null;
  unread: number;
  todayQuestion: (DailyQuestion & { question: Question | null; myAnswered: boolean; bothAnswered: boolean }) | null;
  mySharing: boolean;
  partnerSharing: boolean;
  recentSignals: Signal[];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { me, partner, couple } = useCouple();
  const toast = useToast();
  const [data, setData] = useState<HomeData | null>(null);
  const [sendingThought, setSendingThought] = useState(false);
  const partnerPerson = partnerOf(me.person);
  const partnerName = partner?.display_name ?? displayName(partnerPerson);

  const load = useCallback(async () => {
    const sb = supabase();
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    // The shared day, not this device's day: a partner in another timezone
    // must see the same daily question as the person at home.
    const localDate = todayIn(couple.timezone);

    const [moods, msgs, unreadRes, dq, locations, signals] =
      await Promise.all([
        sb.from("moods").select("*").is("cleared_at", null).order("created_at", { ascending: false }).limit(10),
        sb.from("messages").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(1),
        sb.from("messages").select("id", { count: "exact", head: true }).eq("sender", partnerPerson).is("read_at", null).is("deleted_at", null),
        sb.from("daily_questions").select("*, questions(*), answers(person)").eq("for_date", localDate).maybeSingle(),
        sb.from("locations").select("person, expires_at").gt("expires_at", now).order("shared_at", { ascending: false }).limit(10),
        sb.from("signals").select("*").eq("from_person", partnerPerson).is("acknowledged_at", null).gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(5),
      ]);

    const moodRows = (moods.data ?? []) as MoodEntry[];
    const activeMood = (rows: MoodEntry[], person: string, requireVisible: boolean) =>
      rows.find(
        (m) =>
          m.person === person &&
          (!requireVisible || m.visible) &&
          (!m.expires_at || new Date(m.expires_at) > new Date()),
      ) ?? null;

    const dqRow = dq.data as
      | (DailyQuestion & { questions: Question | null; answers: { person: string }[] })
      | null;

    setData({
      myMood: activeMood(moodRows, me.person, false),
      partnerMood: activeMood(moodRows, partnerPerson, true),
      lastMessage: (msgs.data?.[0] as Message | undefined) ?? null,
      unread: unreadRes.count ?? 0,
      todayQuestion: dqRow
        ? {
            ...dqRow,
            question: dqRow.questions,
            myAnswered: dqRow.answers.some((a) => a.person === me.person),
            bothAnswered: dqRow.answers.length >= 2,
          }
        : null,
      mySharing: (locations.data ?? []).some((l) => l.person === me.person),
      partnerSharing: (locations.data ?? []).some((l) => l.person === partnerPerson),
      recentSignals: (signals.data ?? []) as Signal[],
    });
  }, [me.person, partnerPerson, couple.timezone]);

  useEffect(() => {
    void load();
    const sb = supabase();
    const channel = sb
      .channel("home-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "moods" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => void load())
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [load]);

  const sendThinkingOfYou = async () => {
    if (sendingThought) return;
    setSendingThought(true);
    const { data: row, error } = await supabase()
      .from("signals")
      .insert({ from_person: me.person, kind: "thinking_of_you" })
      .select("id")
      .single();
    if (!error && row) {
      void notifyPartner("thinking_of_you", row.id, { url: "/home" });
      toast(`${partnerName} will know you are thinking of them`);
    } else {
      toast("Could not send right now. Try again.");
    }
    setSendingThought(false);
  };

  const acknowledgeAll = async () => {
    await supabase()
      .from("signals")
      .update({ acknowledged_at: new Date().toISOString() })
      .is("acknowledged_at", null);
    void load();
  };

  const needsSetupNudge = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (isIos() && !isStandalone()) || (pushAvailableNow() && pushStatus() === "default");
  }, []);
  const [showSetup, setShowSetup] = useState(false);

  if (!data) {
    return (
      <>
        <HomeHeader name={me.display_name} days={couple.start_date ? relationshipDays(couple.start_date) : null} />
        <HeartSpinner />
      </>
    );
  }

  const signalText: Record<string, string> = {
    thinking_of_you: "is thinking of you",
    check_in: "sent a gentle check-in. How are you doing?",
    made_it_home: "made it home safely",
    arrived: "arrived safely",
    send_support: "sent you support",
    give_space: "is giving you space, with love",
  };

  return (
    <>
      <HomeHeader name={me.display_name} days={couple.start_date ? relationshipDays(couple.start_date) : null} />

      <main className="flex flex-col gap-5 px-5 pb-8 pt-1">
        {data.recentSignals.length > 0 && (
          <Card className="border-blush-deep bg-blush/60">
            {data.recentSignals.map((s, i) => (
              <p key={s.id} className={`flex items-center gap-2.5 text-sm text-berry ${i > 0 ? "mt-2" : ""}`}>
                <HeartIcon className="h-4 w-4 shrink-0 text-rose-dark" />
                <span className="flex-1">
                  <span className="font-semibold">{partnerName}</span> {signalText[s.kind] ?? "sent a signal"}
                  <span className="ml-1 text-xs text-berry-soft">{formatRelative(s.created_at)}</span>
                </span>
              </p>
            ))}
            <button
              className="mt-3 text-xs font-semibold text-rose-dark underline"
              onClick={() => void acknowledgeAll()}
            >
              {data.recentSignals.length > 1 ? "Felt them all" : "Felt it"}
            </button>
          </Card>
        )}

        {/* Moods side by side */}
        <div className="grid grid-cols-2 gap-3.5">
          <Link href="/moods" className="pressable">
            <Card className="h-full">
              <p className="text-xs font-semibold uppercase tracking-wide text-berry-soft">You feel</p>
              {data.myMood ? (
                <p className={`mt-1 flex items-center gap-1.5 font-display text-xl font-semibold ${MOOD_COLORS[data.myMood.mood]}`}>
                  <HeartIcon className="h-4 w-4" />
                  {data.myMood.mood === "custom" ? data.myMood.custom_label : MOOD_LABELS[data.myMood.mood]}
                </p>
              ) : (
                <p className="mt-1 text-sm text-berry-soft">Tap to check in</p>
              )}
            </Card>
          </Link>
          <Link href="/moods" className="pressable">
            <Card className="h-full">
              <p className="text-xs font-semibold uppercase tracking-wide text-berry-soft">{partnerName} feels</p>
              {data.partnerMood ? (
                <p className={`mt-1 flex items-center gap-1.5 font-display text-xl font-semibold ${MOOD_COLORS[data.partnerMood.mood]}`}>
                  <HeartIcon className="h-4 w-4" />
                  {data.partnerMood.mood === "custom" ? data.partnerMood.custom_label : MOOD_LABELS[data.partnerMood.mood]}
                </p>
              ) : (
                <p className="mt-1 text-sm text-berry-soft">No mood shared yet</p>
              )}
            </Card>
          </Link>
        </div>

        {/* Love jar */}
        <LoveJar />

        <Button
          variant="secondary"
          size="sm"
          className="mx-auto"
          loading={sendingThought}
          onClick={sendThinkingOfYou}
        >
          <Sparkle className="h-4 w-4" />
          Thinking of you
        </Button>

        {/* Latest message */}
        <Link href="/chat" className="pressable">
          <Card className="flex items-center gap-3">
            <span className="relative">
              <MessageCircle className="h-6 w-6 text-rose-dark" />
              {data.unread > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-dark px-1 text-[0.6rem] font-bold text-white">
                  {data.unread > 9 ? "9+" : data.unread}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              {data.lastMessage ? (
                <>
                  <span className="block text-xs text-berry-soft">
                    {data.lastMessage.sender === me.person ? "You" : partnerName}, {formatTime(data.lastMessage.created_at)}
                  </span>
                  <span className="clamp-2 block text-sm text-berry">
                    {data.lastMessage.deleted_at
                      ? "Message removed"
                      : data.lastMessage.kind === "text"
                        ? data.lastMessage.body
                        : data.lastMessage.kind === "image"
                          ? "Sent a photo"
                          : data.lastMessage.kind === "video"
                            ? "Sent a video"
                            : data.lastMessage.kind === "audio"
                              ? "Sent a voice note"
                              : "Sent a drawing"}
                  </span>
                </>
              ) : (
                <span className="text-sm text-berry-soft">No messages yet. Send the first one.</span>
              )}
            </span>
          </Card>
        </Link>

        {/* Today's question */}
        <Link href="/questions" className="pressable">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-berry-soft">Today&apos;s question</p>
            {data.todayQuestion?.question ? (
              <>
                <p className="mt-1 font-display text-lg font-semibold text-plum">
                  {data.todayQuestion.question.prompt}
                </p>
                <p className="mt-1 text-xs text-berry-soft">
                  {data.todayQuestion.bothAnswered
                    ? "Both answered. Tap to read together."
                    : data.todayQuestion.myAnswered
                      ? `Waiting for ${partnerName}`
                      : "Tap to answer"}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-berry-soft">Today&apos;s question arrives soon.</p>
            )}
          </Card>
        </Link>

        {/* Location status, only when someone is sharing */}
        {(data.mySharing || data.partnerSharing) && (
          <Link href="/location" className="pressable">
            <Card className="flex items-center gap-3">
              <HeartIcon className="heart-pulse h-5 w-5 text-success" />
              <span className="flex-1 text-sm text-berry">
                {data.mySharing && data.partnerSharing
                  ? "You are both sharing location"
                  : data.mySharing
                    ? "You are sharing your location"
                    : `${partnerName} is sharing their location`}
              </span>
            </Card>
          </Link>
        )}

        {/* Setup nudge */}
        {needsSetupNudge && !showSetup && (
          <button className="pressable text-left" onClick={() => setShowSetup(true)}>
            <Card className="flex items-center gap-3 border-lavender bg-lavender/40">
              <HeartIcon className="h-5 w-5 text-lavender-deep" />
              <span className="flex-1 text-sm text-berry">
                Finish setting up: install the app and turn on notifications.
              </span>
              <span className="text-xs font-semibold text-lavender-deep underline">Show me</span>
            </Card>
          </button>
        )}
        {showSetup && <InstallGuide person={me.person} onDone={() => setShowSetup(false)} />}

      </main>
    </>
  );
}

function HomeHeader({ name, days }: { name: string; days: number | null }) {
  return (
    <header className="px-4 pb-2" style={{ paddingTop: "calc(1.5rem + var(--safe-top))" }}>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-berry-soft">{greeting()},</p>
          <h1 className="font-display text-4xl font-semibold text-plum">{name}</h1>
        </div>
        {days !== null && days > 0 && (
          <Link href="/us" className="pressable text-right">
            <span className="flex items-center gap-1.5 rounded-full bg-blush px-3.5 py-1.5">
              <HeartIcon className="h-3.5 w-3.5 text-rose-dark" />
              <span className="text-sm font-bold text-rose-dark">Day {days}</span>
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
