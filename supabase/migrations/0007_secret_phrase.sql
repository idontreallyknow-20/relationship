-- Shared secret passphrase as an alternative to the PIN. Stored only as a
-- bcrypt hash; verification shares the PIN rate limiter (5 fails / 15 min).

create or replace function public.admin_phrase_check(p public.person_t, phrase text)
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

  select value into stored from private.app_config where key = 'phrase_hash';
  if stored is null then
    return 'unset';
  end if;

  if stored = extensions.crypt(phrase, stored) then
    insert into private.pin_attempts (person, success) values (p, true);
    return 'ok';
  else
    insert into private.pin_attempts (person, success) values (p, false);
    return 'bad';
  end if;
end;
$$;

create or replace function public.admin_phrase_set(phrase text)
returns void
language plpgsql security definer
set search_path = private, extensions
as $$
begin
  insert into private.app_config (key, value)
  values ('phrase_hash', extensions.crypt(phrase, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.admin_phrase_check(public.person_t, text) from public, anon, authenticated;
revoke all on function public.admin_phrase_set(text) from public, anon, authenticated;

-- The welcome screen may ask whether a phrase exists (boolean only).
create or replace function public.phrase_available()
returns boolean
language sql stable security definer
set search_path = private
as $$
  select exists (select 1 from private.app_config where key = 'phrase_hash');
$$;
grant execute on function public.phrase_available() to anon, authenticated;

-- The initial phrase is set at provision time via admin_phrase_set and can
-- be changed from Settings.
