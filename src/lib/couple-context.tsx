"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { storedDeviceId, signOutDevice } from "./pairing";
import { syncPushSubscription } from "./push";
import type { Couple, Person, Profile } from "./types";
import { partnerOf } from "./types";

interface CoupleState {
  session: Session;
  me: Profile;
  partner: Profile | null;
  couple: Couple;
  deviceId: string | null;
  refresh: () => Promise<void>;
}

const CoupleContext = createContext<CoupleState | null>(null);

export function useCouple(): CoupleState {
  const ctx = useContext(CoupleContext);
  if (!ctx) throw new Error("useCouple must be used inside CoupleProvider");
  return ctx;
}

/** Convenience: my person key and my partner's. */
export function useWho(): { me: Person; partner: Person } {
  const { me } = useCouple();
  return { me: me.person, partner: partnerOf(me.person) };
}

export function CoupleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<Omit<CoupleState, "refresh"> | null>(null);
  const [failed, setFailed] = useState(false);
  const deviceId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      router.replace("/welcome");
      return;
    }
    deviceId.current = storedDeviceId();

    const [profilesRes, coupleRes] = await Promise.all([
      sb.from("profiles").select("*"),
      sb.from("couple").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (profilesRes.error || coupleRes.error || !coupleRes.data) {
      setFailed(true);
      return;
    }
    const profiles = (profilesRes.data ?? []) as Profile[];
    const me = profiles.find((p) => p.id === session.user.id);
    if (!me) {
      // Session exists but is not one of the two members; force re-pairing.
      await sb.auth.signOut();
      router.replace("/welcome");
      return;
    }
    const partner = profiles.find((p) => p.id !== session.user.id) ?? null;
    setState({
      session,
      me,
      partner,
      couple: coupleRes.data as Couple,
      deviceId: deviceId.current,
    });
  }, [router]);

  useEffect(() => {
    void load();
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/welcome");
    });
    return () => sub.subscription.unsubscribe();
  }, [load, router]);

  // Device guard: if this device is revoked, sign out immediately.
  useEffect(() => {
    if (!state) return;
    const id = deviceId.current;
    if (!id) return;
    const sb = supabase();

    const check = async () => {
      const { data } = await sb
        .from("devices")
        .select("revoked_at")
        .eq("id", id)
        .maybeSingle();
      if (data?.revoked_at) {
        localStorage.removeItem("cj_device_id");
        await sb.auth.signOut();
        router.replace("/welcome?revoked=1");
      }
    };
    void check();

    const channel = sb
      .channel("device-guard")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "devices", filter: `id=eq.${id}` },
        (payload) => {
          if ((payload.new as { revoked_at?: string | null }).revoked_at) void check();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [state, router]);

  // Self-heal push: endpoints rotate and dead server rows get pruned, so
  // re-register this device's subscription on every app start.
  useEffect(() => {
    if (!state) return;
    void syncPushSubscription(state.me.person);
  }, [state?.me.person]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat: keep last-seen and device activity fresh while visible.
  useEffect(() => {
    if (!state) return;
    const sb = supabase();
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      const now = new Date().toISOString();
      await sb.from("profiles").update({ last_seen_at: now }).eq("id", state.me.id);
      if (deviceId.current) {
        await sb.from("devices").update({ last_active_at: now }).eq("id", deviceId.current);
      }
    };
    void beat();
    const interval = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [state]);

  // Keep profile and couple data fresh via realtime.
  useEffect(() => {
    if (!state) return;
    const sb = supabase();
    const channel = sb
      .channel("couple-core")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [state?.me.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => (state ? { ...state, refresh: load } : null),
    [state, load],
  );

  if (failed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-berry-soft">
          Could not load your shared space. Check your connection.
        </p>
        <button
          className="pressable rounded-full bg-rose-dark px-6 py-3 font-semibold text-white"
          onClick={() => {
            setFailed(false);
            void load();
          }}
        >
          Try again
        </button>
        <button
          className="text-sm text-berry-soft underline"
          onClick={() => void signOutDevice()}
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <svg viewBox="0 0 24 24" className="heart-pulse h-10 w-10 fill-rose-deep" aria-hidden="true">
          <path d="M12 21c-.6-.5-9-6.4-9-12A5 5 0 0 1 12 6a5 5 0 0 1 9 3c0 5.6-8.4 11.5-9 12z" />
        </svg>
      </div>
    );
  }

  return <CoupleContext.Provider value={value}>{children}</CoupleContext.Provider>;
}
