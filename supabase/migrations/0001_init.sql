-- Cami & Joseph: initial schema
-- A private two-person couples app. Every row is protected by RLS that
-- restricts access to the two members of the couple.

create extension if not exists pgcrypto;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.person_t as enum ('cami', 'joseph');
create type public.message_kind_t as enum ('text', 'image', 'video', 'audio', 'drawing');
create type public.mood_t as enum ('great', 'happy', 'calm', 'tired', 'stressed', 'sad', 'upset', 'need_comfort', 'need_space', 'custom');
create type public.question_kind_t as enum ('open', 'this_or_that', 'guess_mine');
create type public.letter_kind_t as enum ('instant', 'scheduled', 'open_when', 'compliment', 'appreciation');
create type public.signal_kind_t as enum ('thinking_of_you', 'check_in', 'made_it_home', 'arrived', 'send_support', 'give_space');
create type public.memory_kind_t as enum ('photo', 'video', 'drawing', 'letter', 'note', 'milestone', 'date', 'mood_highlight', 'plan');
create type public.event_kind_t as enum ('date', 'call', 'anniversary', 'birthday', 'trip', 'reminder', 'custom');
create type public.recurrence_t as enum ('none', 'daily', 'weekly', 'monthly', 'yearly');
create type public.list_category_t as enum ('bucket', 'date_idea', 'todo');
create type public.list_status_t as enum ('idea', 'planned', 'completed');
create type public.location_mode_t as enum ('once', 'hour', 'tonight', 'while_using');
create type public.reaction_t as enum ('love', 'adore', 'laugh', 'sad', 'support');
create type public.drawing_background_t as enum ('plain', 'lined', 'grid');

-- ---------------------------------------------------------------------------
-- Core identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  person public.person_t unique not null,
  display_name text not null,
  avatar_path text,
  birthday date,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.couple (
  id smallint primary key default 1 check (id = 1),
  start_date date,
  timezone text not null default 'America/New_York',
  welcome_dismissed_by public.person_t[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into public.couple (id) values (1);

-- Helper functions used by RLS. SECURITY DEFINER so they can read profiles
-- without recursive policy evaluation.
create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.current_person()
returns public.person_t
language sql stable security definer
set search_path = public
as $$
  select person from public.profiles where id = auth.uid();
$$;

revoke all on function public.is_member() from anon;
revoke all on function public.current_person() from anon;

-- ---------------------------------------------------------------------------
-- Devices, invites, sessions
-- ---------------------------------------------------------------------------

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  person public.person_t not null,
  name text not null default 'New device',
  platform text,
  user_agent text,
  paired_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Invite tokens are stored hashed. The raw token only ever exists inside the
-- private link that Joseph sends to Cami.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  person public.person_t not null,
  created_by public.person_t,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by_device uuid references public.devices (id)
);

create table private.person_secrets (
  person public.person_t primary key,
  pin_hash text,
  updated_at timestamptz not null default now()
);

create table private.pin_attempts (
  id bigint generated always as identity primary key,
  person public.person_t not null,
  created_at timestamptz not null default now(),
  success boolean not null default false
);

create table private.app_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  caption text,
  strokes jsonb not null default '[]',
  background public.drawing_background_t not null default 'plain',
  preview_path text,
  created_by public.person_t not null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null,
  sender public.person_t not null,
  kind public.message_kind_t not null default 'text',
  body text,
  media_path text,
  media_meta jsonb,
  drawing_id uuid references public.drawings (id) on delete set null,
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  constraint body_size check (char_length(coalesce(body, '')) <= 8000)
);

create index messages_created_at_idx on public.messages (created_at desc);
create index messages_unread_idx on public.messages (sender, read_at) where read_at is null;

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  person public.person_t not null,
  reaction public.reaction_t not null,
  created_at timestamptz not null default now(),
  primary key (message_id, person)
);

-- ---------------------------------------------------------------------------
-- Moods
-- ---------------------------------------------------------------------------

