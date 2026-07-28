# Cami & Joseph

Our little world. A private, installable couples app built exclusively for
two people: Cami and Joseph.

## What it is

A Progressive Web App with real-time chat, shared drawings, mood check-ins,
daily couple questions, a shared memory timeline, letters, planning tools,
consent-based location sharing, web push notifications, and the Love Jar: a
full clicking and incremental game with pets, upgrades, rebirths and
ascensions. There is no public registration, no user search, and no
third-party trackers. Every row in the database is protected by Row Level
Security that only the two members can pass.

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS 4, deployed on Vercel
- Supabase: Postgres + RLS, Realtime, Storage, Auth, Edge Functions, pg_cron
- Web Push with VAPID (no third-party push service)

## Offline

The app is local-first. Reads go through an IndexedDB cache that paints the
last known good data immediately and reconciles with the server afterwards,
so a screen you have opened before still works with no connection. Writes go
into a durable outbox (also IndexedDB) that survives reloads and crashes,
retries with backoff, and carries a client generated id so a retry after a
dropped response can never apply the same action twice. The sync state is
visible in a single badge in the top bar; nothing appears at all while
everything is synced.

What works offline: the Love Jar in full, answering and editing the daily
question, favourites, writing questions and packs, dropping a heart in the
shared jar, sharing a mood, adding a memory or letter, and sending a text
message. What needs a connection: uploading media, swapping the daily
question (it changes shared state), and anything the server has to arbitrate.

## The Love Jar

`src/game` is a self-contained incremental game. It has no dependency on the
rest of the app: the couples features drop notes into a small inbox
(`src/game/rewards-inbox.ts`) and the game grants a capped daily bonus for
them the next time it opens. Nothing in the game requires the other person to
have played.

- `config/` is data: currencies, eleven upgrade trees, abilities, thirty
  pets, charms and set bonuses, worlds, bosses, challenges, missions,
  achievements, collections, events and the shop.
- `formulas.ts` turns everything owned into one `Derived` stat block.
- `engine.ts` and `actions.ts` are pure functions over a save.
- `store.tsx` is the only React-aware file: it runs the tick loop, saves
  locally every few seconds, and queues a server batch every minute.
- `persistence.ts` reconciles the local save with the server's copy.

The server owns anything permanent or comparable. `game_sync` is idempotent
per batch, measures elapsed time from its own clock, rejects impossible click
rates and any counter that moves backwards, and writes an audit row when it
does. Old `love_taps` rows are preserved and converted into starting progress
exactly once per person by `game_claim_legacy`.

## Architecture notes

- The browser talks to Supabase directly with the anon key; RLS does the
  enforcement. There are no Next.js API routes and no server secrets in the
  frontend or on Vercel.
- Privileged operations live in Supabase Edge Functions, which receive the
  service role key from the platform:
  - `pair`: redeems one-time invite tokens or verifies a PIN, registers the
    device, and mints a session (magic-link OTP hash, verified client-side).
  - `couple-admin`: create invites, set PIN, sign out everywhere, export all
    data, two-person deletion flow.
  - `notify`: sends web push to the partner. Enforces per-category
    preferences, quiet hours, private previews, and dedupe.
  - `tick`: runs every 5 minutes via pg_cron + pg_net. Creates the daily
    question, unlocks scheduled letters, sends event reminders, records
    milestone memories, and cleans up expired data.
- Secrets (VAPID private key, tick secret, PIN hashes) live in the `private`
  schema, unreachable through the API; edge functions access them through
  `security definer` functions granted only to `service_role`.
- Invite tokens are random 256-bit values stored only as SHA-256 hashes.
  The raw token travels once, in the URL fragment of the invite link.
- Sessions persist in localStorage with automatic refresh. Devices are
  registered rows; revoking a device deletes its push subscription and the
  app signs itself out via realtime + a startup check. "Sign out everywhere"
  deletes the person's refresh tokens server-side.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL, anon key, VAPID public key
npm run dev
```

Migrations are in `supabase/migrations/` (apply in order). Edge functions
are in `supabase/functions/` (deploy with the Supabase CLI or MCP). After
deploying, insert the required config rows into `private.app_config`:
`vapid_public`, `vapid_private`, `vapid_subject`, `tick_secret`, `tick_url`.

## Tests

```bash
npm test            # vitest unit tests
npx playwright test # visual/interaction checks with mocked backend
```

## Environment variables (all public)

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS enforced) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push public key |

The service role key is never used outside Supabase's own infrastructure.

## Honest limitations

- iPhone requires installing the PWA to the Home Screen before notifications
  can be enabled (an iOS platform rule).
- Location sharing only updates while the app is open. A web app cannot and
  should not track anyone in the background, and this one never tries to.
- "Share until tonight" and similar windows expire automatically server-side.
- Media uploads need a connection. Text, drawings-in-progress and game
  actions are queued offline; photos, videos and voice notes are not.
- The Love Jar simulates on the client, because it has to in order to play
  offline. The server validates and clamps rather than re-simulating, so it
  catches implausible progress rather than proving every heart.
- Numbers are IEEE doubles with a hard ceiling of 1e300. The progression is
  tuned so that is end-of-content rather than something you trip over.
