"use client";

// The home screen jar. Tapping your heart still drops one into the shared jar
// exactly as it always did, and the history is unchanged. What is new is the
// doorway into the full Love Jar game, and that a tap now works offline.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNames, useWho } from "@/lib/couple-context";
import { notifyPartner } from "@/lib/notify";
import { isTransportError } from "@/lib/offline/net";
import { AlreadyAppliedError, PermanentOpError, enqueue, registerOp } from "@/lib/offline/outbox";
import { readCache, writeCache } from "@/lib/offline/cache";
import { displayName, type Person } from "@/lib/types";
import { loadLocal } from "@/game/persistence";
import { formatNumber } from "@/game/numbers";
import { Card, Sheet } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";

const COLORS: Record<Person, string> = {
  joseph: "#7c6ba8",
  cami: "#e08aa4",
};

interface Tap {
  id: string;
  person: Person;
  created_at: string;
}

// Deterministic pseudo-random placement inside the jar from the tap id, so
// both phones render the same jar.
function seeded(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

const JAR_CAP = 60;
const CACHE_KEY = "love-jar:recent";

registerOp<{ id: string; person: Person }>("lovejar.tap", async (payload) => {
  const { error } = await supabase().from("love_taps").insert(payload);
  if (!error) return;
  if (isTransportError(error)) throw error;
  if (error.code === "23505") throw new AlreadyAppliedError("tap already recorded");
  throw new PermanentOpError(error.message);
});

interface CachedJar {
  taps: Tap[];
  total: number;
  mine: number;
  theirs: number;
}

export function LoveJar() {
  const { me, partner } = useWho();
  const names = useNames();
  const [taps, setTaps] = useState<Tap[]>([]);
  const [total, setTotal] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dropping, setDropping] = useState(0);
  const [gameHearts, setGameHearts] = useState<number | null>(null);
  const seen = useRef(new Set<string>());

  const [today, setToday] = useState({ mine: 0, theirs: 0 });

  const load = useCallback(async () => {
    // Paint from cache first so the jar is never blank offline.
    const cached = await readCache<CachedJar>(CACHE_KEY);
    if (cached) {
      setTaps(cached.data.taps);
      setTotal(cached.data.total);
      setToday({ mine: cached.data.mine, theirs: cached.data.theirs });
      for (const tap of cached.data.taps) seen.current.add(tap.id);
    }

    try {
      const sb = supabase();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const [recent, count, mineToday, theirsToday] = await Promise.all([
        sb.from("love_taps").select("*").order("created_at", { ascending: false }).limit(JAR_CAP),
        sb.from("love_taps").select("id", { count: "exact", head: true }),
        sb.from("love_taps").select("id", { count: "exact", head: true }).eq("person", me).gte("created_at", dayStart.toISOString()),
        sb.from("love_taps").select("id", { count: "exact", head: true }).eq("person", partner).gte("created_at", dayStart.toISOString()),
      ]);
      if (recent.error) throw recent.error;
      const rows = ((recent.data ?? []) as Tap[]).reverse();
      for (const t of rows) seen.current.add(t.id);
      const next: CachedJar = {
        taps: rows,
        total: count.count ?? 0,
        mine: mineToday.count ?? 0,
        theirs: theirsToday.count ?? 0,
      };
      setTaps(next.taps);
      setTotal(next.total);
      setToday({ mine: next.mine, theirs: next.theirs });
      await writeCache(CACHE_KEY, next);
    } catch {
      // Offline: the cached copy above is what we show.
    }
  }, [me, partner]);

  // The game's own lifetime total, read straight from its local save so the
  // home card can link into it without mounting the whole game.
  useEffect(() => {
    let cancelled = false;
    void loadLocal(me).then((save) => {
      if (!cancelled) setGameHearts(save?.lifetime.hearts ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    // `load` paints from the IndexedDB cache first and only then touches the
    // network, so both of its state updates happen after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const sb = supabase();
    const channel = sb
      .channel("love-jar")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "love_taps" },
        (payload) => {
          const tap = payload.new as Tap;
          if (seen.current.has(tap.id)) return;
          seen.current.add(tap.id);
          setTaps((prev) => [...prev.slice(-(JAR_CAP - 1)), tap]);
          setTotal((t) => t + 1);
          setToday((c) => (tap.person === me ? { ...c, mine: c.mine + 1 } : { ...c, theirs: c.theirs + 1 }));
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [load, me]);

  const press = async () => {
    const id = crypto.randomUUID();
    const tap: Tap = { id, person: me, created_at: new Date().toISOString() };
    seen.current.add(id);
    setTaps((prev) => [...prev.slice(-(JAR_CAP - 1)), tap]);
    setTotal((t) => t + 1);
    setToday((c) => ({ ...c, mine: c.mine + 1 }));
    setDropping((d) => d + 1);

    // Queued rather than sent directly, so a tap with no signal is not lost.
    await enqueue("lovejar.tap", { id, person: me }, { id, label: "A heart for the jar" });

    // One gentle notification per person per day, no matter how many taps.
    const day = new Date().toISOString().slice(0, 10);
    void notifyPartner("thinking_of_you", `love-jar-${me}-${day}`, { url: "/home" });
  };

  return (
    <>
      <Card className="flex items-center gap-4 py-4">
        <button
          aria-label={`Open the love jar, ${total} hearts inside`}
          onClick={() => setHistoryOpen(true)}
          className="pressable"
        >
          <JarSvg taps={taps} />
        </button>

        <div className="flex flex-1 flex-col items-center gap-2">
          <button
            aria-label="Drop a heart in the jar"
            onClick={press}
            className="pressable relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lift"
            style={{ color: COLORS[me] }}
          >
            <HeartIcon className="h-9 w-9" />
            {dropping > 0 && (
              <span
                key={dropping}
                className="love-drop pointer-events-none absolute"
                style={{ color: COLORS[me] }}
                onAnimationEnd={() => setDropping(0)}
              >
                <HeartIcon className="h-5 w-5" />
              </span>
            )}
          </button>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span className="flex items-center gap-1" style={{ color: COLORS[me] }}>
              <HeartIcon className="h-3.5 w-3.5" />
              {today.mine}
            </span>
            <span className="flex items-center gap-1" style={{ color: COLORS[partner] }}>
              <HeartIcon className="h-3.5 w-3.5" />
              {today.theirs}
            </span>
          </div>
          <Link
            href="/jar"
            className="pressable rounded-full bg-blush px-3.5 py-1.5 text-xs font-bold text-rose-dark"
          >
            {gameHearts && gameHearts > 0
              ? `Play the jar · ${formatNumber(gameHearts)} hearts`
              : "Play the Love Jar"}
          </Link>
        </div>
      </Card>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Love jar">
        <JarHistory me={me} partner={partner} total={total} />
      </Sheet>
    </>
  );
}

function JarSvg({ taps }: { taps: Tap[] }) {
  return (
    <svg viewBox="0 0 100 120" className="h-28 w-24" aria-hidden="true">
      {/* Jar body */}
      <path
        d="M28 18 h44 v6 c6 6 10 14 10 24 v52 a14 14 0 0 1 -14 14 h-36 a14 14 0 0 1 -14 -14 v-52 c0 -10 4 -18 10 -24 z"
        fill="#ffffff"
        stroke="#ecdae1"
        strokeWidth="2.5"
      />
      {/* Lid */}
      <rect x="24" y="8" width="52" height="10" rx="5" fill="#f0cbd8" />
      {/* Hearts inside, stacked from the bottom */}
      {taps.map((tap, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        const jx = 24 + col * 9 + seeded(tap.id, 7) * 7;
        const jy = 100 - row * 9 - seeded(tap.id, 13) * 5;
        if (jy < 30) return null;
        const size = 7 + seeded(tap.id, 3) * 3;
        return (
          <path
            key={tap.id}
            transform={`translate(${jx} ${jy}) scale(${size / 24}) rotate(${seeded(tap.id, 5) * 40 - 20})`}
            d="M12 21c-.6-.5-9-6.4-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 5.6-8.4 11.5-9 12z"
            fill={COLORS[tap.person]}
            opacity={0.92}
          />
        );
      })}
    </svg>
  );
}

function JarHistory({ me, partner, total }: { me: Person; partner: Person; total: number }) {
  const names = useNames();
  const [days, setDays] = useState<{ day: string; mine: number; theirs: number }[] | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data } = await supabase()
        .from("love_taps")
        .select("person, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      const byDay = new Map<string, { mine: number; theirs: number }>();
      for (const tap of (data ?? []) as Tap[]) {
        const d = new Date(tap.created_at);
        const key = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        const entry = byDay.get(key) ?? { mine: 0, theirs: 0 };
        if (tap.person === me) entry.mine += 1;
        else entry.theirs += 1;
        byDay.set(key, entry);
      }
      setDays(Array.from(byDay.entries()).map(([day, counts]) => ({ day, ...counts })));
    })();
  }, [me]);

  const max = Math.max(1, ...(days ?? []).map((d) => d.mine + d.theirs));

  return (
    <div className="space-y-4 pt-2">
      <p className="text-center font-display text-3xl font-semibold text-plum">
        {total} {total === 1 ? "heart" : "hearts"}
      </p>
      {days === null ? null : days.length === 0 ? (
        <p className="text-center text-sm text-berry-soft">
          No hearts yet. Tap yours to drop the first one in.
        </p>
      ) : (
        <div className="space-y-2">
          {days.map((d) => (
            <div key={d.day} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-berry-soft">{d.day}</span>
              <span className="flex h-3.5 flex-1 overflow-hidden rounded-full bg-cream">
                <span
                  style={{ width: `${(d.mine / max) * 100}%`, backgroundColor: COLORS[me] }}
                />
                <span
                  style={{ width: `${(d.theirs / max) * 100}%`, backgroundColor: COLORS[partner] }}
                />
              </span>
              <span className="w-12 shrink-0 text-right text-xs font-semibold text-berry">
                {d.mine + d.theirs}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-4 text-xs font-semibold">
        <span className="flex items-center gap-1.5" style={{ color: COLORS[me] }}>
          <HeartIcon className="h-3 w-3" />
          {names[me]}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: COLORS[partner] }}>
          <HeartIcon className="h-3 w-3" />
          {names[partner]}
        </span>
      </div>
      <p className="text-center text-xs text-berry-soft">
        Every one of these carried over into the Love Jar game as a lifetime heart.
      </p>
    </div>
  );
}
