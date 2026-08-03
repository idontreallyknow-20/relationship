-- In another life: shared full-screen click counter to 77777.
-- One row per person. Writes go only through add_clicks(), so counts can
-- only move forward by real taps and the pair total is capped at 77777.

create table public.another_life_clicks (
  person public.person_t primary key,
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.another_life_clicks (person) values ('cami'), ('joseph');

alter table public.another_life_clicks enable row level security;

-- Read-only for members. No insert/update/delete policies: the RPC below
-- (security definer) is the only write path, so a client cannot set counts.
create policy alc_select on public.another_life_clicks
  for select using (public.is_member());

create or replace function public.add_clicks(n integer)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  me public.person_t;
  other_total bigint;
  new_count bigint;
begin
  me := public.current_person();
  if me is null then
    raise exception 'not a member';
  end if;

  if n is null or n <= 0 then
    select count into new_count from public.another_life_clicks where person = me;
    return new_count;
  end if;

  -- Sanity cap per call: a batched flush window cannot produce more than this.
  n := least(n, 200);

  -- Lock both rows in a stable order so concurrent flushes from both partners
  -- serialize instead of deadlocking, and the cap check reads a settled total.
  perform 1 from public.another_life_clicks
    where person in ('cami', 'joseph')
    order by person
    for update;

  select count into other_total
    from public.another_life_clicks
    where person <> me;

  update public.another_life_clicks
     set count = least(count + n, greatest(0, 77777 - other_total)),
         updated_at = now()
   where person = me
   returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.add_clicks(integer) from public, anon;
grant execute on function public.add_clicks(integer) to authenticated, service_role;

alter publication supabase_realtime add table public.another_life_clicks;
