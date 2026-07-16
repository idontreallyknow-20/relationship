-- Love jar: every tap drops one heart into the shared jar.
create table public.love_taps (
  id uuid primary key default gen_random_uuid(),
  person public.person_t not null,
  created_at timestamptz not null default now()
);

create index love_taps_created_idx on public.love_taps (created_at desc);
create index love_taps_person_day_idx on public.love_taps (person, created_at);

alter table public.love_taps enable row level security;

create policy love_taps_select on public.love_taps for select using (public.is_member());
create policy love_taps_insert on public.love_taps for insert
  with check (public.is_member() and person = public.current_person());

alter publication supabase_realtime add table public.love_taps;
