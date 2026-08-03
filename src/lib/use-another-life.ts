"use client";

// Shared click counter for the in-another-life screen. Taps count locally
// right away; pending taps flush to the server in small batches, and the
// partner's count arrives over realtime. The server clamps the pair total
// at TARGET, so the client only ever displays and never enforces alone.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWho } from "@/lib/couple-context";
import type { Person } from "@/lib/types";

export const TARGET = 77777;

type Counts = Record<Person, number>;

const FLUSH_MS = 500;

export function useAnotherLife() {
  const { me } = useWho();
  const [counts, setCounts] = useState<Counts | null>(null);
  const pending = useRef(0);
  const inFlight = useRef(false);
  const confirmed = useRef(0);

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current === 0) return;
    const n = pending.current;
    pending.current = 0;
    inFlight.current = true;
    const { data, error } = await supabase().rpc("add_clicks", { n });
    inFlight.current = false;
    if (error) {
      pending.current += n;
      return;
    }
    confirmed.current = Math.max(confirmed.current, Number(data));
    setCounts((c) =>
      c && { ...c, [me]: Math.max(c[me], confirmed.current + pending.current) },
    );
  }, [me]);

  useEffect(() => {
    let alive = true;
    const sb = supabase();
    void sb
      .from("another_life_clicks")
      .select("person, count")
      .then(({ data }) => {
        if (!alive || !data) return;
        const next: Counts = { cami: 0, joseph: 0 };
        for (const row of data as { person: Person; count: number }[]) {
          next[row.person] = Number(row.count);
        }
        confirmed.current = next[me];
        setCounts(next);
      });
    const channel = sb
      .channel("another-life")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "another_life_clicks" },
        (payload) => {
          const row = payload.new as { person: Person; count: number };
          const value = Number(row.count);
          setCounts((c) => {
            if (!c) return c;
            if (row.person === me) {
              // Own echo: never regress below local while taps are pending.
              confirmed.current = Math.max(confirmed.current, value);
              return { ...c, [me]: Math.max(c[me], value) };
            }
            return { ...c, [row.person]: value };
          });
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    const interval = setInterval(() => void flush(), FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  const rawTotal = counts ? counts.cami + counts.joseph : 0;
  const done = rawTotal >= TARGET;

  // Returns true when the tap counted, so the caller can show an indicator.
  const tap = useCallback(() => {
    if (!counts || rawTotal >= TARGET) return false;
    pending.current += 1;
    setCounts((c) => c && { ...c, [me]: c[me] + 1 });
    return true;
  }, [counts, rawTotal, me]);

  return { counts, total: Math.min(rawTotal, TARGET), done, tap };
}
