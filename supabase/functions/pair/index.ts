// Device pairing: redeem a one-time invite token or unlock with a PIN.
// verify_jwt is disabled because callers are not signed in yet; every path
// requires either a valid invite token or a correct PIN, both rate limited.

import { createClient } from "npm:@supabase/supabase-js@2";

const PEOPLE = ["cami", "joseph"] as const;
type Person = (typeof PEOPLE)[number];

const EMAILS: Record<Person, string> = {
  cami: "cami@camijoseph.private",
  joseph: "joseph@camijoseph.private",
};

const DISPLAY: Record<Person, string> = { cami: "Cami", joseph: "Joseph" };

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

// Create the two fixed accounts on first use. Idempotent.
async function ensurePerson(admin: ReturnType<typeof adminClient>, person: Person): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("person", person)
    .maybeSingle();
  if (profile) return profile.id;

  const password = crypto.randomUUID() + crypto.randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAILS[person],
    password,
    email_confirm: true,
    user_metadata: { person },
  });
  let userId = created?.user?.id;
  if (error) {
    // The user may already exist from a concurrent call; look it up.
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users?.find((u) => u.email === EMAILS[person])?.id;
    if (!userId) throw error;
  }
  await admin.from("profiles").upsert({
    id: userId,
    person,
    display_name: DISPLAY[person],
  }, { onConflict: "person" });
  return userId!;
}

async function mintSession(admin: ReturnType<typeof adminClient>, person: Person) {
  await ensurePerson(admin, person);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAILS[person],
  });
  if (error || !data.properties?.hashed_token) {
    throw error ?? new Error("could not mint session");
  }
  return data.properties.hashed_token;
}

async function registerDevice(
  admin: ReturnType<typeof adminClient>,
  person: Person,
  device: { name?: string; platform?: string; userAgent?: string },
): Promise<string> {
  const { data, error } = await admin
    .from("devices")
    .insert({
      person,
      name: (device?.name || "New device").slice(0, 80),
      platform: (device?.platform || "").slice(0, 80),
      user_agent: (device?.userAgent || "").slice(0, 300),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const admin = adminClient();
  const action = body.action as string;

  try {
    if (action === "redeem") {
      const token = String(body.token ?? "");
      if (token.length < 20 || token.length > 200) {
        return json({ error: "invalid_token" }, 400);
      }
      const tokenHash = await sha256hex(token);
      const { data: invite } = await admin
        .from("invites")
        .select("id, person, used_at, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!invite || invite.used_at) return json({ error: "invalid_token" }, 400);
      if (new Date(invite.expires_at) < new Date()) {
        return json({ error: "expired_token" }, 400);
      }

      const person = invite.person as Person;
      const deviceId = await registerDevice(admin, person, body.device as never ?? {});

      // Mark used atomically; only proceed when this call won the race.
      const { data: claimed } = await admin
        .from("invites")
        .update({ used_at: new Date().toISOString(), used_by_device: deviceId })
        .eq("id", invite.id)
        .is("used_at", null)
        .select("id");
      if (!claimed || claimed.length === 0) {
        await admin.from("devices").delete().eq("id", deviceId);
        return json({ error: "invalid_token" }, 400);
      }

      const otpHash = await mintSession(admin, person);
      return json({ person, device_id: deviceId, otp_hash: otpHash });
    }

    if (action === "pin") {
      const person = String(body.person) as Person;
      const pin = String(body.pin ?? "");
      if (!PEOPLE.includes(person)) return json({ error: "invalid_person" }, 400);
      if (!/^\d{4,8}$/.test(pin)) return json({ error: "invalid_pin" }, 400);

      const { data: result, error } = await admin.rpc("admin_pin_check", {
        p: person,
        pin,
      });
      if (error) throw error;
      if (result === "locked") return json({ error: "locked" }, 429);
      if (result === "unset") return json({ error: "pin_not_set" }, 400);
      if (result !== "ok") return json({ error: "wrong_pin" }, 401);

      const deviceId = await registerDevice(admin, person, body.device as never ?? {});
      const otpHash = await mintSession(admin, person);
      return json({ person, device_id: deviceId, otp_hash: otpHash });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("pair error", err);
    return json({ error: "server_error" }, 500);
  }
});
