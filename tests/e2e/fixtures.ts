// Fixture data used to mock the Supabase REST API during visual tests.

export const CAMI_ID = "11111111-1111-4111-8111-111111111111";
export const JOSEPH_ID = "11240c34-ac31-4a8e-8a33-b2adac5bf7c8";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
// Same convention as the server tick: the couple-timezone date, matching
// the fixture couple row and the pinned timezoneId in playwright.config.
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export const fixtures: Record<string, unknown[]> = {
  profiles: [
    {
      id: JOSEPH_ID, person: "joseph", display_name: "Joseph", avatar_path: null,
      birthday: "2007-03-12", last_seen_at: iso(30_000), created_at: iso(86400000 * 90),
    },
    {
      id: CAMI_ID, person: "cami", display_name: "Cami", avatar_path: null,
      birthday: "2007-08-25", last_seen_at: iso(120_000), created_at: iso(86400000 * 90),
    },
  ],
  couple: [
    { id: 1, start_date: "2025-11-20", timezone: "America/New_York", welcome_dismissed_by: [], created_at: iso(86400000 * 90) },
  ],
  devices: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", person: "joseph", name: "Pixel browser",
      platform: "android", user_agent: "test", paired_at: iso(86400000 * 30),
      last_active_at: iso(60_000), revoked_at: null,
    },
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", person: "cami", name: "iPhone app",
      platform: "ios", user_agent: "test", paired_at: iso(86400000 * 28),
      last_active_at: iso(400_000), revoked_at: null,
    },
  ],
  messages: [
    {
      id: "aaaaaaa1-0000-4000-8000-000000000001", client_id: "c1", sender: "cami", kind: "text",
      body: "Good morning! I dreamed we opened that tiny bookshop again", media_path: null,
      media_meta: null, drawing_id: null, reply_to: null, created_at: iso(3_600_000),
      edited_at: null, deleted_at: null, delivered_at: iso(3_500_000), read_at: iso(3_400_000),
    },
    {
      id: "aaaaaaa1-0000-4000-8000-000000000002", client_id: "c2", sender: "joseph", kind: "text",
      body: "With the cat that judges everyone? Count me in", media_path: null,
      media_meta: null, drawing_id: null, reply_to: "aaaaaaa1-0000-4000-8000-000000000001",
      created_at: iso(3_000_000), edited_at: null, deleted_at: null,
      delivered_at: iso(2_900_000), read_at: iso(2_800_000),
    },
    {
      id: "aaaaaaa1-0000-4000-8000-000000000003", client_id: "c3", sender: "cami", kind: "text",
      body: "Call me after practice?", media_path: null, media_meta: null, drawing_id: null,
      reply_to: null, created_at: iso(600_000), edited_at: null, deleted_at: null,
      delivered_at: iso(500_000), read_at: null,
    },
  ],
  message_reactions: [
    { message_id: "aaaaaaa1-0000-4000-8000-000000000002", person: "cami", reaction: "love", created_at: iso(2_700_000) },
  ],
  moods: [
    {
      id: "bbbbbbb1-0000-4000-8000-000000000001", person: "cami", mood: "happy", custom_label: null,
      intensity: 4, note: "Aced my quiz today", would_help: null, visible: true,
      expires_at: null, cleared_at: null, created_at: iso(7_200_000),
    },
    {
      id: "bbbbbbb1-0000-4000-8000-000000000002", person: "joseph", mood: "tired", custom_label: null,
      intensity: 3, note: "Long practice", would_help: "A voice note from you", visible: true,
      expires_at: null, cleared_at: null, created_at: iso(5_400_000),
    },
  ],
  questions: [
    {
      id: "ccccccc1-0000-4000-8000-000000000001", category: "memories",
      prompt: "Which small moment together do you replay in your head the most?",
      kind: "open", option_a: null, option_b: null, created_by: null, created_at: iso(86400000 * 10),
    },
  ],
  daily_questions: [
    {
      id: "ddddddd1-0000-4000-8000-000000000001",
      question_id: "ccccccc1-0000-4000-8000-000000000001",
      for_date: today, skipped: false, created_at: iso(30_000_000),
      questions: {
        id: "ccccccc1-0000-4000-8000-000000000001", category: "memories",
        prompt: "Which small moment together do you replay in your head the most?",
        kind: "open", option_a: null, option_b: null, created_by: null, created_at: iso(86400000 * 10),
      },
      question: {
        id: "ccccccc1-0000-4000-8000-000000000001", category: "memories",
        prompt: "Which small moment together do you replay in your head the most?",
        kind: "open", option_a: null, option_b: null, created_by: null, created_at: iso(86400000 * 10),
      },
      answers: [{ person: "cami" }],
    },
  ],
  answers: [
    {
      id: "eeeeeee1-0000-4000-8000-000000000001",
      daily_question_id: "ddddddd1-0000-4000-8000-000000000001",
      person: "cami", answer: "The night we watched the meteor shower from the car hood.",
      guess: null, revealed_early: false, created_at: iso(20_000_000),
    },
  ],
  question_favorites: [],
  memories: [
    {
      id: "fffffff1-0000-4000-8000-000000000001", kind: "note", title: "Welcome to our little world",
      caption: "This is the very first memory in here. Add photos, letters, drawings, and moments you never want to forget.",
      media_path: null, media_meta: null, drawing_id: null, letter_id: null,
      happened_on: today, location: null, created_by: "joseph",
      created_at: iso(86_400_000), edited_at: null,
    },
    {
      id: "fffffff1-0000-4000-8000-000000000002", kind: "milestone", title: "100 days together",
      caption: "An automatic milestone from your relationship day counter.",
      media_path: null, media_meta: null, drawing_id: null, letter_id: null,
      happened_on: "2026-02-28", location: null, created_by: "joseph",
      created_at: iso(86_400_000 * 30), edited_at: null,
    },
  ],
  memory_comments: [],
  memory_favorites: [{ memory_id: "fffffff1-0000-4000-8000-000000000002", person: "cami", created_at: iso(86_400_000 * 29) }],
  letters: [
    {
      id: "1111aaa1-0000-4000-8000-000000000001", author: "cami", kind: "open_when",
      title: null, body: "Open this when you miss me and remember the meteor night.",
      open_when_label: "you miss me", unlock_at: null, unlock_notified: false,
      opened_at: null, created_at: iso(86_400_000 * 3),
    },
  ],
  signals: [
    {
      id: "2222aaa1-0000-4000-8000-000000000001", from_person: "cami", kind: "thinking_of_you",
      note: null, acknowledged_at: null, created_at: iso(1_800_000),
    },
  ],
  gratitude: [
    { id: "3333aaa1-0000-4000-8000-000000000001", person: "joseph", body: "Grateful for your good-morning texts", created_at: iso(86_400_000 * 2) },
  ],
  events: [
    {
      id: "4444aaa1-0000-4000-8000-000000000001", title: "Ice cream and the pier", kind: "date",
      starts_at: new Date(now + 86400000 * 3).toISOString(), ends_at: null, all_day: false,
      location: "The boardwalk", notes: "Bring a hoodie", attachment_path: null,
      recurrence: "none", remind_minutes: 60, reminded_at: null, created_by: "joseph",
      created_at: iso(86_400_000),
    },
  ],
  event_rsvps: [
    { event_id: "4444aaa1-0000-4000-8000-000000000001", person: "joseph", status: "yes", created_at: iso(86_000_000) },
  ],
  list_items: [
    {
      id: "5555aaa1-0000-4000-8000-000000000001", category: "bucket", title: "Watch a sunrise on the beach",
      notes: null, status: "idea", planned_event_id: null, completed_at: null,
      created_by: "cami", created_at: iso(86_400_000 * 5),
    },
    {
      id: "5555aaa1-0000-4000-8000-000000000002", category: "date_idea", title: "Cook a dish from a random country",
      notes: "Spin a globe", status: "idea", planned_event_id: null, completed_at: null,
      created_by: "joseph", created_at: iso(86_400_000 * 4),
    },
  ],
  list_votes: [
    { item_id: "5555aaa1-0000-4000-8000-000000000002", person: "cami", created_at: iso(86_400_000 * 3) },
  ],
  locations: [],
  push_subscriptions: [],
  notification_prefs: [
    {
      person: "joseph",
      categories: {
        messages: true, drawings: true, moods: true, thinking_of_you: true,
        questions: true, answers: true, letters: true, events: true,
        milestones: true, arrivals: true, plans: true,
      },
      quiet_start: null, quiet_end: null, private_previews: true, updated_at: iso(0),
    },
  ],
  person_settings: [
    { person: "joseph", settings: {}, updated_at: iso(0) },
  ],
  deletion_requests: [],
  love_taps: Array.from({ length: 14 }, (_, i) => ({
    id: `7777aaa1-0000-4000-8000-${String(i).padStart(12, "0")}`,
    person: i % 3 === 0 ? "joseph" : "cami",
    created_at: iso(i * 3_600_000),
  })),
  drawings: [
    {
      id: "6666aaa1-0000-4000-8000-000000000001", caption: "Us as penguins",
      strokes: [
        { color: "#43273B", size: 0.012, points: [[0.3, 0.3], [0.35, 0.5], [0.4, 0.6], [0.45, 0.55]] },
        { color: "#8F4560", size: 0.02, points: [[0.55, 0.35], [0.6, 0.45], [0.68, 0.5]] },
      ],
      background: "plain", preview_path: null, created_by: "cami", is_shared: true,
      created_at: iso(86_400_000 * 2), updated_at: iso(43_200_000),
    },
  ],
};
