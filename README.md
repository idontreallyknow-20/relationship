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
consent-based location sharing, and web push notifications. There is no
public registration, no user search, and no third-party trackers. Every row
in the database is protected by Row Level Security that only the two members
can pass.

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS 4, deployed on Vercel
- Supabase: Postgres + RLS, Realtime, Storage, Auth, Edge Functions, pg_cron
- Web Push with VAPID (no third-party push service)

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
