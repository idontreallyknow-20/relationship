"use client";

// The "Us" hub: our story, quick affectionate actions, and doors into the
// quieter corners of the app.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarHeart, HandHeart, House, Mail, MapPin, Settings, Smile, Sparkles, MessageCircleHeart,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { settled } from "@/lib/offline/cache";
import { queueInsert } from "@/lib/offline/ops";
import { useBothNames, useCouple } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { signedUrl } from "@/lib/media";
import { formatShortDate, relationshipDays } from "@/lib/format";
import { displayName, partnerOf, type Memory } from "@/lib/types";
import { Avatar, Button, Card, Sheet, useToast } from "@/components/ui";
import { HeartDivider, HeartIcon } from "@/components/hearts";

const DAY_MILESTONES = [50, 100, 200, 300, 365, 500, 730, 1000, 1095, 1460, 1825];

function nextMilestone(days: number): { label: string; inDays: number } | null {
  for (const m of DAY_MILESTONES) {
    if (m > days) return { label: `${m} days`, inDays: m - days };
  }
  const nextYear = Math.ceil(days / 365) * 365;
  return { label: `${nextYear / 365} years`, inDays: nextYear - days };
}

const ROOMS = [
  { href: "/moods", icon: Smile, label: "Moods" },
  { href: "/questions", icon: MessageCircleHeart, label: "Questions" },
  { href: "/letters", icon: Mail, label: "Letters" },
  { href: "/plans", icon: CalendarHeart, label: "Plans" },
  { href: "/location", icon: MapPin, label: "Location" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function UsPage() {
  const { me, partner, couple } = useCouple();
  const bothNames = useBothNames("&");
  const toast = useToast();
  const router = useRouter();
  const partnerPerson = partnerOf(me.person);
  const partnerName = partner?.display_name ?? displayName(partnerPerson);

  const [avatarUrls, setAvatarUrls] = useState<{ me: string | null; partner: string | null }>({ me: null, partner: null });
  const [randomMemory, setRandomMemory] = useState<(Memory & { url: string | null }) | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setAvatarUrls({
        me: me.avatar_path ? await signedUrl(me.avatar_path) : null,
        partner: partner?.avatar_path ? await signedUrl(partner.avatar_path) : null,
      });
    })();
  }, [me.avatar_path, partner?.avatar_path]);

  const sendSignal = async (kind: "check_in" | "made_it_home", message: string) => {
    const id = crypto.randomUUID();
    await queueInsert("signals", { id, from_person: me.person, kind }, "Signal");
    void notifyPartner(kind === "made_it_home" ? "arrivals" : "thinking_of_you", id, { url: "/us" });
    toast(message);
  };

  // "None saved yet" has to mean none saved yet.
  //
  // There was no error handling here, so a failed query produced no rows, which
  // was read as an empty shelf: offline, a couple with a hundred memories was
  // told they had never made one and pushed into the composer. It also asked
  // for a thousand full rows, and for an exact count it then discarded with a
  // `void count;`, in order to pick one at random.
  const showRandomMemory = async () => {
    const { data, error, count } = await settled(
      supabase().from("memories").select("id", { count: "exact", head: true }),
    );
    void data;
    if (error) {
      toast("Cannot reach your memories right now.");
      return;
    }
    const total = count ?? 0;
    if (total === 0) {
      toast("No memories saved yet. Add your first one.");
      router.push("/memories?new=1");
      return;
    }
    // One row, chosen by offset, rather than every row chosen in the client.
    const offset = Math.floor(Math.random() * total);
    const picked = await settled(
      supabase().from("memories").select("*").order("created_at", { ascending: false }).range(offset, offset),
    );
    const pick = (picked.data as Memory[] | null)?.[0];
    if (!pick) {
      toast("Cannot reach your memories right now.");
      return;
    }
    setRandomMemory({ ...pick, url: pick.media_path ? await signedUrl(pick.media_path) : null });
    setMemoryOpen(true);
  };

  const days = couple.start_date ? relationshipDays(couple.start_date) : null;
  const milestone = days ? nextMilestone(days) : null;

  return (
    <>
      <header className="px-4 pb-4 text-center" style={{ paddingTop: "calc(2rem + var(--safe-top))" }}>
        <div className="flex items-center justify-center gap-4">
          <Avatar name={me.display_name} url={avatarUrls.me} size="lg" />
          <HeartIcon className="h-6 w-6 text-rose-dark" />
          <Avatar name={partnerName} url={avatarUrls.partner} size="lg" />
        </div>
        <h1 className="mt-3 font-display text-4xl font-semibold text-plum">
          {bothNames}
        </h1>
        {days !== null && days > 0 ? (
          <>
            <p className="mt-1 text-berry-soft">
              {days} days of us, since {formatShortDate(couple.start_date! + "T00:00:00")}
            </p>
            {milestone && (
              <p className="mt-1 text-xs text-berry-soft">
                {milestone.label} together in {milestone.inDays} {milestone.inDays === 1 ? "day" : "days"}
              </p>
            )}
          </>
        ) : (
          <Link href="/settings" className="mt-1 inline-block text-sm text-rose-dark underline">
            Set your start date to begin the day counter
          </Link>
        )}
      </header>

      <main className="flex flex-col gap-5 px-5 pb-8">
        {/* Quick affectionate actions */}
        <div className="grid grid-cols-3 gap-3">
          <Button variant="secondary" className="flex-col gap-1 py-3" onClick={showRandomMemory}>
            <Sparkles className="h-5 w-5" />
            <span className="text-xs">A memory</span>
          </Button>
          <Button
            variant="secondary"
            className="flex-col gap-1 py-3"
            onClick={() => sendSignal("check_in", `${partnerName} will get your gentle check-in`)}
          >
            <HandHeart className="h-5 w-5" />
            <span className="text-xs">Check in</span>
          </Button>
          <Button
            variant="secondary"
            className="flex-col gap-1 py-3"
            onClick={() => sendSignal("made_it_home", `${partnerName} will know you are home safe`)}
          >
            <House className="h-5 w-5" />
            <span className="text-xs">Made it home</span>
          </Button>
        </div>

        <HeartDivider />

        {/* Rooms */}
        <div className="grid grid-cols-2 gap-2.5">
          {ROOMS.map((room) => (
            <Link key={room.href} href={room.href} className="pressable">
              <Card className="flex items-center gap-3 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lavender text-plum">
                  <room.icon className="h-4.5 w-4.5" />
                </span>
                <span className="font-semibold text-berry">{room.label}</span>
              </Card>
            </Link>
          ))}
        </div>

      </main>

      <Sheet open={memoryOpen} onClose={() => setMemoryOpen(false)} title="A saved memory">
        {randomMemory && (
          <div className="space-y-3">
            {randomMemory.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={randomMemory.url}
                alt={randomMemory.title ?? "Memory"}
                className="max-h-80 w-full rounded-card border border-line object-contain"
              />
            )}
            {randomMemory.title && (
              <p className="font-display text-2xl font-semibold text-plum">{randomMemory.title}</p>
            )}
            {randomMemory.caption && <p className="text-berry">{randomMemory.caption}</p>}
            <p className="text-xs text-berry-soft">
              {randomMemory.happened_on
                ? formatShortDate(randomMemory.happened_on + "T00:00:00")
                : formatShortDate(randomMemory.created_at)}
              {randomMemory.location ? `, ${randomMemory.location}` : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={showRandomMemory}>
                Another one
              </Button>
              <Button variant="ghost" onClick={() => router.push("/memories")}>
                Open memories
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
