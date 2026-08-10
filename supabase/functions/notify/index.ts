// Push delivery to the partner. Respects per-category preferences, quiet
// hours, and private previews. Deduplicates via a server-side log so the
// same event never produces two notifications.

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

const CATEGORIES = new Set([
  "messages", "drawings", "moods", "thinking_of_you", "questions",
  "answers", "letters", "events", "milestones", "arrivals", "plans",
]);

// Per-category rate limit (seconds): at most one push per category per
// recipient inside the window, so a burst of activity means one gentle
// nudge instead of twenty-one.
const THROTTLE: Record<string, number> = {
  messages: 180,
  thinking_of_you: 900,
  moods: 900,
  drawings: 600,
  arrivals: 300,
  plans: 900,
  questions: 0,
  answers: 0,
  letters: 0,
  events: 0,
  milestones: 0,
};

// Generic wording used when the recipient keeps previews private.
const GENERIC: Record<string, { title: string; body: string }> = {
  messages: { title: "Cami & Joseph", body: "A new message is waiting for you" },
  drawings: { title: "Cami & Joseph", body: "A new drawing was shared with you" },
  moods: { title: "Cami & Joseph", body: "A mood update was shared with you" },
  thinking_of_you: { title: "Cami & Joseph", body: "Someone is thinking of you" },
  questions: { title: "Cami & Joseph", body: "Today's question is ready" },
  answers: { title: "Cami & Joseph", body: "Your person answered today's question" },
  letters: { title: "Cami & Joseph", body: "A letter is waiting for you" },
  events: { title: "Cami & Joseph", body: "A plan on your calendar is coming up" },
  milestones: { title: "Cami & Joseph", body: "You reached a relationship milestone" },
  arrivals: { title: "Cami & Joseph", body: "An arrival update was shared" },
  plans: { title: "Cami & Joseph", body: "A shared plan was updated" },
};

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
  if (!CATEGORIES.has(category)) return json({ error: "invalid_category" }, 400);
  const dedupeKey = String(body.dedupe_key ?? "").slice(0, 200);
  if (!dedupeKey) return json({ error: "missing dedupe_key" }, 400);

  try {
    // Category preferences and quiet hours come first: nothing below may
    // consume the dedupe key unless a delivery is actually possible.
    const { data: prefs } = await admin
      .from("notification_prefs")
      .select("categories, quiet_start, quiet_end, private_previews")
      .eq("person", recipient)
      .maybeSingle();
    const cats = (prefs?.categories ?? {}) as Record<string, boolean>;
    if (cats[category] === false) return json({ sent: false, reason: "muted" });

    const { data: couple } = await admin
      .from("couple")
      .select("timezone")
      .eq("id", 1)
      .maybeSingle();
    if (inQuietHours(prefs?.quiet_start ?? null, prefs?.quiet_end ?? null, couple?.timezone ?? "America/New_York")) {
      return json({ sent: false, reason: "quiet_hours" });
    }

    const usePrivate = prefs?.private_previews !== false;
    const generic = GENERIC[category];
    const title = usePrivate ? generic.title : String(body.title ?? generic.title).slice(0, 120);
    const text = usePrivate ? generic.body : String(body.body ?? generic.body).slice(0, 300);
    const url = typeof body.url === "string" && body.url.startsWith("/") ? body.url : "/";

    const [{ data: subs }, vapidPub, vapidPriv, vapidSubj] = await Promise.all([
      admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("person", recipient),
      admin.rpc("admin_config_get", { k: "vapid_public" }),
      admin.rpc("admin_config_get", { k: "vapid_private" }),
      admin.rpc("admin_config_get", { k: "vapid_subject" }),
    ]);

    if (!subs || subs.length === 0) return json({ sent: false, reason: "no_subscriptions" });
    if (!vapidPub.data || !vapidPriv.data) return json({ sent: false, reason: "no_vapid" }, 500);

    // Never send the same notification twice, and rate limit per category.
    const key = `${category}:${dedupeKey}`;
    const { data: fresh, error: dedupeErr } = await admin.rpc("admin_notif_allow", {
      k: key,
      cat: category,
      rcpt: recipient,
      throttle_seconds: THROTTLE[category] ?? 0,
    });
    if (dedupeErr) throw dedupeErr;
    if (!fresh) return json({ sent: false, reason: "duplicate_or_throttled" });

    webpush.setVapidDetails(vapidSubj.data ?? "mailto:owner@example.com", vapidPub.data, vapidPriv.data);

    // A stable per-category tag lets repeat pushes coalesce in the tray;
    // the service worker sets renotify so replacements still alert.
    const payload = JSON.stringify({ title, body: text, url, tag: category });
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
        if (status === 404 || status === 410 || status === 403) {
          // Dead or mis-keyed subscription; the app re-registers on open.
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed", status);
        }
      }
    }
    if (delivered === 0) {
      // Give the event back so a later attempt can deliver it.
      await admin.rpc("admin_notif_forget", { k: key });
    }
    return json({ sent: delivered > 0, delivered });
  } catch (err) {
    console.error("notify error", err);
    return json({ error: "server_error" }, 500);
  }
});
