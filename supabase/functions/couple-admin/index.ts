// Authenticated member actions that need the service role: creating invites,
// setting a PIN, signing out everywhere, exporting data, and the two-person
// deletion flow. verify_jwt is enabled; we additionally resolve the caller
// to one of the two members before doing anything.

import { createClient } from "npm:@supabase/supabase-js@2";

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

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const EXPORT_TABLES = [
  "profiles", "couple", "messages", "message_reactions", "moods",
  "drawings", "memories", "memory_comments", "memory_favorites", "letters",
  "signals", "gratitude", "events", "event_rsvps", "list_items",
  "list_votes", "questions", "daily_questions", "answers",
  "question_favorites", "locations", "devices", "love_taps",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();

  // Resolve caller to a member.
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
  const partner: Person = me === "cami" ? "joseph" : "cami";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  try {
    switch (body.action) {
      case "create-invite": {
        const forPerson = String(body.for_person) as Person;
        if (!PEOPLE.includes(forPerson)) return json({ error: "invalid_person" }, 400);
        const token = randomToken();
        const tokenHash = await sha256hex(token);
        const { error } = await admin.from("invites").insert({
          token_hash: tokenHash,
          person: forPerson,
          created_by: me,
        });
        if (error) throw error;
        return json({ token, for_person: forPerson });
      }

      case "set-pin": {
        const pin = String(body.pin ?? "");
        if (!/^\d{4,8}$/.test(pin)) {
          return json({ error: "PIN must be 4 to 8 digits" }, 400);
        }
        const { error } = await admin.rpc("admin_pin_set", { p: me, pin });
        if (error) throw error;
        return json({ ok: true });
      }

      case "set-phrase": {
        const phrase = String(body.phrase ?? "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (phrase.length < 8 || phrase.length > 200) {
          return json({ error: "The secret password needs at least 8 characters" }, 400);
        }
        const { error } = await admin.rpc("admin_phrase_set", { phrase });
        if (error) throw error;
        return json({ ok: true });
      }

      case "sign-out-everywhere": {
        const { error } = await admin.rpc("admin_sign_out_person", { target: me });
        if (error) throw error;
        return json({ ok: true });
      }

      case "export-data": {
        const dump: Record<string, unknown> = { exported_at: new Date().toISOString() };
        for (const table of EXPORT_TABLES) {
          const { data } = await admin.from(table).select("*").limit(10000);
          dump[table] = data ?? [];
        }
        return json(dump);
      }

      case "request-delete": {
        await admin.from("deletion_requests").upsert({ person: me });
        const { data: requests } = await admin.from("deletion_requests").select("person");
        const both = requests && requests.length >= 2;
        if (both) {
          const { error } = await admin.rpc("admin_wipe_couple");
          if (error) throw error;
          await admin.rpc("admin_sign_out_person", { target: me });
          await admin.rpc("admin_sign_out_person", { target: partner });
          return json({ deleted: true });
        }
        return json({ deleted: false, waiting_for: partner });
      }

      case "cancel-delete": {
        await admin.from("deletion_requests").delete().eq("person", me);
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (err) {
    console.error("couple-admin error", err);
    return json({ error: "server_error" }, 500);
  }
});
