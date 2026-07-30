# Cami & Joseph

Our little world. A private, installable couples app built exclusively for
two people: Cami and Joseph.

## Status: closed

The app is over. Every route now renders `src/components/breakup.tsx`: the
heart breaks, the screen goes black, and it says "maybe in another life...".
The root layout (`src/app/layout.tsx`) renders that component instead of the
routed children, so nothing below it is reachable. The rest of the code and
the database are untouched and still here, just not wired up to anything.
Tapping the word "life" on the black screen replays the animation.

The rest of this file describes the app as it was.

## What it is

A Progressive Web App with real-time chat, shared drawings, mood check-ins,
daily couple questions, a shared memory timeline, letters, planning tools,
consent-based location sharing, web push notifications, and the Love Jar: a
full incremental game about tapping a jar, with a chain that fills it,
rebirths, otters and crabs, and time dilation at the end of it. There is no public registration, no user search, and no
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

Who the two of you are is cached too. Every screen sits behind
`CoupleProvider`, so without that the whole app waits on a spinner however
well each screen caches its own data.

A request that reaches the server resolves with an error; one that cannot
reach it at all rejects, and one over a dead socket does neither. All three
go through `settled()`, which flattens them into one shape and puts a
deadline on the third, because a screen that gates its render on a request
that never finishes has no way out.

Works offline:

| Screen | Reads | Writes |
| --- | --- | --- |
| Love Jar | yes | yes, in full |
| Questions | yes | answer, edit, favourite, write questions and packs |
| Chat | yes | send text, edit, delete, react |
| Moods | yes | share a mood, clear it, send support or space |
| Memories | yes | add a written memory, edit, delete, favourite |
| Letters | yes | write and send, delete, add gratitude |
| Plans | yes | events, bucket list, to-dos, votes, replies |
| Home, Us | yes | signals |

Needs a connection: uploading photos, videos and voice notes; swapping the
daily question, because it changes shared state; and anything else the server
has to arbitrate. A memory or message whose text is written offline is queued
and sent later, but one carrying a photo waits for a connection.

## The Love Jar

`src/game` is a self-contained incremental game. It has no dependency on the
rest of the app: the couples features drop notes into a small inbox
(`src/game/rewards-inbox.ts`) and the game grants a capped daily bonus for
them the next time it opens. Nothing in the game requires the other person to
have played.

- `config/` is data: eight currencies, three upgrade trees, abilities, seven
  otters and seven crabs, the rocks and shells they carry, ten vessels,
  drifters, memories and trips, challenges, missions, achievements and
  collections.
- `formulas.ts` turns everything owned into one `Derived` stat block.
- `engine.ts` and `actions.ts` are pure functions over a save.
- `store.tsx` is the only React-aware file: it runs the tick loop, saves
  locally every few seconds, and queues a server batch every minute.
- `persistence.ts` reconciles the local save with the server's copy.

Three rules hold the shape of it together:

- **Hearts come from the jar.** Tapping it, and the chain of tiers that fills
  it. Creatures make no hearts at all; they pay in shells, sea glass and
  pearls, and in the multipliers they carry. They were the single largest
  source of passive hearts once, which quietly made "own more otters" the
  fastest route to everything and left the jar as scenery.
- **Rebirth clears the chain.** Everything bought with hearts, every
  deepening, every tier. Without that a rebirth is free, the loop feeds
  itself, and the numbers leave the range of a double in under half an hour.
- **Nothing is on screen until it is yours.** Eleven stages keyed to lifetime
  hearts, each revealing one thing and explaining it when it arrives. The
  first run is a jar and a heart.

Time dilation is the last of them: a switch that raises everything the jar
produces to a power below one, and pays hours for how far you get anyway. It
is the only mechanic here that is worse than not having it until the tree it
pays for is a few hours deep.

The server stores the save and does not check it. There are two accounts and
no leaderboard, so the validation layer that used to sit here was pure
overhead and is gone. Old `love_taps` rows are still converted into starting
progress exactly once per person by `game_claim_legacy`.

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
  offline, and the server stores the result without checking it. There are
  two accounts and no leaderboard, so the only person anyone could cheat is
  themselves.
- A request that hangs rather than failing is given eight seconds before the
  cached copy is shown instead. On a genuinely slow connection that means a
  screen can go stale for a moment before refreshing.
- Numbers are IEEE doubles with a hard ceiling of about 1.8e308, and the game
  has no big-number type. That is fine because rebirth clears the production
  chain, so a single life is bounded and the count of lives is what grows;
  every reset requirement is capped well under the ceiling so no rung can
  become unreachable. The consequence is a plateau rather than an ending: past
  roughly a hundred and fifty rebirths the bar stops rising and only the
  counter moves. Simulated at perfect, uninterrupted play that is about four
  hours; at a human pace it is weeks. Going past it would need a
  mantissa-and-exponent number type throughout.
- Save version 7 threw away every earlier save, locally and on the server
  (`supabase/migrations/0011_reset_progress.sql`). Everything outside the jar
  was untouched. Anything older than `RESET_SAVES_BEFORE` is discarded rather
  than migrated, so the conversion code for the version 3 and 5 shapes is now
  unreachable; it is kept because it costs nothing and documents what those
  saves looked like.