create table public.moods (
  id uuid primary key default gen_random_uuid(),
  person public.person_t not null,
  mood public.mood_t not null,
  custom_label text,
  intensity smallint not null default 3 check (intensity between 1 and 5),
  note text,
  would_help text,
  visible boolean not null default true,
  expires_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mood_note_size check (char_length(coalesce(note, '')) <= 2000)
);

create index moods_person_created_idx on public.moods (person, created_at desc);

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  prompt text not null,
  kind public.question_kind_t not null default 'open',
  option_a text,
  option_b text,
  created_by public.person_t,
  created_at timestamptz not null default now()
);

create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  for_date date unique not null,
  skipped boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  daily_question_id uuid not null references public.daily_questions (id) on delete cascade,
  person public.person_t not null,
  answer text not null,
  guess text,
  revealed_early boolean not null default false,
  created_at timestamptz not null default now(),
  unique (daily_question_id, person),
  constraint answer_size check (char_length(answer) <= 4000)
);

create table public.question_favorites (
  question_id uuid not null references public.questions (id) on delete cascade,
  person public.person_t not null,
  created_at timestamptz not null default now(),
  primary key (question_id, person)
);

-- ---------------------------------------------------------------------------
-- Memories
-- ---------------------------------------------------------------------------

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  kind public.memory_kind_t not null,
  title text,
  caption text,
  media_path text,
  media_meta jsonb,
  drawing_id uuid references public.drawings (id) on delete set null,
  letter_id uuid,
  happened_on date,
  location text,
  created_by public.person_t not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index memories_happened_idx on public.memories (happened_on desc nulls last, created_at desc);

create table public.memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  person public.person_t not null,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create table public.memory_favorites (
  memory_id uuid not null references public.memories (id) on delete cascade,
  person public.person_t not null,
  created_at timestamptz not null default now(),
  primary key (memory_id, person)
);

-- ---------------------------------------------------------------------------
-- Letters, signals, gratitude
-- ---------------------------------------------------------------------------

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  author public.person_t not null,
  kind public.letter_kind_t not null default 'instant',
  title text,
  body text not null check (char_length(body) <= 20000),
  open_when_label text,
  unlock_at timestamptz,
  unlock_notified boolean not null default false,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  from_person public.person_t not null,
  kind public.signal_kind_t not null,
  note text check (char_length(coalesce(note, '')) <= 500),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index signals_created_idx on public.signals (created_at desc);

create table public.gratitude (
  id uuid primary key default gen_random_uuid(),
  person public.person_t not null,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 300),
  kind public.event_kind_t not null default 'custom',
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  notes text,
  attachment_path text,
  recurrence public.recurrence_t not null default 'none',
  remind_minutes integer,
  reminded_at timestamptz,
  created_by public.person_t not null,
  created_at timestamptz not null default now()
);

create index events_starts_idx on public.events (starts_at);

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  person public.person_t not null,
  status text not null default 'yes' check (status in ('yes', 'no', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (event_id, person)
);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  category public.list_category_t not null default 'bucket',
  title text not null check (char_length(title) <= 300),
  notes text,
  status public.list_status_t not null default 'idea',
  planned_event_id uuid references public.events (id) on delete set null,
  completed_at timestamptz,
  created_by public.person_t not null,
  created_at timestamptz not null default now()
);

create table public.list_votes (
  item_id uuid not null references public.list_items (id) on delete cascade,
  person public.person_t not null,
  created_at timestamptz not null default now(),
  primary key (item_id, person)
);

-- ---------------------------------------------------------------------------
-- Location sharing (consent-first, short-lived)
-- ---------------------------------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  person public.person_t not null,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  mode public.location_mode_t not null,
  label text,
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index locations_person_shared_idx on public.locations (person, shared_at desc);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person public.person_t not null,
  device_id uuid references public.devices (id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  person public.person_t primary key,
  categories jsonb not null default '{"messages":true,"drawings":true,"moods":true,"thinking_of_you":true,"questions":true,"answers":true,"letters":true,"events":true,"milestones":true,"arrivals":true,"plans":true}',
  quiet_start time,
  quiet_end time,
  private_previews boolean not null default true,
  updated_at timestamptz not null default now()
);

