// Scheduled worker, invoked by pg_cron every five minutes. Handles the
// daily question, letter unlocks, event reminders, milestones, and cleanup.
// Protected by a shared secret held in private.app_config.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Person = "cami" | "joseph";
const PEOPLE: Person[] = ["cami", "joseph"];

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type Admin = ReturnType<typeof adminClient>;

function todayIn(timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function inQuietHours(
  quietStart: string | null,
  quietEnd: string | null,
  timezone: string,
): boolean {
  if (!quietStart || !quietEnd) return false;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const cur = fmt.format(new Date()).slice(0, 5);
  const start = quietStart.slice(0, 5);
  const end = quietEnd.slice(0, 5);
  if (start <= end) return cur >= start && cur < end;
  return cur >= start || cur < end; // window crosses midnight
}

let vapidReady = false;
async function ensureVapid(admin: Admin): Promise<boolean> {
  if (vapidReady) return true;
  const [pub, priv, subj] = await Promise.all([
    admin.rpc("admin_config_get", { k: "vapid_public" }),
    admin.rpc("admin_config_get", { k: "vapid_private" }),
    admin.rpc("admin_config_get", { k: "vapid_subject" }),
  ]);
  if (!pub.data || !priv.data) return false;
  webpush.setVapidDetails(subj.data ?? "mailto:owner@example.com", pub.data, priv.data);
  vapidReady = true;
  return true;
}

let coupleTimezone = "America/New_York";

// Returns true when at least one push was delivered. Checks that cannot
// succeed later (mute) bail before the dedupe key is taken; checks that
// can (quiet hours, no subscriptions yet, push errors) either bail before
// the key or roll it back, so the event retries on a later tick instead
// of being silently destroyed.
async function sendToPerson(
  admin: Admin,
  person: Person,
  category: string,
  dedupeKey: string,
  title: string,
  text: string,
  url: string,
): Promise<boolean> {
  const { data: prefs } = await admin
    .from("notification_prefs")
    .select("categories, quiet_start, quiet_end, private_previews")
    .eq("person", person)
    .maybeSingle();
  const cats = (prefs?.categories ?? {}) as Record<string, boolean>;
  if (cats[category] === false) return false;

  // Deferred, not destroyed: the next tick after quiet hours delivers it.
  if (inQuietHours(prefs?.quiet_start ?? null, prefs?.quiet_end ?? null, coupleTimezone)) {
    return false;
  }

  if (!(await ensureVapid(admin))) return false;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("person", person);
  if (!subs || subs.length === 0) return false;

  const key = `${category}:${person}:${dedupeKey}`;
  const { data: fresh } = await admin.rpc("admin_notif_dedupe", { k: key });
  if (!fresh) return false;

  const usePrivate = prefs?.private_previews !== false;
  const payload = JSON.stringify({
    title: usePrivate ? "Cami & Joseph" : title,
    body: usePrivate ? genericBody(category) : text,
    url,
    tag: category,
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
      if (status === 404 || status === 410 || status === 403) {
        // Dead or mis-keyed subscription; the app re-registers on next open.
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("tick push send failed", status);
      }
    }
  }
  if (delivered === 0) {
    await admin.rpc("admin_notif_forget", { k: key });
    return false;
  }
  return true;
}

function genericBody(category: string): string {
  switch (category) {
    case "questions": return "Today's question is ready";
    case "answers": return "Both answers are ready to read";
    case "letters": return "A letter just unlocked for you";
    case "events": return "A plan on your calendar is coming up";
    case "milestones": return "You reached a relationship milestone";
    default: return "Something new is waiting for you";
  }
}

async function rotateDailyQuestion(admin: Admin, today: string) {
  const { data: existing } = await admin
    .from("daily_questions")
    .select("id")
    .eq("for_date", today)
    .maybeSingle();
  if (existing) return;

  // Prefer questions that have never been used, counting the ones a skip
  // replaced so a skipped question does not come straight back.
  const { data: used } = await admin
    .from("daily_questions")
    .select("question_id, replaced_question_id");
  const usedIds = new Set<string>();
  for (const r of used ?? []) {
    usedIds.add(r.question_id);
    if (r.replaced_question_id) usedIds.add(r.replaced_question_id);
  }
  const { data: all } = await admin.from("questions").select("id");
  if (!all || all.length === 0) return;
  const unused = all.filter((q) => !usedIds.has(q.id));
  const pool = unused.length > 0 ? unused : all;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  const { error } = await admin
    .from("daily_questions")
    .insert({ question_id: pick.id, for_date: today });
  if (error) {
    // A concurrent tick winning the unique(for_date) race is fine; anything
    // else should be visible in the job results instead of silent.
    if (error.code === "23505") return;
    throw error;
  }

  for (const person of PEOPLE) {
    await sendToPerson(
      admin, person, "questions", `daily-${today}`,
      "Cami & Joseph", "Today's question is ready", "/questions",
    );
  }
}

async function notifyBothAnswered(admin: Admin) {
  const { data: recent } = await admin
    .from("daily_questions")
    .select("id, answers(person)")
    .gte("created_at", new Date(Date.now() - 3 * 86400000).toISOString());
  for (const dq of recent ?? []) {
    const answers = (dq.answers ?? []) as { person: Person }[];
    if (answers.length >= 2) {
      for (const person of PEOPLE) {
        await sendToPerson(
          admin, person, "answers", `both-${dq.id}`,
          "Cami & Joseph", "Both answers are ready to read", "/questions",
        );
      }
    }
  }
}

async function unlockLetters(admin: Admin) {
  const { data: due } = await admin
    .from("letters")
    .select("id, author, title")
    .eq("kind", "scheduled")
    .eq("unlock_notified", false)
    .lte("unlock_at", new Date().toISOString());
  for (const letter of due ?? []) {
    const recipient: Person = letter.author === "cami" ? "joseph" : "cami";
    const delivered = await sendToPerson(
      admin, recipient, "letters", `unlock-${letter.id}`,
      "Cami & Joseph", "A letter just unlocked for you", "/letters",
    );
    // Only mark it announced when the push actually went out, so a letter
    // unlocking while the recipient has no subscription retries later.
    if (delivered) {
      await admin.from("letters").update({ unlock_notified: true }).eq("id", letter.id);
    }
  }
}

async function remindEvents(admin: Admin) {
  const now = Date.now();
  const { data: upcoming } = await admin
    .from("events")
    .select("id, title, starts_at, remind_minutes, reminded_at")
    .not("remind_minutes", "is", null)
    .is("reminded_at", null)
    .gte("starts_at", new Date(now - 3600000).toISOString())
    .lte("starts_at", new Date(now + 14 * 86400000).toISOString());
  for (const ev of upcoming ?? []) {
    const remindAt = new Date(ev.starts_at).getTime() - ev.remind_minutes * 60000;
    if (remindAt <= now) {
      let delivered = false;
      for (const person of PEOPLE) {
        const ok = await sendToPerson(
          admin, person, "events", `remind-${ev.id}`,
          "Cami & Joseph", `Coming up: ${ev.title}`, "/plans",
        );
        delivered = delivered || ok;
      }
      if (delivered) {
        await admin.from("events").update({ reminded_at: new Date().toISOString() }).eq("id", ev.id);
      }
    }
  }
}

const DAY_MILESTONES = [50, 100, 200, 300, 365, 500, 730, 1000, 1095, 1460, 1825];

async function checkMilestones(admin: Admin, today: string) {
  const { data: couple } = await admin
    .from("couple")
    .select("start_date")
    .eq("id", 1)
    .maybeSingle();
  if (!couple?.start_date) return;

  const start = new Date(couple.start_date + "T00:00:00Z");
  const todayDate = new Date(today + "T00:00:00Z");
  // Match the app's visible counter, which calls the start date "Day 1":
  // the "100 days together" memory lands on the day the badge reads 100.
  const days = Math.floor((todayDate.getTime() - start.getTime()) / 86400000) + 1;
  if (days <= 1) return;

  const hits: { key: string; label: string }[] = [];
  if (DAY_MILESTONES.includes(days)) {
    hits.push({ key: `days-${days}`, label: `${days} days together` });
  }
  // Month and year anniversaries measured on the same day-of-month.
  const monthsApart = (todayDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (todayDate.getUTCMonth() - start.getUTCMonth());
  if (todayDate.getUTCDate() === start.getUTCDate() && monthsApart > 0) {
    if (monthsApart % 12 === 0) {
      const years = monthsApart / 12;
      hits.push({ key: `years-${years}`, label: years === 1 ? "One year together" : `${years} years together` });
    } else if (monthsApart === 6) {
      hits.push({ key: "months-6", label: "Six months together" });
    }
  }

  for (const hit of hits) {
    const { data: fresh } = await admin.rpc("admin_milestone_mark", { k: hit.key });
    if (!fresh) continue;
    await admin.from("memories").insert({
      kind: "milestone",
      title: hit.label,
      caption: "An automatic milestone from your relationship day counter.",
      happened_on: today,
      created_by: "joseph",
    });
    for (const person of PEOPLE) {
      await sendToPerson(
        admin, person, "milestones", hit.key,
        "Cami & Joseph", hit.label, "/memories",
      );
    }
  }
}

async function cleanup(admin: Admin) {
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  // Expired locations linger for at most 24 hours, then are removed.
  await admin.from("locations").delete().lt("expires_at", dayAgo);
  // Expired moods get cleared automatically.
  await admin
    .from("moods")
    .update({ cleared_at: new Date().toISOString() })
    .is("cleared_at", null)
    .lt("expires_at", new Date().toISOString());
  await admin.rpc("admin_config_set", { k: "last_tick", v: new Date().toISOString() });
  // Trim server logs that are no longer needed.
  await admin.from("invites").delete().lt("expires_at", weekAgo).is("used_at", null);
  await admin.rpc("admin_notif_purge", { keep_days: 30 });
}

Deno.serve(async (req: Request) => {
  const admin = adminClient();
  const provided = req.headers.get("x-tick-secret") ?? "";
  const { data: expected } = await admin.rpc("admin_config_get", { k: "tick_secret" });
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { data: couple } = await admin.from("couple").select("timezone").eq("id", 1).maybeSingle();
  coupleTimezone = couple?.timezone ?? "America/New_York";
  const today = todayIn(coupleTimezone);

  const results: Record<string, string> = {};
  const jobs: [string, () => Promise<void>][] = [
    ["daily_question", () => rotateDailyQuestion(admin, today)],
    ["both_answered", () => notifyBothAnswered(admin)],
    ["letters", () => unlockLetters(admin)],
    ["events", () => remindEvents(admin)],
    ["milestones", () => checkMilestones(admin, today)],
    ["cleanup", () => cleanup(admin)],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
      results[name] = "ok";
    } catch (err) {
      console.error(`tick job ${name} failed`, err);
      results[name] = "error";
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
