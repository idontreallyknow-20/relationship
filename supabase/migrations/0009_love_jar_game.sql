-- ---------------------------------------------------------------------------
-- Love Jar: the incremental game.
--
-- The old jar was a single `love_taps` row per tap. Those rows are kept as the
-- historical record and are converted into starting progress for the new game
-- exactly once, per person, by `game_claim_legacy()`.
--
-- The client owns simulation (it has to, for offline play) but the server owns
-- anything permanent or comparable: lifetime totals, rebirth and ascension
-- counts, and the leaderboard. Every batch of progress is submitted with an
-- idempotency key, validated for plausibility, clamped, and audited.
-- ---------------------------------------------------------------------------

create table if not exists public.game_saves (
  person public.person_t primary key,
  version integer not null default 1,
  -- Full client state. Big, but this is a two person app and it lets the game
  -- add systems without a migration every time.
  state jsonb not null default '{}'::jsonb,
  -- Server owned counters. Never written directly by the client.
  hearts numeric not null default 0,
  lifetime_hearts numeric not null default 0,
  total_clicks bigint not null default 0,
  best_combo integer not null default 0,
  rebirths integer not null default 0,
  ascensions integer not null default 0,
  pets_collected integer not null default 0,
  achievements integer not null default 0,
  bosses_defeated integer not null default 0,
  legacy_claimed boolean not null default false,
  suspicious_batches integer not null default 0,
  last_batch_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One row per accepted batch: the idempotency ledger that makes a reconnect
-- after offline play safe to retry.
create table if not exists public.game_batches (
  id uuid primary key,
  person public.person_t not null,
  hearts_delta numeric not null default 0,
  clicks integer not null default 0,
  window_ms bigint not null default 0,
  accepted boolean not null default true,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists game_batches_person_idx on public.game_batches (person, created_at desc);

-- Daily rollup used by the leaderboard and the statistics charts.
create table if not exists public.game_daily (
  person public.person_t not null,
  day date not null,
  hearts numeric not null default 0,
  clicks integer not null default 0,
  best_combo integer not null default 0,
  active_seconds integer not null default 0,
  primary key (person, day)
);

-- Personal bests and head to head records. Metric is free text so a new
-- leaderboard can be added without a migration.
create table if not exists public.game_records (
  person public.person_t not null,
  metric text not null,
  value numeric not null default 0,
  detail jsonb,
  achieved_at timestamptz not null default now(),
  primary key (person, metric)
);

-- Major progression actions, kept so a disputed rebirth or ascension can be
-- looked at later.
create table if not exists public.game_audit (
  id bigserial primary key,
  person public.person_t not null,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_audit_person_idx on public.game_audit (person, created_at desc);

alter table public.game_saves enable row level security;
alter table public.game_batches enable row level security;
alter table public.game_daily enable row level security;
alter table public.game_records enable row level security;
alter table public.game_audit enable row level security;

-- Both partners can see each other's progress (that is the whole point of the
-- couple leaderboard) but nobody writes these tables directly.
create policy game_saves_select on public.game_saves for select using (public.is_member());
create policy game_batches_select on public.game_batches for select
  using (public.is_member() and person = public.current_person());
create policy game_daily_select on public.game_daily for select using (public.is_member());
create policy game_records_select on public.game_records for select using (public.is_member());
create policy game_audit_select on public.game_audit for select
  using (public.is_member() and person = public.current_person());

-- ---------------------------------------------------------------------------
-- Plausibility limits
-- ---------------------------------------------------------------------------

-- A human cannot sustain more than roughly twenty taps a second, and we allow
-- a generous burst on top so a fast player is never punished.
create or replace function private.game_click_ceiling(window_ms bigint)
returns integer
language sql
immutable
as $$
  select greatest(60, least(2147483647, (window_ms / 1000.0 * 22)::bigint + 60))::integer;
$$;

/**
 * Accept a batch of progress.
 *
 * `p_batch_id` makes the call idempotent: replaying a batch after a dropped
 * response is a no-op. Elapsed time is measured from the server's own clock,
 * so moving a device's clock forward buys nothing.
 *
 * Returns the row the client should reconcile against.
 */
create or replace function public.game_sync(
  p_batch_id uuid,
  p_state jsonb,
  p_hearts numeric,
  p_lifetime numeric,
  p_clicks integer,
  p_best_combo integer,
  p_rebirths integer,
  p_ascensions integer,
  p_pets integer,
  p_achievements integer,
  p_bosses integer,
  p_day date
)
returns public.game_saves
language plpgsql
security definer
set search_path = public, private
as $$
declare
  me public.person_t;
  save public.game_saves;
  prev_lifetime numeric := 0;
  prev_clicks bigint := 0;
  window_ms bigint;
  click_budget integer;
  hearts_delta numeric;
  click_delta integer;
  ok boolean := true;
  why text;
begin
  me := public.current_person();
  if me is null then raise exception 'not a member'; end if;

  -- Already applied. Return the current row so the client reconciles.
  if exists (select 1 from public.game_batches where id = p_batch_id) then
    select * into save from public.game_saves where person = me;
    return save;
  end if;

  insert into public.game_saves (person) values (me)
  on conflict (person) do nothing;

  select * into save from public.game_saves where person = me for update;
  prev_lifetime := save.lifetime_hearts;
  prev_clicks := save.total_clicks;

  window_ms := greatest(
    0,
    extract(epoch from (now() - coalesce(save.last_batch_at, save.created_at, now())))::bigint * 1000
  );
  click_budget := private.game_click_ceiling(window_ms);

  hearts_delta := greatest(0, coalesce(p_lifetime, 0) - prev_lifetime);
  click_delta := greatest(0, coalesce(p_clicks, 0)::bigint - prev_clicks)::integer;

  -- Permanent counters only ever move forward.
  if coalesce(p_lifetime, 0) < prev_lifetime
     or coalesce(p_clicks, 0)::bigint < prev_clicks
     or coalesce(p_rebirths, 0) < save.rebirths
     or coalesce(p_ascensions, 0) < save.ascensions then
    ok := false;
    why := 'counters moved backwards';
  elsif click_delta > click_budget then
    ok := false;
    why := 'impossible click rate';
  elsif coalesce(p_rebirths, 0) - save.rebirths > 50
     or coalesce(p_ascensions, 0) - save.ascensions > 10 then
    ok := false;
    why := 'reset count jumped';
  end if;

  insert into public.game_batches (id, person, hearts_delta, clicks, window_ms, accepted, reason)
  values (p_batch_id, me, hearts_delta, click_delta, window_ms, ok, why);

  if not ok then
    -- The save itself is still stored so the player never loses their game,
    -- but the batch does not count toward anything competitive.
    update public.game_saves
       set state = coalesce(p_state, state),
           suspicious_batches = suspicious_batches + 1,
           last_batch_at = now(),
           updated_at = now()
     where person = me
     returning * into save;

    insert into public.game_audit (person, kind, detail)
    values (me, 'batch_rejected', jsonb_build_object('reason', why, 'batch', p_batch_id));
    return save;
  end if;

  update public.game_saves
     set state = coalesce(p_state, state),
         hearts = greatest(0, coalesce(p_hearts, 0)),
         lifetime_hearts = greatest(prev_lifetime, coalesce(p_lifetime, 0)),
         total_clicks = greatest(prev_clicks, coalesce(p_clicks, 0)::bigint),
         best_combo = greatest(save.best_combo, coalesce(p_best_combo, 0)),
         rebirths = greatest(save.rebirths, coalesce(p_rebirths, 0)),
         ascensions = greatest(save.ascensions, coalesce(p_ascensions, 0)),
         pets_collected = greatest(save.pets_collected, coalesce(p_pets, 0)),
         achievements = greatest(save.achievements, coalesce(p_achievements, 0)),
         bosses_defeated = greatest(save.bosses_defeated, coalesce(p_bosses, 0)),
         last_batch_at = now(),
         updated_at = now()
   where person = me
   returning * into save;

  if p_day is not null and (hearts_delta > 0 or click_delta > 0) then
    insert into public.game_daily (person, day, hearts, clicks, best_combo)
    values (me, p_day, hearts_delta, click_delta, coalesce(p_best_combo, 0))
    on conflict (person, day) do update
      set hearts = public.game_daily.hearts + excluded.hearts,
          clicks = public.game_daily.clicks + excluded.clicks,
          best_combo = greatest(public.game_daily.best_combo, excluded.best_combo);
  end if;

  -- Personal bests worth showing on the leaderboard.
  if coalesce(p_best_combo, 0) > 0 then
    insert into public.game_records (person, metric, value)
    values (me, 'best_combo', p_best_combo)
    on conflict (person, metric) do update
      set value = greatest(public.game_records.value, excluded.value),
          achieved_at = case when excluded.value > public.game_records.value then now()
                             else public.game_records.achieved_at end;
  end if;

  insert into public.game_records (person, metric, value)
  values (me, 'lifetime_hearts', save.lifetime_hearts)
  on conflict (person, metric) do update
    set value = greatest(public.game_records.value, excluded.value), achieved_at = now();

  return save;
end;
$$;

revoke all on function public.game_sync(uuid, jsonb, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, date) from public, anon;
grant execute on function public.game_sync(uuid, jsonb, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, date) to authenticated;

/**
 * Record a personal best that is not a simple counter, such as the fastest
 * rebirth. Some metrics are better when smaller, so the direction is an
 * explicit argument rather than something the caller encodes in the value.
 */
create or replace function public.game_record(p_metric text, p_value numeric, p_lower_is_better boolean default false, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.person_t;
begin
  me := public.current_person();
  if me is null then raise exception 'not a member'; end if;
  if p_value is null or p_value < 0 then return; end if;

  insert into public.game_records (person, metric, value, detail)
  values (me, p_metric, p_value, p_detail)
  on conflict (person, metric) do update
    set value = excluded.value,
        detail = coalesce(excluded.detail, public.game_records.detail),
        achieved_at = now()
   where (p_lower_is_better and excluded.value < public.game_records.value)
      or (not p_lower_is_better and excluded.value > public.game_records.value);
end;
$$;

revoke all on function public.game_record(text, numeric, boolean, jsonb) from public, anon;
grant execute on function public.game_record(text, numeric, boolean, jsonb) to authenticated;

/**
 * Convert the old love jar into starting progress, once per person.
 *
 * Every historical tap becomes one lifetime heart and one current heart, and
 * the player keeps a Founding Jar keepsake. Nothing is deleted: `love_taps`
 * stays exactly as it was, and the jar history screen still reads from it.
 */
create or replace function public.game_claim_legacy()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.person_t;
  taps integer;
  save public.game_saves;
begin
  me := public.current_person();
  if me is null then raise exception 'not a member'; end if;

  insert into public.game_saves (person) values (me) on conflict (person) do nothing;
  select * into save from public.game_saves where person = me for update;
  if save.legacy_claimed then
    return jsonb_build_object('claimed', false, 'taps', 0);
  end if;

  select count(*)::integer into taps from public.love_taps where person = me;

  update public.game_saves
     set legacy_claimed = true,
         hearts = hearts + taps,
         lifetime_hearts = lifetime_hearts + taps,
         total_clicks = total_clicks + taps,
         updated_at = now()
   where person = me;

  insert into public.game_audit (person, kind, detail)
  values (me, 'legacy_claim', jsonb_build_object('taps', taps));

  return jsonb_build_object('claimed', true, 'taps', taps);
end;
$$;

revoke all on function public.game_claim_legacy() from public, anon;
grant execute on function public.game_claim_legacy() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime so a partner's progress appears without a refresh
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.game_saves;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.game_daily;
  exception when duplicate_object then null;
  end;
end;
$$;