create table private.notification_log (
  dedupe_key text primary key,
  created_at timestamptz not null default now()
);

create table private.milestone_log (
  key text primary key,
  notified_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Account lifecycle
-- ---------------------------------------------------------------------------

create table public.deletion_requests (
  person public.person_t primary key,
  requested_at timestamptz not null default now()
);

create table public.person_settings (
  person public.person_t primary key,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.couple enable row level security;
alter table public.devices enable row level security;
alter table public.invites enable row level security;
alter table public.drawings enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.moods enable row level security;
alter table public.questions enable row level security;
alter table public.daily_questions enable row level security;
alter table public.answers enable row level security;
alter table public.question_favorites enable row level security;
alter table public.memories enable row level security;
alter table public.memory_comments enable row level security;
alter table public.memory_favorites enable row level security;
alter table public.letters enable row level security;
alter table public.signals enable row level security;
alter table public.gratitude enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.list_items enable row level security;
alter table public.list_votes enable row level security;
alter table public.locations enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.person_settings enable row level security;

-- profiles: both members can see both profiles; each edits their own.
create policy profiles_select on public.profiles for select using (public.is_member());
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- couple: shared row, both can read and update.
create policy couple_select on public.couple for select using (public.is_member());
create policy couple_update on public.couple for update
  using (public.is_member()) with check (public.is_member());

-- devices: both can see all devices (device management screen); nobody
-- writes directly (edge functions with service role manage pairing).
create policy devices_select on public.devices for select using (public.is_member());
create policy devices_update_activity on public.devices for update
  using (public.is_member()) with check (public.is_member());

-- invites: members can see invite metadata (not usable without raw token);
-- creation happens through the edge function only.
create policy invites_select on public.invites for select using (public.is_member());

-- drawings: shared canvas, both can create and edit.
create policy drawings_select on public.drawings for select using (public.is_member());
create policy drawings_insert on public.drawings for insert
  with check (public.is_member() and created_by = public.current_person());
create policy drawings_update on public.drawings for update
  using (public.is_member()) with check (public.is_member());
create policy drawings_delete on public.drawings for delete
  using (public.is_member() and created_by = public.current_person());

-- messages: read all; write own; edits and deletes only by the sender.
-- Read receipts are set through mark_messages_read() below.
create policy messages_select on public.messages for select using (public.is_member());
create policy messages_insert on public.messages for insert
  with check (public.is_member() and sender = public.current_person());
create policy messages_update_own on public.messages for update
  using (public.is_member() and sender = public.current_person())
  with check (sender = public.current_person());

create policy reactions_select on public.message_reactions for select using (public.is_member());
create policy reactions_write on public.message_reactions for insert
  with check (public.is_member() and person = public.current_person());
create policy reactions_update on public.message_reactions for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());
create policy reactions_delete on public.message_reactions for delete
  using (public.is_member() and person = public.current_person());

-- moods: each person writes their own; partner sees only visible ones.
create policy moods_select on public.moods for select
  using (public.is_member() and (person = public.current_person() or visible));
create policy moods_insert on public.moods for insert
  with check (public.is_member() and person = public.current_person());
create policy moods_update on public.moods for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());
create policy moods_delete on public.moods for delete
  using (public.is_member() and person = public.current_person());

-- questions: everyone reads; custom questions are owned.
create policy questions_select on public.questions for select using (public.is_member());
create policy questions_insert on public.questions for insert
  with check (public.is_member() and created_by = public.current_person());
create policy questions_update on public.questions for update
  using (public.is_member() and created_by = public.current_person())
  with check (created_by = public.current_person());
create policy questions_delete on public.questions for delete
  using (public.is_member() and created_by = public.current_person());

create policy daily_questions_select on public.daily_questions for select using (public.is_member());
create policy daily_questions_insert on public.daily_questions for insert with check (public.is_member());
create policy daily_questions_update on public.daily_questions for update
  using (public.is_member()) with check (public.is_member());

