import { supabase } from "./supabase";
import { idbWipe } from "./offline/db";
import type { Person } from "./types";

const DEVICE_KEY = "cj_device_id";
const PERSON_KEY = "cj_person";

export function storedDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_KEY);
}

export function storedPerson(): Person | null {
  if (typeof window === "undefined") return null;
  const p = localStorage.getItem(PERSON_KEY);
  return p === "cami" || p === "joseph" ? p : null;
}

export function describeDevice(): { name: string; platform: string; userAgent: string } {
  const ua = navigator.userAgent;
  let name = "Device";
  if (/iPhone/i.test(ua)) name = "iPhone";
  else if (/iPad/i.test(ua)) name = "iPad";
  else if (/Android/i.test(ua)) {
    const model = ua.match(/;\s*([^;)]+)\s+Build\//)?.[1];
    name = model ? model.trim() : "Android phone";
  } else if (/Macintosh/i.test(ua)) name = "Mac";
  else if (/Windows/i.test(ua)) name = "Windows computer";
  else if (/Linux/i.test(ua)) name = "Computer";
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return {
    name: standalone ? `${name} app` : `${name} browser`,
    platform: /iPhone|iPad/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "desktop",
    userAgent: ua.slice(0, 300),
  };
}

interface PairResponse {
  person?: Person;
  device_id?: string;
  otp_hash?: string;
  error?: string;
}

async function completePairing(result: PairResponse): Promise<Person> {
  if (result.error || !result.otp_hash || !result.person || !result.device_id) {
    throw new Error(result.error ?? "pairing_failed");
  }
  const { error } = await supabase().auth.verifyOtp({
    type: "magiclink",
    token_hash: result.otp_hash,
  });
  if (error) throw new Error("session_failed");
  localStorage.setItem(DEVICE_KEY, result.device_id);
  localStorage.setItem(PERSON_KEY, result.person);
  return result.person;
}

/** Redeem a one-time invite token and sign this device in. */
export async function redeemInvite(token: string): Promise<Person> {
  const { data, error } = await supabase().functions.invoke<PairResponse>("pair", {
    body: { action: "redeem", token, device: describeDevice() },
  });
  if (error) {
    const detail = await extractFunctionError(error);
    throw new Error(detail);
  }
  return completePairing(data ?? {});
}

/** Unlock with a person's PIN and sign this device in. */
export async function pinLogin(person: Person, pin: string): Promise<Person> {
  const { data, error } = await supabase().functions.invoke<PairResponse>("pair", {
    body: { action: "pin", person, pin, device: describeDevice() },
  });
  if (error) {
    const detail = await extractFunctionError(error);
    throw new Error(detail);
  }
  return completePairing(data ?? {});
}

/** Unlock with the shared secret phrase and sign this device in. */
export async function phraseLogin(person: Person, phrase: string): Promise<Person> {
  const normalized = phrase.toLowerCase().replace(/\s+/g, " ").trim();
  const { data, error } = await supabase().functions.invoke<PairResponse>("pair", {
    body: { action: "phrase", person, phrase: normalized, device: describeDevice() },
  });
  if (error) {
    const detail = await extractFunctionError(error);
    throw new Error(detail);
  }
  return completePairing(data ?? {});
}

async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      // fall through
    }
  }
  return "network_error";
}

export function pairingErrorMessage(code: string): string {
  switch (code) {
    case "invalid_token":
      return "That invite link is not valid anymore. Ask for a fresh one.";
    case "expired_token":
      return "That invite link has expired. Ask for a fresh one.";
    case "locked":
      return "Too many tries. Please wait 15 minutes and try again.";
    case "pin_not_set":
      return "No PIN is set up yet. Use an invite link instead.";
    case "wrong_pin":
      return "That PIN is not right. Try again.";
    case "wrong_phrase":
      return "That is not the secret password. Try again.";
    case "phrase_not_set":
      return "No secret password is set up yet.";
    case "network_error":
      return "Could not reach the server. Check your connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/**
 * Sign out this device and mark it revoked so it disappears from the list.
 *
 * The wipe is the point, not tidiness. This used to clear two localStorage keys
 * and the Supabase session and stop, leaving the whole IndexedDB read cache
 * sitting on the device: messages, memories, letters, moods, plans and the game
 * save, all under keys like "chat:messages" that are not scoped to a person and
 * so would have been read straight back by whoever signed in next. `idbWipe`
 * was written for exactly this, documented as "used when a device signs out",
 * and had no callers anywhere. Revoking a lost or stolen phone is the whole
 * reason the feature exists.
 */
export async function signOutDevice(): Promise<void> {
  const deviceId = storedDeviceId();
  try {
    if (deviceId) {
      await supabase().rpc("revoke_device", { device: deviceId });
    }
  } finally {
    localStorage.removeItem(DEVICE_KEY);
    localStorage.removeItem(PERSON_KEY);
    // Best effort: a device with no IndexedDB must still be able to sign out.
    await idbWipe().catch(() => {});
    await supabase().auth.signOut();
  }
}
