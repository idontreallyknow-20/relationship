import { supabase } from "./supabase";
import { storedDeviceId } from "./pairing";
import { VAPID_PUBLIC_KEY } from "./public-config";
import type { Person } from "./types";

function base64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIos(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** iPhones only allow web push once the app is installed to the Home Screen. */
export function pushAvailableNow(): boolean {
  if (!pushSupported()) return false;
  if (isIos() && !isStandalone()) return false;
  return true;
}

export type PushStatus = "granted" | "denied" | "unavailable" | "default";

export function pushStatus(): PushStatus {
  if (!pushAvailableNow()) return "unavailable";
  return Notification.permission as PushStatus;
}

/**
 * Request permission (must be called from a user gesture) and store the
 * subscription server-side for this person and device.
 */
export async function enablePush(person: Person): Promise<boolean> {
  if (!pushAvailableNow()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8(VAPID_PUBLIC_KEY) as BufferSource,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const { error } = await supabase().from("push_subscriptions").upsert(
    {
      person,
      device_id: storedDeviceId(),
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  return !error;
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  }
}