-- answers: the partner's answer stays hidden until both have answered,
-- unless the author revealed early.
create policy answers_select on public.answers for select
  using (
    public.is_member()
    and (
      person = public.current_person()
      or revealed_early
      or exists (
        select 1 from public.answers mine
        where mine.daily_question_id = answers.daily_question_id
          and mine.person = public.current_person()
      )
    )
  );
create policy answers_insert on public.answers for insert
  with check (public.is_member() and person = public.current_person());
create policy answers_update on public.answers for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());

create policy qfav_select on public.question_favorites for select using (public.is_member());
create policy qfav_insert on public.question_favorites for insert
  with check (public.is_member() and person = public.current_person());
create policy qfav_delete on public.question_favorites for delete
  using (public.is_member() and person = public.current_person());

-- memories: both read; each edits their own contributions.
create policy memories_select on public.memories for select using (public.is_member());
create policy memories_insert on public.memories for insert
  with check (public.is_member() and created_by = public.current_person());
create policy memories_update on public.memories for update
  using (public.is_member() and created_by = public.current_person())
  with check (created_by = public.current_person());
create policy memories_delete on public.memories for delete
  using (public.is_member() and created_by = public.current_person());

create policy memory_comments_select on public.memory_comments for select using (public.is_member());
create policy memory_comments_insert on public.memory_comments for insert
  with check (public.is_member() and person = public.current_person());
create policy memory_comments_delete on public.memory_comments for delete
  using (public.is_member() and person = public.current_person());

create policy memory_favorites_select on public.memory_favorites for select using (public.is_member());
create policy memory_favorites_insert on public.memory_favorites for insert
  with check (public.is_member() and person = public.current_person());
create policy memory_favorites_delete on public.memory_favorites for delete
  using (public.is_member() and person = public.current_person());

-- letters: authors always see their own. Recipients see instant letters,
-- compliments and appreciation immediately; scheduled letters only after
-- unlock time; open-when letters are listed but the body is guarded in
-- the letter view via opened_at (recipient chooses when to open).
create policy letters_select on public.letters for select
  using (
    public.is_member()
    and (
      author = public.current_person()
      or kind in ('instant', 'compliment', 'appreciation', 'open_when')
      or (kind = 'scheduled' and unlock_at <= now())
    )
  );
create policy letters_insert on public.letters for insert
  with check (public.is_member() and author = public.current_person());
create policy letters_update_own on public.letters for update
  using (public.is_member() and author = public.current_person())
  with check (author = public.current_person());
create policy letters_delete on public.letters for delete
  using (public.is_member() and author = public.current_person());

create policy signals_select on public.signals for select using (public.is_member());
create policy signals_insert on public.signals for insert
  with check (public.is_member() and from_person = public.current_person());
create policy signals_update on public.signals for update
  using (public.is_member()) with check (public.is_member());

create policy gratitude_select on public.gratitude for select using (public.is_member());
create policy gratitude_insert on public.gratitude for insert
  with check (public.is_member() and person = public.current_person());
create policy gratitude_delete on public.gratitude for delete
  using (public.is_member() and person = public.current_person());

-- events and lists: fully shared, both can manage.
create policy events_select on public.events for select using (public.is_member());
create policy events_insert on public.events for insert
  with check (public.is_member() and created_by = public.current_person());
create policy events_update on public.events for update
  using (public.is_member()) with check (public.is_member());
create policy events_delete on public.events for delete using (public.is_member());

create policy rsvps_select on public.event_rsvps for select using (public.is_member());
create policy rsvps_write on public.event_rsvps for insert
  with check (public.is_member() and person = public.current_person());
create policy rsvps_update on public.event_rsvps for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());
create policy rsvps_delete on public.event_rsvps for delete
  using (public.is_member() and person = public.current_person());

create policy list_select on public.list_items for select using (public.is_member());
create policy list_insert on public.list_items for insert
  with check (public.is_member() and created_by = public.current_person());
create policy list_update on public.list_items for update
  using (public.is_member()) with check (public.is_member());
