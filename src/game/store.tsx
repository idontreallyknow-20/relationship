"use client";

/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect --
 * The save is a single long-lived object that the game engine mutates in
 * place, and the tick loop is a genuine external system that has to push its
 * results into React. Copying a save of this size ten times a second, or
 * routing every tick through a reducer, would cost more than it buys. The
 * mutation is confined to this file and to `src/game`, and the version
 * counter below is what tells React something changed.
 */

// The bridge between the pure game modules and React.
//
// State lives in a ref and is mutated in place; a version counter drives
// re-renders. That keeps a sixty-tap-a-second session from allocating a new
// copy of a large save object on every tap, which is the difference between
// smooth and not on an older phone.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useCouple, useWho } from "@/lib/couple-context";
import { dayIn, todayIn } from "@/lib/day";
import { useOnline } from "@/lib/offline/net";
import { drain } from "@/lib/offline/outbox";
import type { Derived, GameState } from "./types";
import { createGameState } from "./state";
import { derive, hasFlag } from "./formulas";
import {
  checkAchievements, claimDailyBonus, computeOffline, claimOffline as applyOffline,
  recordDay, tick as engineTick, type OfflineReport,
} from "./engine";
import {
  buyCheapest, collectGift, grantTogether, receiveGift, recordSameEvening, refreshMissions,
  runAutobuyers,
} from "./actions";
import { drainRewards } from "./rewards-inbox";
import {
  claimLegacy, loadBothSaves, loadLocal, loadServer, partnerIsAround, queueSync,
  reconcile, saveLocal,
} from "./persistence";

const TICK_MS = 100;
const AUTOSAVE_MS = 4_000;
const SYNC_MS = 60_000;

export interface GameNotice {
  id: string;
  kind: "achievement" | "reward" | "warning" | "info";
  title: string;
  detail?: string;
}

interface GameContextValue {
  state: GameState;
  derived: Derived;
  ready: boolean;
  loadError: string | null;
  /** Increments on every change; use it as a memo dependency. */
  version: number;
  /** The clock, sampled once per tick. Read this instead of Date.now() in render. */
  now: number;
  online: boolean;
  today: string;
  offlineReport: OfflineReport | null;
  dismissOffline: () => void;
  claimOfflineNow: () => void;
  notices: GameNotice[];
  dismissNotice: (id: string) => void;
  notify: (notice: Omit<GameNotice, "id">) => void;
  /** Mutate the save. The callback runs against the live object. */
  mutate: (fn: (state: GameState) => void) => void;
  /** Force a save and a server sync right now. */
  flush: () => Promise<void>;
  legacyTaps: number | null;
  dismissLegacy: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return ctx;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { couple } = useCouple();
  const { me } = useWho();
  const online = useOnline();

  // The save is created once and then mutated in place. Holding it in state
  // rather than a ref keeps it readable during render without copying a large
  // object on every tap.
  const [state] = useState<GameState>(() => createGameState(Date.now(), me));
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [legacyTaps, setLegacyTaps] = useState<number | null>(null);
  const [notices, setNotices] = useState<GameNotice[]>([]);
  const [today, setToday] = useState(() => todayIn(couple.timezone));

  const dirty = useRef(false);
  const lastSave = useRef(0);
  const lastSync = useRef(0);
  const dayCounters = useRef({ hearts: 0, clicks: 0, combo: 0 });

  const bump = useCallback(() => {
    dirty.current = true;
    setVersion((v) => v + 1);
    setNow(Date.now());
  }, []);

