-- 'always' location sharing mode: stays on until turned off. Updates still
-- only happen while the app is open (web platform rule, honestly labeled).
alter type public.location_mode_t add value if not exists 'always';

-- Push throttling: notification_log gains a category column so the notify
-- function can rate limit per category and recipient.
alter table private.notification_log add column if not exists category text;
alter table private.notification_log add column if not exists recipient public.person_t;

-- Returns true when this notification should be sent: the dedupe key must be
-- fresh AND no notification of the same category to the same recipient may
-- exist within the throttle window.
create or replace function public.admin_notif_allow(
  k text,
  cat text,
  rcpt public.person_t,
  throttle_seconds int
)
returns boolean
language plpgsql security definer
set search_path = private
as $$
begin
  if throttle_seconds > 0 and exists (
    select 1 from private.notification_log
    where category = cat and recipient = rcpt
      and created_at > now() - make_interval(secs => throttle_seconds)
  ) then
    -- Still record the dedupe key so the same event never fires later.
    insert into private.notification_log (dedupe_key, category, recipient)
    values (k, cat, rcpt)
    on conflict (dedupe_key) do nothing;
    return false;
  end if;

  insert into private.notification_log (dedupe_key, category, recipient)
  values (k, cat, rcpt);
  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke all on function public.admin_notif_allow(text, text, public.person_t, int) from public, anon, authenticated;
