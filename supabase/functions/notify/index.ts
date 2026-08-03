// Push delivery to the partner. The only notification the app sends now is
// a typed note from one person to the other, so this function accepts just
// the "note" category and always delivers the typed text. Quiet hours and
// the per-category mute still apply; server-side dedupe prevents repeats.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const PEOPLE = ["cami", "joseph"] as const;
type Person = (typeof PEOPLE)[number];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function inQuietHours(
  quietStart: string | null,
  quietEnd: string | null,
  timezone: string,
): boolean {
  if (!quietStart || !quietEnd) return false;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const current = fmt.format(now);
  const cur = current.slice(0, 5);
  const start = quietStart.slice(0, 5);
  const end = quietEnd.slice(0, 5);
  if (start <= end) return cur >= start && cur < end;
  return cur >= start || cur < end; // window crosses midnight
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await admin
    .from("profiles")
    .select("person")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile) return json({ error: "unauthorized" }, 401);
  const me = profile.person as Person;
  const recipient: Person = me === "cami" ? "joseph" : "cami";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const category = String(body.category ?? "");
  if (category !== "note") return json({ error: "invalid_category" }, 400);
  const dedupeKey = String(body.dedupe_key ?? "").slice(0, 200);
  if (!dedupeKey) return json({ error: "missing dedupe_key" }, 400);
  const text = String(body.body ?? "").trim().slice(0, 300);
  if (!text) return json({ error: "missing body" }, 400);

  try {
    // Never send the same note twice.
    const { data: fresh, error: dedupeErr } = await admin.rpc("admin_notif_allow", {
      k: `note:${dedupeKey}`,
      cat: "note",
      rcpt: recipient,
      throttle_seconds: 0,
    });
    if (dedupeErr) throw dedupeErr;
    if (!fresh) return json({ sent: false, reason: "duplicate_or_throttled" });

    const { data: prefs } = await admin
      .from("notification_prefs")
      .select("categories, quiet_start, quiet_end")
      .eq("person", recipient)
      .maybeSingle();
    const cats = (prefs?.categories ?? {}) as Record<string, boolean>;
    if (cats.note === false) return json({ sent: false, reason: "muted" });

    const { data: couple } = await admin
      .from("couple")
      .select("timezone")
      .eq("id", 1)
      .maybeSingle();
    if (inQuietHours(prefs?.quiet_start ?? null, prefs?.quiet_end ?? null, couple?.timezone ?? "America/New_York")) {
      return json({ sent: false, reason: "quiet_hours" });
    }

    const [{ data: subs }, vapidPub, vapidPriv, vapidSubj] = await Promise.all([
      admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("person", recipient),
      admin.rpc("admin_config_get", { k: "vapid_public" }),
      admin.rpc("admin_config_get", { k: "vapid_private" }),
      admin.rpc("admin_config_get", { k: "vapid_subject" }),
    ]);

    if (!subs || subs.length === 0) return json({ sent: false, reason: "no_subscriptions" });
    if (!vapidPub.data || !vapidPriv.data) return json({ sent: false, reason: "no_vapid" }, 500);

    webpush.setVapidDetails(vapidSubj.data ?? "mailto:owner@example.com", vapidPub.data, vapidPriv.data);

    // A note is an intentional message, so the typed text is the payload.
    const payload = JSON.stringify({
      title: "Cami & Joseph",
      body: text,
      url: "/",
      tag: `note:${dedupeKey}`,
    });
    let delivered = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 3600 },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed", status);
        }
      }
    }
    return json({ sent: delivered > 0, delivered });
  } catch (err) {
    console.error("notify error", err);
    return json({ error: "server_error" }, 500);
  }
});
