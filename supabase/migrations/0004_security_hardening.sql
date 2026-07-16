-- Address security advisor findings: pin search_path on remaining functions
-- and remove default PUBLIC execute grants from security definer helpers.
-- Also note: pg_net was reinstalled with schema extensions.

create or replace function public.admin_sign_out_person(target public.person_t)
returns void
language sql security definer
set search_path = public, private
as $$
  select private.sign_out_person(target);
$$;

create or replace function private.sign_out_person(target public.person_t)
returns void
language plpgsql security definer
set search_path = public, auth
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

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

revoke all on function public.current_person() from public, anon;
grant execute on function public.current_person() to authenticated, service_role;

revoke all on function public.mark_messages_delivered(uuid[]) from public, anon;
grant execute on function public.mark_messages_delivered(uuid[]) to authenticated, service_role;

revoke all on function public.mark_messages_read(uuid[]) from public, anon;
grant execute on function public.mark_messages_read(uuid[]) to authenticated, service_role;

revoke all on function public.mark_letter_opened(uuid) from public, anon;
grant execute on function public.mark_letter_opened(uuid) to authenticated, service_role;

revoke all on function public.revoke_device(uuid) from public, anon;
grant execute on function public.revoke_device(uuid) to authenticated, service_role;

revoke all on function public.admin_sign_out_person(public.person_t) from public, anon, authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- pin_available stays callable by anon intentionally: the welcome screen
-- needs to know whether to offer PIN unlock before sign-in. It only returns
-- a boolean and reads nothing else.
