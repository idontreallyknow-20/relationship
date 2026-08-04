-- Notification reliability fixes.
--
-- The old admin_notif_allow logged a row even when it throttled, which had
-- two bad effects: the throttled event's key was recorded so it could never
-- send later, and the freshly-inserted row pushed the throttle window
-- forward, so during an active conversation exactly one push got through
-- and then nothing until a full quiet window passed. Now only sends log.

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
    -- Do not record anything: the event stays eligible once the window
    -- (anchored to the last real send) has passed.
    return false;
  end if;

  insert into private.notification_log (dedupe_key, category, recipient)
  values (k, cat, rcpt);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Forget a dedupe key when delivery failed (no subscriptions, quiet hours,
-- push service error), so the same event can send on a later attempt.
create or replace function public.admin_notif_forget(k text)
returns void
language sql security definer
set search_path = private
as $$
  delete from private.notification_log where dedupe_key = k;
$$;

-- Trim the log so the throttle lookup stays fast; called from tick cleanup.
create or replace function public.admin_notif_purge(keep_days int)
returns void
language sql security definer
set search_path = private
as $$
  delete from private.notification_log
  where created_at < now() - make_interval(days => greatest(keep_days, 7));
$$;

revoke all on function public.admin_notif_forget(text) from public, anon, authenticated;
revoke all on function public.admin_notif_purge(int) from public, anon, authenticated;
grant execute on function public.admin_notif_allow(text, text, public.person_t, int) to service_role;
grant execute on function public.admin_notif_forget(text) to service_role;
grant execute on function public.admin_notif_purge(int) to service_role;

create index if not exists notification_log_cat_rcpt_idx
  on private.notification_log (category, recipient, created_at desc);

-- Re-enabling push reuses the same endpoint, which upserts. Without an
-- update policy the ON CONFLICT DO UPDATE path is rejected by RLS and
-- "Enable notifications" fails for anyone who ever had a subscription.
create policy push_update on public.push_subscriptions for update
  using (public.is_member() and person = public.current_person())
  with check (person = public.current_person());

-- Skipping a question overwrote question_id in place, which made the
-- skipped question look never-used and eligible to come right back.
alter table public.daily_questions
  add column if not exists replaced_question_id uuid references public.questions(id);