  const notify = useCallback((notice: Omit<GameNotice, "id">) => {
    setNotices((prev) => [...prev.slice(-4), { ...notice, id: crypto.randomUUID() }]);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const mutate = useCallback(
    (fn: (state: GameState) => void) => {
      fn(state);
      bump();
    },
    [bump, state],
  );

  /* ---------------------------------------------------------------- */
  /* Load                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadLocal(me);
      let server = null;
      try {
        server = await loadServer(me);
      } catch (err) {
        // Offline, or the table has not been migrated yet. Neither is fatal:
        // the local save is enough to play.
        if (!local) setLoadError(online ? (err as Error).message : null);
      }
      if (cancelled) return;

      // Merge into the object the rest of the tree already holds a reference
      // to, so nothing ends up pointing at a stale save.
      const resolved = reconcile(local, server, me) ?? createGameState(Date.now(), me);
      Object.assign(state, resolved);

      // Old love jar taps become starting progress, exactly once.
      if (!state.legacyClaimed) {
        try {
          const taps = await claimLegacy(state);
          if (taps > 0 && !cancelled) setLegacyTaps(taps);
        } catch {
          // Try again next load; nothing is lost by waiting.
        }
      }

      const startedAt = Date.now();
      const report = computeOffline(state, startedAt);
      if (report.hearts > 0 || report.shells > 0) {
        setOfflineReport(report);
      } else {
        state.lastSeenAt = startedAt;
      }
      state.stats.sessionStartedAt = startedAt;
      state.stats.sessionHearts = 0;

      if (!cancelled) {
        setReady(true);
        bump();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  /* ---------------------------------------------------------------- */
  /* Day rollover, missions, events, daily bonus                       */
  /* ---------------------------------------------------------------- */

  const rollOver = useCallback(
    (day: string) => {
      const date = new Date(`${day}T12:00:00Z`);
      const week = `${date.getUTCFullYear()}-W${String(
        Math.ceil(((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7),
      ).padStart(2, "0")}`;
      refreshMissions(state, day, week);
      const bonus = claimDailyBonus(state, day);
      if (bonus) {
        notify({
          kind: "reward",
          title: `Daily bonus, day ${bonus.streak}`,
          detail: "Hearts, pearls and shells added.",
        });
      }
      dayCounters.current = { hearts: 0, clicks: 0, combo: 0 };
      bump();
    },
    [couple.start_date, bump, notify, state],
  );

  useEffect(() => {
    if (!ready) return;
    rollOver(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, today]);

  /* ---------------------------------------------------------------- */
  /* Bonuses left by the rest of the app                                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const collect = async () => {
      const notes = await drainRewards();
      if (cancelled || notes.length === 0) return;
      const noteAt = Date.now();
      const granted: string[] = [];
      for (const note of notes) {
        const result = grantTogether(state, note.action, note.day, noteAt);
        if (result.ok && result.message) granted.push(result.message);
      }
      if (granted.length > 0) {
        notify({
          kind: "reward",
          title: granted.length === 1 ? granted[0] : `${granted.length} shared moments`,
          detail: "Bonus hearts and bond energy added.",
        });
        bump();
      }
    };

    void collect();
    const interval = setInterval(() => void collect(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ready, bump, notify, state]);

  /* ---------------------------------------------------------------- */
  /* The other person                                                   */
  /* ---------------------------------------------------------------- */

  // The only thing in the game that needs them: if you have both been in the
  // jar in the last few hours, everything doubles for both of you. Checked on
  // load and then occasionally, never blocking, and silently skipped offline.
  useEffect(() => {
    if (!ready || !online) return;
    let cancelled = false;

    const check = async () => {
      try {
        const saves = await loadBothSaves();
        if (cancelled) return;
        let changed = false;

        // Anything they left behind when their tide went out. This is the
        // receiving half of `leaveGift`, which can only write to its own save.
        const theirs = saves.find((s) => s.person !== me);
        if (theirs && receiveGift(state, theirs.state, Date.now()).ok) changed = true;

        if (partnerIsAround(saves, me)) {
          const result = recordSameEvening(state, todayIn(couple.timezone), Date.now());
          if (result.ok) {
            notify({ kind: "reward", title: "You are both here", detail: result.message });
            changed = true;
          }
        }

        if (changed) bump();
      } catch {
        // Offline or not migrated yet. Nothing here is required to play.
      }
    };

    void check();
    const interval = setInterval(() => void check(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ready, online, me, couple.timezone, notify, bump, state]);

  // Anything the other person left behind when their tide went out.
  useEffect(() => {
    if (!ready || !state.giftWaiting || state.giftWaiting.collected) return;
    const result = collectGift(state, Date.now());
    if (result.ok) {
      notify({ kind: "reward", title: result.message ?? "They left you something" });
      bump();
    }
  }, [ready, version, notify, bump, state]);

  /* ---------------------------------------------------------------- */
  /* Saving                                                            */
  /* ---------------------------------------------------------------- */

  const persist = useCallback(async () => {
    if (!ready) return;
    state.updatedAt = Date.now();
    await saveLocal(me, state);
    dirty.current = false;
    lastSave.current = Date.now();
  }, [me, ready, state]);

  const pushToServer = useCallback(async () => {
    if (!ready) return;
    const day = todayIn(couple.timezone);
    recordDay(state, day, dayCounters.current.hearts, dayCounters.current.clicks, dayCounters.current.combo);
    dayCounters.current = { hearts: 0, clicks: 0, combo: 0 };
    await queueSync(me, state, day);
    lastSync.current = Date.now();
  }, [couple.timezone, me, ready, state]);

  /* ---------------------------------------------------------------- */
  /* The loop                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!ready) return;
    let last = Date.now();
    let stopped = false;

    const step = () => {
      if (stopped) return;
      const now = Date.now();
      const dt = now - last;
      last = now;
      const before = state.wallet.hearts;
      const beforeClicks = state.stats.totalClicks;
      engineTick(state, dt, now);
      state.lastSeenAt = now;

      dayCounters.current.hearts += Math.max(0, state.wallet.hearts - before);
      dayCounters.current.clicks += state.stats.totalClicks - beforeClicks;
      dayCounters.current.combo = Math.max(dayCounters.current.combo, state.combo);

      // The autobuyers, which are free and on by choice, then the deeper
      // automation that the star tree unlocks.
      runAutobuyers(state, now);
      if (hasFlag(state, "auto_upgrade")) buyCheapest(state);

      const unlocked = checkAchievements(state, now);
      for (const achievement of unlocked) {
        notify({ kind: "achievement", title: achievement.name, detail: achievement.description });
      }

      // Day boundary in the couple's timezone.
      const currentDay = dayIn(couple.timezone, now);
      if (currentDay !== today) setToday(currentDay);

      if (state.stats.sessionHearts > state.stats.bestSessionHearts) {
        state.stats.bestSessionHearts = state.stats.sessionHearts;
      }
      const sessionMs = now - state.stats.sessionStartedAt;
      if (sessionMs > state.stats.longestSessionMs) state.stats.longestSessionMs = sessionMs;

      bump();
    };

    const interval = setInterval(step, TICK_MS);

    // A hidden tab stops ticking entirely, so nothing runs in the background.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        last = Date.now();
      } else {
        state.lastSeenAt = Date.now();
        void persist();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, couple.timezone, today]);


  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (dirty.current && now - lastSave.current > AUTOSAVE_MS) void persist();
      if (now - lastSync.current > SYNC_MS) void pushToServer();
    }, 1_000);
    return () => clearInterval(interval);
  }, [ready, persist, pushToServer]);

  // Save on the way out. `pagehide` is the one event iOS reliably fires.
  useEffect(() => {
    if (!ready) return;
    const onLeave = () => {
      state.lastSeenAt = Date.now();
      void persist();
      void pushToServer();
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [ready, persist, pushToServer, state]);

  // Send whatever is queued as soon as the connection is back.
  useEffect(() => {
    if (online && ready) void drain();
  }, [online, ready]);

  const flush = useCallback(async () => {
    await persist();
    await pushToServer();
    await drain();
  }, [persist, pushToServer]);

  /* ---------------------------------------------------------------- */
  /* Offline claim                                                     */
  /* ---------------------------------------------------------------- */

  const claimOfflineNow = useCallback(() => {
    if (!offlineReport) return;
    applyOffline(state, offlineReport, Date.now());
    setOfflineReport(null);
    bump();
  }, [offlineReport, bump, state]);

  const dismissOffline = useCallback(() => {
    state.lastSeenAt = Date.now();
    setOfflineReport(null);
    bump();
  }, [bump, state]);

  const derived = useMemo(
    () => derive(state, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, now],
  );

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      derived,
      ready,
      loadError,
      version,
      now,
      online,
      today,
      offlineReport,
      dismissOffline,
      claimOfflineNow,
      notices,
      dismissNotice,
      notify,
      mutate,
      flush,
      legacyTaps,
      dismissLegacy: () => setLegacyTaps(null),
    }),
    [
      derived, ready, loadError, version, now, online, today, offlineReport, dismissOffline,
      claimOfflineNow, notices, dismissNotice, notify, mutate, flush, legacyTaps, state,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
