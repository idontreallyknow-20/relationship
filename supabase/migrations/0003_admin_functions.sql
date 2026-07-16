-- Service-role-only helpers that bridge edge functions to the private schema,
-- plus the pg_cron schedule that drives the tick worker.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- PIN verification with built-in rate limiting: 5 failures in 15 minutes
-- locks the person out until the window passes.
create or replace function public.admin_pin_check(p public.person_t, pin text)
returns text
language plpgsql security definer
set search_path = public, private, extensions
as $$
declare
  stored text;
  fails int;
begin
  select count(*) into fails
  from private.pin_attempts
  where person = p and not success and created_at > now() - interval '15 minutes';
  if fails >= 5 then
    return 'locked';
  end if;

  select pin_hash into stored from private.person_secrets where person = p;
  if stored is null then
    return 'unset';
  end if;

  if stored = extensions.crypt(pin, stored) then
    insert into private.pin_attempts (person, success) values (p, true);
    return 'ok';
  else
    insert into private.pin_attempts (person, success) values (p, false);
    return 'bad';
  end if;
end;
$$;

create or replace function public.admin_pin_set(p public.person_t, pin text)
returns void
language plpgsql security definer
set search_path = public, private, extensions
as $$
begin
  insert into private.person_secrets (person, pin_hash, updated_at)
  values (p, extensions.crypt(pin, extensions.gen_salt('bf')), now())
  on conflict (person) do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

create or replace function public.admin_pin_status()
returns table (person public.person_t, has_pin boolean)
language sql security definer
set search_path = public, private
as $$
  select p.person, (s.pin_hash is not null) as has_pin
  from unnest(enum_range(null::public.person_t)) as p(person)
  left join private.person_secrets s on s.person = p.person;
$$;

create or replace function public.admin_config_get(k text)
returns text
language sql security definer
set search_path = private
as $$
  select value from private.app_config where key = k;
$$;

create or replace function public.admin_config_set(k text, v text)
returns void
language sql security definer
set search_path = private
as $$
  insert into private.app_config (key, value) values (k, v)
  on conflict (key) do update set value = excluded.value;
$$;

-- Returns true when the key was fresh (notification should be sent).
create or replace function public.admin_notif_dedupe(k text)
returns boolean
language plpgsql security definer
set search_path = private
as $$
begin
  insert into private.notification_log (dedupe_key) values (k);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.admin_milestone_mark(k text)
returns boolean
language plpgsql security definer
set search_path = private
as $$
begin
  insert into private.milestone_log (key) values (k);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.admin_sign_out_person(target public.person_t)
returns void
language sql security definer
as $$
  select private.sign_out_person(target);
$$;

-- Wipe every piece of couple data. Called by the edge function only after
-- both people have confirmed deletion.
create or replace function public.admin_wipe_couple()
returns void
language plpgsql security definer
set search_path = public, private
as $$
begin
  truncate public.messages, public.message_reactions, public.moods,
    public.drawings, public.memories, public.memory_comments,
    public.memory_favorites, public.letters, public.signals,
    public.gratitude, public.events, public.event_rsvps,
    public.list_items, public.list_votes, public.locations,
    public.answers, public.daily_questions, public.question_favorites,
    public.push_subscriptions, public.devices, public.invites,
    public.deletion_requests cascade;
  delete from public.questions where created_by is not null;
  delete from storage.objects where bucket_id = 'media';
  update public.couple set start_date = null, welcome_dismissed_by = '{}';
end;
$$;

revoke all on function public.admin_pin_check(public.person_t, text) from public, anon, authenticated;
revoke all on function public.admin_pin_set(public.person_t, text) from public, anon, authenticated;
revoke all on function public.admin_config_get(text) from public, anon, authenticated;
revoke all on function public.admin_config_set(text, text) from public, anon, authenticated;
revoke all on function public.admin_notif_dedupe(text) from public, anon, authenticated;
revoke all on function public.admin_milestone_mark(text) from public, anon, authenticated;
revoke all on function public.admin_sign_out_person(public.person_t) from public, anon, authenticated;
revoke all on function public.admin_wipe_couple() from public, anon, authenticated;

revoke all on function public.admin_pin_status() from public, anon;
grant execute on function public.admin_pin_status() to authenticated, service_role;

-- The welcome screen (before login) may ask whether a PIN exists for a
-- person, and nothing more.
create or replace function public.pin_available(p public.person_t)
returns boolean
language sql stable security definer
set search_path = private
as $$
  select exists (select 1 from private.person_secrets where person = p and pin_hash is not null);
$$;
grant execute on function public.pin_available(public.person_t) to anon, authenticated;

-- Fix: auth.refresh_tokens.user_id is varchar, not uuid.
create or replace function private.sign_out_person(target public.person_t)
returns void
language plpgsql security definer
as $$
declare
  target_user uuid;
begin
  select id into target_user from public.profiles where person = target;
  if target_user is null then return; end if;
  delete from auth.refresh_tokens where user_id = target_user::text;
  delete from auth.sessions where user_id = target_user;
end;
$$;

-- Scheduled tick: pg_cron calls the tick edge function every 5 minutes.
create or replace function private.run_tick()
returns void
language plpgsql security definer
set search_path = private, net
as $$
declare
  secret text;
  fn_url text;
begin
  select value into secret from private.app_config where key = 'tick_secret';
  select value into fn_url from private.app_config where key = 'tick_url';
  if secret is null or fn_url is null then return; end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('couple-tick', '*/5 * * * *', 'select private.run_tick()');
