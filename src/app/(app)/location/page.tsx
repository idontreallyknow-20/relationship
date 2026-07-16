"use client";

// Consent-based location sharing. Everything is explicit and easy to stop:
// pick a sharing mode, see each other's latest share, send arrival signals,
// and clear history at any time.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert, History as HistoryIcon, House, MapPin, Navigation, OctagonX, Trash2,
} from "lucide-react";
import { Button, ConfirmDialog, EmptyState, TopBar, useToast } from "@/components/ui";
import { HeartIcon, HeartSpinner } from "@/components/hearts";
import { useCouple, useWho } from "@/lib/couple-context";
import { supabase } from "@/lib/supabase";
import { notifyPartner } from "@/lib/notify";
import { distanceKm, formatDistance, formatRelative } from "@/lib/format";
import {
  displayName, type LocationMode, type LocationShare, type Signal,
} from "@/lib/types";

type UiMode = "off" | LocationMode;

const MODE_CARDS: { value: UiMode; title: string; hint: string }[] = [
  { value: "off", title: "Off", hint: "Nothing is shared." },
  { value: "once", title: "Share once", hint: "One snapshot, visible for 15 minutes." },
  { value: "hour", title: "Share for 1 hour", hint: "Updates every few minutes while the app is open." },
  { value: "tonight", title: "Share until tonight", hint: "Stops at 11:59 pm, updates while the app is open." },
  { value: "while_using", title: "Share while using the app", hint: "Follows along only while the app is on screen." },
];

const ONCE_MINUTES = 15;
const REFRESH_MS = 5 * 60 * 1000;
const WHILE_USING_TTL_MS = 10 * 60 * 1000;
const THROTTLE_MS = 2 * 60 * 1000;
const THROTTLE_METERS = 200;

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 20000,
    });
  });
}

function isDenied(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 1
  );
}

function tonightExpiry(): Date {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  if (d.getTime() <= Date.now()) d.setTime(Date.now() + ONCE_MINUTES * 60 * 1000);
  return d;
}

