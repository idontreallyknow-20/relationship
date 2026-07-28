-- ---------------------------------------------------------------------------
-- The Love Jar, re-themed, and the anti-cheat layer removed.
--
-- The validation machinery in 0009 existed to stop a stranger inflating a
-- public leaderboard. There is no public leaderboard and there are no
-- strangers: this app has exactly two accounts, and the only person anyone
-- could cheat is themselves. Every table and function that existed to police
-- that is dropped here, along with the columns that recorded suspicion.
--
-- What replaces it is `game_save`, which is a plain upsert.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Drop the policing layer
-- ---------------------------------------------------------------------------

drop function if exists public.game_sync(uuid, jsonb, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, date);
drop function if exists public.game_record(text, numeric, boolean, jsonb);
drop function if exists private.game_click_ceiling(bigint);

drop table if exists public.game_batches;
drop table if exists public.game_audit;
drop table if exists public.game_records;

alter table public.game_saves
  drop column if exists suspicious_batches,
  drop column if exists last_batch_at,
  drop column if exists total_clicks,
  drop column if exists best_combo,
  drop column if exists pets_collected,
  drop column if exists achievements,
  drop column if exists bosses_defeated;

-- ---------------------------------------------------------------------------
-- Re-theme the columns that survive
-- ---------------------------------------------------------------------------

alter table public.game_saves
  rename column rebirths to tide_changes;

alter table public.game_saves
  rename column ascensions to new_waters;

alter table public.game_saves
  add column if not exists creatures integer not null default 0;

alter table public.game_daily
  drop column if exists clicks,
  drop column if exists best_combo,
  drop column if exists active_seconds;

-- ---------------------------------------------------------------------------
-- A plain save
-- ---------------------------------------------------------------------------

/**
 * Store this person's jar. Last write wins, which is correct: the client
 * reconciles local and server on load and only ever sends the newer one.
 */
create or replace function public.game_save(
  p_state jsonb,
  p_hearts numeric,
  p_lifetime numeric,
  p_tide_changes integer,
  p_new_waters integer,
  p_creatures integer,
  p_day date,
  p_day_hearts numeric
)
returns public.game_saves
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.person_t;
  save public.game_saves;
begin
  me := public.current_person();
  if me is null then raise exception 'not a member'; end if;

  insert into public.game_saves (person) values (me) on conflict (person) do nothing;

  update public.game_saves
     set state = coalesce(p_state, state),
         hearts = greatest(0, coalesce(p_hearts, 0)),
         -- Lifetime only ever moves forward, so a stale device that syncs
         -- late cannot walk the total backwards.
         lifetime_hearts = greatest(lifetime_hearts, coalesce(p_lifetime, 0)),
         tide_changes = greatest(tide_changes, coalesce(p_tide_changes, 0)),
         new_waters = greatest(new_waters, coalesce(p_new_waters, 0)),
         creatures = greatest(creatures, coalesce(p_creatures, 0)),
         updated_at = now()
   where person = me
   returning * into save;

  if p_day is not null and coalesce(p_day_hearts, 0) > 0 then
    insert into public.game_daily (person, day, hearts)
    values (me, p_day, p_day_hearts)
    on conflict (person, day) do update
      set hearts = greatest(public.game_daily.hearts, excluded.hearts);
  end if;

  return save;
end;
$$;

revoke all on function public.game_save(jsonb, numeric, numeric, integer, integer, integer, date, numeric) from public, anon;
grant execute on function public.game_save(jsonb, numeric, numeric, integer, integer, integer, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- The old jar, without the audit trail
-- ---------------------------------------------------------------------------

/**
 * Recreated because the 0009 version wrote to `game_audit` and `total_clicks`,
 * both of which are gone above. The behaviour is otherwise unchanged: every
 * historical tap becomes one lifetime heart and one current heart, once per
 * person, and `love_taps` is never touched.
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
         updated_at = now()
   where person = me;

  return jsonb_build_object('claimed', true, 'taps', taps);
end;
$$;

revoke all on function public.game_claim_legacy() from public, anon;
grant execute on function public.game_claim_legacy() to authenticated;

-- The policies on the dropped tables went with them. `game_saves_select` from
-- 0009 stays exactly as it was: both of you can see both jars, which is the
-- point of a two person game.
