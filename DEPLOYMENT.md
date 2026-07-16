# Deploying Cami & Joseph to Vercel

The entire backend (database, auth, storage, realtime, push, cron) already
runs on Supabase and is fully provisioned. Vercel only serves the frontend,
and every environment variable it needs is public by design. The service
role key is never used outside Supabase itself.

## One-time setup (about 3 minutes)

1. Open https://vercel.com/new and sign in (choose "Continue with GitHub").
2. Under "Import Git Repository", pick `idontreallyknow-20/relationship`.
   If it is not listed, click "Adjust GitHub App Permissions" and grant
   Vercel access to the repository.
3. On the "Configure Project" screen:
   - Framework preset: Next.js (detected automatically).
   - Expand "Environment Variables" and add exactly these three:

     | Name | Value |
     | --- | --- |
     | `NEXT_PUBLIC_SUPABASE_URL` | `https://vahhsjtxhjddohtgqtaj.supabase.co` |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key (in `.env.example` terms; the actual value is in the project handoff notes) |
     | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the VAPID public key from the handoff notes |

4. Click "Deploy" and wait for the confetti.
5. Copy the production URL Vercel shows (something like
   `https://relationship-xyz.vercel.app`).

No other configuration is required. Push notifications, invites, PIN
unlock, and the 5-minute scheduled worker all run on Supabase and work
against any domain.

## Sending the invites

Invite links have the form:

```
https://YOUR-VERCEL-DOMAIN/invite#INVITE-TOKEN
```

Two one-time tokens (one for Cami, one for Joseph) were minted during
setup and shared privately in the project handoff. New links can always be
created inside the app under Settings, "Invite a device".

## Recovery

- Lost device or stolen phone: Settings, "Security and devices", revoke the
  device. For a stronger reset use "Sign out everywhere", then pair again
  with a fresh invite link or PIN.
- Forgot PIN: pair with a fresh invite link (create one from the other
  person's device under Settings), then set a new PIN.
- Both locked out: create an invite row directly in Supabase. Open
  https://supabase.com/dashboard, select the project, open the SQL editor
  and run the snippet in `supabase/recovery.sql` (it prints a fresh invite
  token; paste it into `https://YOUR-DOMAIN/invite#TOKEN`).
- Supabase project paused (free tier pauses after a week of inactivity):
  open the Supabase dashboard and click "Restore". Nothing is lost.

## Limits that remain

- iPhone requires installing the PWA to the Home Screen before
  notifications can be enabled. That is an iOS platform rule.
- Location sharing updates only while the app is open on screen. Web apps
  cannot track in the background, and this one never tries to.
- The Supabase free tier pauses the database after about a week with no
  traffic; the tick worker usually keeps it awake, but if the app ever
  shows a connection error, check the Supabase dashboard first.
- Voice notes record in the format each phone supports (WebM Opus on
  Android, M4A on iPhone); both play everywhere in the app.