export default function Page() {
  const toast = useToast();
  const { me, partner } = useWho();
  const { partner: partnerProfile } = useCouple();

  const [mode, setMode] = useState<UiMode>("off");
  const [restoring, setRestoring] = useState(true);
  const [rows, setRows] = useState<LocationShare[] | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const modeRef = useRef<UiMode>("off");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const windowEndRef = useRef<Date | null>(null);
  const lastInsertRef = useRef<{ t: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Keep "now" fresh so expiries flip without a reload.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadRows = useCallback(async () => {
    const { data } = await supabase()
      .from("locations")
      .select("*")
      .order("shared_at", { ascending: false })
      .limit(100);
    if (data) setRows(data as LocationShare[]);
  }, []);

  const loadSignals = useCallback(async () => {
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { data } = await supabase()
      .from("signals")
      .select("*")
      .in("kind", ["arrived", "made_it_home"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setSignals(data as Signal[]);
  }, []);

  const persistMode = useCallback(
    async (m: UiMode) => {
      const sb = supabase();
      const { data } = await sb
        .from("person_settings")
        .select("settings")
        .eq("person", me)
        .maybeSingle();
      const settings = { ...((data?.settings as Record<string, unknown>) ?? {}), locationMode: m };
      await sb.from("person_settings").upsert({ person: me, settings }, { onConflict: "person" });
    },
    [me],
  );

  const insertShare = useCallback(
    async (pos: GeolocationPosition, m: LocationMode, expiresAt: Date) => {
      lastInsertRef.current = {
        t: Date.now(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      await supabase().from("locations").insert({
        person: me,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
        mode: m,
        shared_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      });
      void loadRows();
    },
    [me, loadRows],
  );

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (watchRef.current !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    windowEndRef.current = null;
  }, []);

  const stopSharing = useCallback(
    async (deleteRows: boolean) => {
      clearTimers();
      setMode("off");
      void persistMode("off");
      if (deleteRows) {
        await supabase()
          .from("locations")
          .delete()
          .eq("person", me)
          .gt("expires_at", new Date().toISOString());
        void loadRows();
      }
    },
    [clearTimers, persistMode, me, loadRows],
  );

  const handlePositionError = useCallback(
    (err: unknown) => {
      if (isDenied(err)) setDenied(true);
      clearTimers();
      setMode("off");
      void persistMode("off");
      if (!isDenied(err)) toast("Could not read your location.");
    },
    [clearTimers, persistMode, toast],
  );

  // Interval tick for hour and tonight modes.
  const refreshTick = useCallback(async () => {
    const m = modeRef.current;
    if (m !== "hour" && m !== "tonight") return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const end = windowEndRef.current;
    if (!end || end.getTime() <= Date.now()) {
      clearTimers();
      setMode("off");
      void persistMode("off");
      return;
    }
    try {
      const pos = await getPosition();
      await insertShare(pos, m, end);
    } catch (err) {
      handlePositionError(err);
    }
  }, [clearTimers, persistMode, insertShare, handlePositionError]);

  const startInterval = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => void refreshTick(), REFRESH_MS);
  }, [refreshTick]);

  const onWatchPosition = useCallback(
    (pos: GeolocationPosition) => {
      if (modeRef.current !== "while_using") return;
      const last = lastInsertRef.current;
      const movedMeters = last
        ? distanceKm(last.lat, last.lng, pos.coords.latitude, pos.coords.longitude) * 1000
        : Infinity;
      if (last && Date.now() - last.t < THROTTLE_MS && movedMeters <= THROTTLE_METERS) return;
      void insertShare(pos, "while_using", new Date(Date.now() + WHILE_USING_TTL_MS));
    },
    [insertShare],
  );

  const startWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      onWatchPosition,
      (err) => handlePositionError(err),
      { enableHighAccuracy: true, maximumAge: 60_000 },
    );
  }, [onWatchPosition, handlePositionError]);

  // Pause and resume with app visibility.
  useEffect(() => {
    const onVisibility = () => {
      const m = modeRef.current;
      if (document.visibilityState === "visible") {
        if (m === "hour" || m === "tonight") void refreshTick();
        if (m === "while_using" && watchRef.current === null) startWatch();
      } else if (m === "while_using" && watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshTick, startWatch]);

  const selectMode = useCallback(
    async (m: UiMode) => {
      // "Share once" may be tapped again to send a fresh snapshot.
      if (busy || (m === mode && m !== "once")) return;
      if (m === "off") {
        await stopSharing(true);
        toast("Location sharing is off");
        return;
      }
      setBusy(true);
      try {
        const pos = await getPosition();
        setDenied(false);
        clearTimers();
        if (m === "once") {
          await insertShare(pos, "once", new Date(Date.now() + ONCE_MINUTES * 60 * 1000));
          toast("Shared your location once");
        } else if (m === "hour") {
          const end = new Date(Date.now() + 60 * 60 * 1000);
          windowEndRef.current = end;
          await insertShare(pos, "hour", end);
          startInterval();
          toast("Sharing for 1 hour");
        } else if (m === "tonight") {
          const end = tonightExpiry();
          windowEndRef.current = end;
          await insertShare(pos, "tonight", end);
          startInterval();
          toast("Sharing until tonight");
        } else {
          await insertShare(pos, "while_using", new Date(Date.now() + WHILE_USING_TTL_MS));
          startWatch();
          toast("Sharing while you use the app");
        }
        setMode(m);
        void persistMode(m);
      } catch (err) {
        handlePositionError(err);
      } finally {
        setBusy(false);
      }
    },
    [busy, mode, stopSharing, clearTimers, insertShare, startInterval, startWatch, persistMode, handlePositionError, toast],
  );

  // Initial load: rows, signals, and my saved mode. Resume live modes when
  // the previous window has not expired yet.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = supabase();
      const [settingsRes, rowsRes] = await Promise.all([
        sb.from("person_settings").select("settings").eq("person", me).maybeSingle(),
        sb.from("locations").select("*").order("shared_at", { ascending: false }).limit(100),
        loadSignals(),
      ]);
      if (cancelled) return;
      const allRows = (rowsRes.data ?? []) as LocationShare[];
      setRows(allRows);
      const saved = ((settingsRes.data?.settings as Record<string, unknown>) ?? {})
        .locationMode as UiMode | undefined;
      if (saved && saved !== "off") {
        const latest = allRows.find(
          (r) => r.person === me && r.mode === saved && new Date(r.expires_at).getTime() > Date.now(),
        );
        if (saved === "while_using") {
          setMode("while_using");
          startWatch();
        } else if ((saved === "hour" || saved === "tonight") && latest) {
          windowEndRef.current = new Date(latest.expires_at);
          setMode(saved);
          startInterval();
          void refreshTick();
        } else if (saved === "once" && latest) {
          setMode("once");
        } else {
          void persistMode("off");
        }
      }
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Stop timers when leaving the page; rows expire on their own.
  useEffect(() => clearTimers, [clearTimers]);

  // Realtime: locations and signals.
  useEffect(() => {
    const sb = supabase();
    const channel = sb
      .channel("location-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, () => {
        void loadRows();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => {
        void loadSignals();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [loadRows, loadSignals]);

  const sendSignal = useCallback(
    async (kind: "arrived" | "made_it_home") => {
      const current = (rows ?? []).find(
        (r) => r.person === me && new Date(r.expires_at).getTime() > Date.now(),
      );
      const note = current ? `Near ${current.lat.toFixed(3)}, ${current.lng.toFixed(3)}` : null;
      const { data, error } = await supabase()
        .from("signals")
        .insert({ from_person: me, kind, note })
        .select()
        .single();
      if (error || !data) {
        toast("Could not send that.");
        return;
      }
      void notifyPartner("arrivals", (data as Signal).id, {
        body: "Made it safely",
        url: "/location",
      });
      toast(kind === "arrived" ? "Told them you arrived" : "Told them you are home");
      void loadSignals();
    },
    [rows, me, toast, loadSignals],
  );

  const clearHistory = useCallback(async () => {
    clearTimers();
    setMode("off");
    void persistMode("off");
    await supabase().from("locations").delete().eq("person", me);
    void loadRows();
    toast("Your location history was deleted");
  }, [clearTimers, persistMode, me, loadRows, toast]);

  const myCurrent = useMemo(
    () =>
      (rows ?? []).find((r) => r.person === me && new Date(r.expires_at).getTime() > nowTick) ??
      null,
    [rows, me, nowTick],
  );
  const partnerCurrent = useMemo(
    () =>
      (rows ?? []).find(
        (r) => r.person === partner && new Date(r.expires_at).getTime() > nowTick,
      ) ?? null,
    [rows, partner, nowTick],
  );
  const myHistory = useMemo(() => (rows ?? []).filter((r) => r.person === me), [rows, me]);
  const partnerSignal = signals.find((s) => s.from_person === partner) ?? null;

  const km =
    myCurrent && partnerCurrent
      ? distanceKm(myCurrent.lat, myCurrent.lng, partnerCurrent.lat, partnerCurrent.lng)
      : null;

  const partnerName = partnerProfile?.display_name ?? displayName(partner);

  return (
    <>
      <TopBar title="Location" />
      <div className="space-y-4 px-4 pt-3 pb-6">
        {rows === null || restoring ? (
          <HeartSpinner label="Loading location sharing" />
        ) : (
          <>
            {partnerSignal && (
              <div className="flex items-center gap-3 rounded-card border border-blush-deep bg-blush p-4 shadow-soft">
                <HeartIcon className="h-5 w-5 shrink-0 text-rose-dark" />
                <p className="text-sm text-berry">
                  <span className="font-semibold">{partnerName}</span>{" "}
                  {partnerSignal.kind === "made_it_home" ? "made it home safely" : "arrived safely"},{" "}
                  {formatRelative(partnerSignal.created_at)}.
                </p>
              </div>
            )}

            {denied && (
              <div className="rounded-card border border-line bg-white p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div>
                    <p className="font-semibold text-berry">Location access is blocked</p>
                    <p className="mt-1 text-sm text-berry-soft">
                      Your browser is not allowing this app to read your location. To share again,
                      open your browser or phone settings, find site permissions for this app, and
                      allow location. Then pick a sharing mode below.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <section aria-label="Sharing mode">
              <h2 className="mb-2 font-display text-xl font-semibold text-plum">Share my location</h2>
              <div className="space-y-2">
                {MODE_CARDS.map((card) => {
                  const selected = mode === card.value;
                  return (
                    <button
                      key={card.value}
                      onClick={() => void selectMode(card.value)}
                      disabled={busy}
                      aria-pressed={selected}
                      className={`pressable flex min-h-11 w-full items-center gap-3 rounded-card border p-4 text-left shadow-soft ${
                        selected ? "border-rose-dark bg-blush" : "border-line bg-white"
                      } ${busy ? "opacity-60" : ""}`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          selected ? "bg-rose-dark text-white" : "bg-blush text-rose-dark"
                        }`}
                      >
                        {card.value === "off" ? (
                          <OctagonX className="h-4 w-4" />
                        ) : (
                          <Navigation className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-berry">{card.title}</span>
                        <span className="block text-xs text-berry-soft">{card.hint}</span>
                      </span>
                      {selected && <HeartIcon className="ml-auto h-5 w-5 shrink-0 text-rose-dark" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-berry-soft">
                Sharing only updates while the app is open. iPhones do not allow web apps to track
                in the background, and this app never tries to.
              </p>
            </section>

            {(mode !== "off" || myCurrent) && (
              <Button
                variant="danger"
                size="lg"
                className="w-full"
                onClick={() => {
                  void stopSharing(true);
                  toast("Sharing stopped and cleared");
                }}
              >
                <OctagonX className="h-5 w-5" />
                Stop sharing now
              </Button>
            )}

            <section aria-label="Current status">
              <h2 className="mb-2 font-display text-xl font-semibold text-plum">Right now</h2>
              {km !== null && myCurrent && partnerCurrent && (
                <div className="mb-3 rounded-card border border-line bg-white p-4 text-center shadow-soft">
                  <p className="font-display text-2xl font-semibold text-plum">
                    You two are {formatDistance(km)}
                  </p>
                  <DistanceLine km={km} meName={displayName(me)} partnerName={partnerName} />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatusCard title="You" share={myCurrent} now={nowTick} />
                <StatusCard title={partnerName} share={partnerCurrent} now={nowTick} />
              </div>
            </section>

            <section aria-label="Check in">
              <h2 className="mb-2 font-display text-xl font-semibold text-plum">Check in</h2>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => void sendSignal("arrived")}>
                  <MapPin className="h-4 w-4" />
                  I arrived
                </Button>
                <Button variant="secondary" onClick={() => void sendSignal("made_it_home")}>
                  <House className="h-4 w-4" />
                  I am home
                </Button>
              </div>
            </section>

            <section aria-label="History">
              <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-semibold text-plum">
                <HistoryIcon className="h-4 w-4 text-berry-soft" />
                My recent shares
              </h2>
              {myHistory.length === 0 ? (
                <EmptyState
                  title="No location history"
                  hint="Shares you send will appear here briefly, then clean themselves up."
                />
              ) : (
                <div className="overflow-hidden rounded-card border border-line bg-white shadow-soft">
                  <ul>
                    {myHistory.slice(0, 20).map((r) => {
                      const active = new Date(r.expires_at).getTime() > nowTick;
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                        >
                          <HeartIcon
                            className={`h-3.5 w-3.5 shrink-0 ${active ? "text-rose-dark" : "text-line"}`}
                          />
                          <span className="flex-1 text-sm text-berry">
                            {r.lat.toFixed(3)}, {r.lng.toFixed(3)}
                          </span>
                          <span className="text-xs text-berry-soft">{formatRelative(r.shared_at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-xs text-berry-soft">
                History is short-lived: each share deletes itself about a day after it expires.
              </p>
              {myHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-danger"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete all my location history
                </Button>
              )}
            </section>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all location history?"
        message="Every location you have shared will be removed immediately, and sharing will turn off."
        confirmLabel="Delete all"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void clearHistory();
        }}
      />
    </>
  );
}

function StatusCard({
  title,
  share,
  now,
}: {
  title: string;
  share: LocationShare | null;
  now: number;
}) {
  const live = share !== null && share.mode !== "once" && new Date(share.expires_at).getTime() > now;
  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <p className="font-display text-lg font-semibold text-plum">{title}</p>
        {live && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-rose-dark">
            <HeartIcon className="heart-pulse h-3 w-3" />
            Sharing live
          </span>
        )}
      </div>
      {share ? (
        <div className="mt-2 space-y-0.5 text-sm text-berry">
          <p className="font-semibold">
            {share.lat.toFixed(3)}, {share.lng.toFixed(3)}
          </p>
          <p className="text-xs text-berry-soft">
            {share.accuracy !== null ? `within ${share.accuracy} m, ` : ""}
            updated {formatRelative(share.shared_at)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-berry-soft">Not sharing right now.</p>
      )}
    </div>
  );
}

/** Decorative distance line: two hearts spaced by how far apart you are. */
function DistanceLine({
  km,
  meName,
  partnerName,
}: {
  km: number;
  meName: string;
  partnerName: string;
}) {
  // Log scale keeps the line meaningful from a block away to across the world.
  const t = Math.min(1, Math.log10(1 + km) / Math.log10(1 + 20000));
  const left = 8;
  const right = Math.max(left + 8, Math.min(92, left + 8 + t * 76));
  return (
    <div className="mx-auto mt-3 w-full max-w-xs" aria-hidden="true">
      <div className="relative h-8">
        <span className="absolute left-[4%] right-[4%] top-1/2 h-px -translate-y-1/2 bg-line" />
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${left}%` }}
        >
          <HeartIcon className="h-5 w-5 text-rose-dark" />
        </span>
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${right}%` }}
        >
          <HeartIcon className="h-5 w-5 text-rose" />
        </span>
      </div>
      <div className="relative h-4 text-[10px] font-semibold text-berry-soft">
        <span className="absolute -translate-x-1/2" style={{ left: `${left}%` }}>
          {meName}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${right}%` }}>
          {partnerName}
        </span>
      </div>
    </div>
  );
}