create policy list_delete on public.list_items for delete using (public.is_member());

create policy list_votes_select on public.list_votes for select using (public.is_member());
create policy list_votes_insert on public.list_votes for insert
  with check (public.is_member() and person = public.current_person());
create policy list_votes_delete on public.list_votes for delete
  using (public.is_member() and person = public.current_person());

-- locations: each person writes their own; both can read; each can delete
-- their own history at any time.
create policy locations_select on public.locations for select using (public.is_member());
create policy locations_insert on public.locations for insert
  with check (public.is_member() and person = public.current_person());
create policy locations_update on public.locations for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());
create policy locations_delete on public.locations for delete
  using (public.is_member() and person = public.current_person());

create policy push_select on public.push_subscriptions for select
  using (public.is_member() and person = public.current_person());
create policy push_insert on public.push_subscriptions for insert
  with check (public.is_member() and person = public.current_person());
create policy push_delete on public.push_subscriptions for delete
  using (public.is_member() and person = public.current_person());

create policy prefs_select on public.notification_prefs for select using (public.is_member());
create policy prefs_insert on public.notification_prefs for insert
  with check (public.is_member() and person = public.current_person());
create policy prefs_update on public.notification_prefs for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());

create policy deletion_select on public.deletion_requests for select using (public.is_member());
create policy deletion_insert on public.deletion_requests for insert
  with check (public.is_member() and person = public.current_person());
create policy deletion_delete on public.deletion_requests for delete
  using (public.is_member() and person = public.current_person());

create policy psettings_select on public.person_settings for select using (public.is_member());
create policy psettings_insert on public.person_settings for insert
  with check (public.is_member() and person = public.current_person());
create policy psettings_update on public.person_settings for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());

-- ---------------------------------------------------------------------------
-- Guarded write helpers
-- ---------------------------------------------------------------------------

-- Recipients mark messages delivered or read without gaining the ability to
-- edit message content.
create or replace function public.mark_messages_delivered(ids uuid[])
returns void
language sql security definer
set search_path = public
as $$
  update public.messages
  set delivered_at = coalesce(delivered_at, now())
  where id = any (ids)
    and sender <> public.current_person()
    and public.is_member();
$$;

create or replace function public.mark_messages_read(ids uuid[])
returns void
language sql security definer
set search_path = public
as $$
  update public.messages
  set read_at = coalesce(read_at, now()),
      delivered_at = coalesce(delivered_at, now())
  where id = any (ids)
    and sender <> public.current_person()
    and public.is_member();
$$;

-- Recipient marks a letter opened.
create or replace function public.mark_letter_opened(letter uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.letters
  set opened_at = coalesce(opened_at, now())
  where id = letter
    and author <> public.current_person()
    and public.is_member()
    and (unlock_at is null or unlock_at <= now());
$$;

revoke all on function public.mark_messages_delivered(uuid[]) from anon;
revoke all on function public.mark_messages_read(uuid[]) from anon;
revoke all on function public.mark_letter_opened(uuid) from anon;

-- Soft device revocation available to both members from Settings.
create or replace function public.revoke_device(device uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_member() then
    raise exception 'not a member';
  end if;
  update public.devices set revoked_at = now() where id = device;
  delete from public.push_subscriptions where device_id = device;
end;
$$;

revoke all on function public.revoke_device(uuid) from anon;

-- Hard sign-out for a person: removes their auth sessions and refresh
-- tokens. Only callable by the service role (edge functions).
create or replace function private.sign_out_person(target public.person_t)
returns void
language plpgsql security definer
as $$
declare
  target_user uuid;
begin
  select id into target_user from public.profiles where person = target;
  if target_user is null then return; end if;
  delete from auth.refresh_tokens where user_id = target_user;
  delete from auth.sessions where user_id = target_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.messages,
  public.message_reactions,
  public.moods,
  public.drawings,
  public.signals,
  public.answers,
  public.daily_questions,
  public.letters,
  public.locations,
  public.devices,
  public.memories,
  public.events,
  public.list_items,
  public.profiles;
