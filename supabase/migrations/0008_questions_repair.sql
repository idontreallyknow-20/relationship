-- ---------------------------------------------------------------------------
-- Question of the Day repair.
--
-- Three real defects are fixed here.
--
-- 1. `answers_select` queried public.answers from inside its own policy, so
--    Postgres raised "infinite recursion detected in policy for relation
--    answers" on every read. Because PostgREST returns the inserted row by
--    default, saving an answer also tripped the same error. The subquery now
--    lives in a security definer helper, which is not subject to the policy.
--
-- 2. Nothing but the five minute cron could create a daily question. If a tick
--    was missed the day simply had no question. `ensure_daily_question` lets a
--    client mint the row itself, safely, with the same selection rules.
--
-- 3. The day boundary was ambiguous. `daily_questions` now records which
--    timezone the date was minted for, so a partner in another timezone can be
--    told why the question rolls over when it does.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

create table if not exists public.question_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by public.person_t not null,
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pack_name_size check (char_length(name) between 1 and 80)
);

alter table public.questions
  add column if not exists pack_id uuid references public.question_packs (id) on delete set null,
  add column if not exists active boolean not null default true,
  add column if not exists last_used_on date,
  add column if not exists times_used integer not null default 0;

alter table public.daily_questions
  add column if not exists timezone text,
  add column if not exists created_by public.person_t;

alter table public.answers
  add column if not exists updated_at timestamptz,
  add column if not exists seen_by_partner_at timestamptz,
  add column if not exists edit_count integer not null default 0;

-- Shared streak milestones, recorded once so both partners see the same list.
create table if not exists public.question_milestones (
  key text primary key,
  label text not null,
  reached_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists questions_active_idx on public.questions (active, category);
create index if not exists questions_pack_idx on public.questions (pack_id);
create index if not exists daily_questions_date_idx on public.daily_questions (for_date desc);
create index if not exists answers_dq_idx on public.answers (daily_question_id);

alter table public.question_packs enable row level security;
alter table public.question_milestones enable row level security;

-- ---------------------------------------------------------------------------
-- Fix the recursive answers policy
-- ---------------------------------------------------------------------------

-- Security definer, so evaluating it does not re-enter answers' own policy.
create or replace function public.i_answered(p_daily_question uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.answers a
    where a.daily_question_id = p_daily_question
      and a.person = public.current_person()
  );
$$;

revoke all on function public.i_answered(uuid) from public, anon;
grant execute on function public.i_answered(uuid) to authenticated, service_role;

drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select
  using (
    public.is_member()
    and (
      person = public.current_person()
      or revealed_early
      or public.i_answered(answers.daily_question_id)
    )
  );

-- An answer stays editable until the partner has actually seen it.
drop policy if exists answers_update on public.answers;
create policy answers_update on public.answers for update
  using (
    public.is_member()
    and person = public.current_person()
    and seen_by_partner_at is null
  )
  with check (person = public.current_person());

-- Withdrawing an answer you have not shared yet is allowed; once the partner
-- has read it, it stays part of the record.
drop policy if exists answers_delete on public.answers;
create policy answers_delete on public.answers for delete
  using (
    public.is_member()
    and person = public.current_person()
    and seen_by_partner_at is null
  );

-- ---------------------------------------------------------------------------
-- Policies for the new tables
-- ---------------------------------------------------------------------------

drop policy if exists packs_select on public.question_packs;
create policy packs_select on public.question_packs for select using (public.is_member());
drop policy if exists packs_insert on public.question_packs;
create policy packs_insert on public.question_packs for insert
  with check (public.is_member() and created_by = public.current_person());
drop policy if exists packs_update on public.question_packs;
create policy packs_update on public.question_packs for update
  using (public.is_member() and created_by = public.current_person())
  with check (created_by = public.current_person());
drop policy if exists packs_delete on public.question_packs;
create policy packs_delete on public.question_packs for delete
  using (public.is_member() and created_by = public.current_person());

drop policy if exists milestones_select on public.question_milestones;
create policy milestones_select on public.question_milestones for select using (public.is_member());
drop policy if exists milestones_insert on public.question_milestones;
create policy milestones_insert on public.question_milestones for insert with check (public.is_member());

-- ---------------------------------------------------------------------------
-- Answer bookkeeping
-- ---------------------------------------------------------------------------

create or replace function public.touch_answer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.answer is distinct from old.answer then
    new.updated_at := now();
    new.edit_count := old.edit_count + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists answers_touch on public.answers;
create trigger answers_touch before update on public.answers
  for each row execute function public.touch_answer();

/**
 * Called when a partner's answer actually appears on screen. Freezing the
 * answer at that moment is what makes "edit until they have seen it" honest.
 */
create or replace function public.mark_answers_seen(p_daily_question uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.person_t;
  touched integer;
begin
  viewer := public.current_person();
  if viewer is null then return 0; end if;

  update public.answers a
     set seen_by_partner_at = now()
   where a.daily_question_id = p_daily_question
     and a.person <> viewer
     and a.seen_by_partner_at is null
     -- Only counts as seen if the viewer was allowed to read it.
     and (a.revealed_early or public.i_answered(p_daily_question));
  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.mark_answers_seen(uuid) from public, anon;
grant execute on function public.mark_answers_seen(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily question creation, idempotent and callable by either side
-- ---------------------------------------------------------------------------

/**
 * Make sure a question exists for `p_date`, choosing one that has not been
 * asked recently and steering away from the categories used in the last few
 * days. `for_date` is unique, so two clients racing (or a client racing the
 * cron) can never produce two questions for one day.
 */
create or replace function public.ensure_daily_question(p_date date, p_timezone text default null)
returns public.daily_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.daily_questions;
  pick uuid;
  recent_days constant integer := 120;
begin
  -- Callable by either partner and by the scheduled worker. `anon` has no
  -- execute grant at all, so a null uid here means the service role.
  if auth.uid() is not null and not public.is_member() then
    raise exception 'not a member';
  end if;

  -- Never mint a question for a day that has not started, and never backfill
  -- more than a week, so a device with a wrong clock cannot spray rows.
  if p_date > (current_date + 1) or p_date < (current_date - 7) then
    raise exception 'date out of range';
  end if;

  select * into existing from public.daily_questions where for_date = p_date;
  if found then return existing; end if;

  with recent as (
    select dq.question_id, q.category
      from public.daily_questions dq
      join public.questions q on q.id = dq.question_id
     where dq.for_date > p_date - recent_days
  ),
  recent_categories as (
    select dq.question_id, q.category
      from public.daily_questions dq
      join public.questions q on q.id = dq.question_id
     where dq.for_date > p_date - 4
  )
  select q.id into pick
    from public.questions q
   where q.active
     and not exists (select 1 from recent r where r.question_id = q.id)
   order by
     -- Prefer a category we have not just used.
     (exists (select 1 from recent_categories rc where rc.category = q.category)),
     q.times_used,
     md5(q.id::text || p_date::text)
   limit 1;

  -- Everything has been asked in the last few months: fall back to the least
  -- recently used question rather than skipping the day.
  if pick is null then
    select q.id into pick
      from public.questions q
     where q.active
     order by coalesce(q.last_used_on, date '1970-01-01'), md5(q.id::text || p_date::text)
     limit 1;
  end if;

  if pick is null then return null; end if;

  insert into public.daily_questions (question_id, for_date, timezone, created_by)
  values (pick, p_date, coalesce(p_timezone, 'America/New_York'), public.current_person())
  on conflict (for_date) do nothing;

  update public.questions
     set times_used = times_used + 1, last_used_on = p_date
   where id = pick
     and exists (select 1 from public.daily_questions where for_date = p_date and question_id = pick);

  select * into existing from public.daily_questions where for_date = p_date;
  return existing;
end;
$$;

revoke all on function public.ensure_daily_question(date, text) from public, anon;
grant execute on function public.ensure_daily_question(date, text) to authenticated, service_role;

-- The worker runs as service_role, which has no `auth.uid()`, so the
-- security definer body must not assume `current_person()` is set.

/**
 * Swap today's question for a fresh one. Only allowed while neither partner
 * has answered, which keeps one person from erasing the other's answer.
 */
create or replace function public.swap_daily_question(p_daily_question uuid)
returns public.daily_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  dq_row public.daily_questions;
  pick uuid;
begin
  if not public.is_member() then
    raise exception 'not a member';
  end if;

  select * into dq_row from public.daily_questions where id = p_daily_question;
  if not found then raise exception 'unknown question'; end if;
  if exists (select 1 from public.answers where daily_question_id = dq_row.id) then
    raise exception 'already answered';
  end if;

  select q.id into pick
    from public.questions q
   where q.active
     and q.id <> dq_row.question_id
     and not exists (
       select 1 from public.daily_questions dq where dq.question_id = q.id
     )
   order by md5(q.id::text || clock_timestamp()::text)
   limit 1;

  if pick is null then
    select q.id into pick
      from public.questions q
     where q.active and q.id <> dq_row.question_id
     order by coalesce(q.last_used_on, date '1970-01-01'), md5(q.id::text || clock_timestamp()::text)
     limit 1;
  end if;

  if pick is null then return dq_row; end if;

  update public.daily_questions
     set question_id = pick, skipped = true
   where id = dq_row.id
   returning * into dq_row;

  update public.questions set times_used = times_used + 1, last_used_on = dq_row.for_date where id = pick;
  return dq_row;
end;
$$;

revoke all on function public.swap_daily_question(uuid) from public, anon;
grant execute on function public.swap_daily_question(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Streaks and stats, computed server side so both partners agree
-- ---------------------------------------------------------------------------

/**
 * A day counts toward the shared streak when both partners answered it.
 * Today is never counted as a break: a streak only ends once a day has
 * finished with fewer than two answers.
 */
create or replace function public.question_stats(p_today date default null)
returns table (
  current_streak integer,
  longest_streak integer,
  both_days integer,
  my_answers integer,
  total_answers integer,
  answered_today boolean,
  partner_answered_today boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := coalesce(p_today, current_date);
  me public.person_t := public.current_person();
  run integer := 0;
  best integer := 0;
  cur integer := 0;
  counting boolean := true;
  rec record;
begin
  -- Walk question days newest first. A day both answered extends the run; a
  -- finished day with fewer than two answers ends it. Today is skipped while
  -- it is still unfinished, so the streak never looks broken before midnight.
  -- Calendar days that never got a question at all are not counted against
  -- the couple, since nobody could have answered them.
  for rec in
    select dq.for_date,
           count(distinct a.person) as answerers
      from public.daily_questions dq
      left join public.answers a on a.daily_question_id = dq.id
     where dq.for_date <= today
     group by dq.for_date
     order by dq.for_date desc
  loop
    if rec.for_date = today and rec.answerers < 2 then
      continue;
    end if;
    if rec.answerers >= 2 then
      run := run + 1;
      if counting then cur := run; end if;
    else
      if run > best then best := run; end if;
      run := 0;
      counting := false;
    end if;
  end loop;
  if run > best then best := run; end if;

  current_streak := cur;
  longest_streak := best;

  select count(*)::integer into both_days from (
    select dq.for_date
      from public.daily_questions dq
      join public.answers a on a.daily_question_id = dq.id
     group by dq.for_date
    having count(distinct a.person) >= 2
  ) t;

  select count(*)::integer into my_answers from public.answers where person = me;
  select count(*)::integer into total_answers from public.answers;

  select exists (
    select 1 from public.answers a
      join public.daily_questions dq on dq.id = a.daily_question_id
     where dq.for_date = today and a.person = me
  ) into answered_today;

  select exists (
    select 1 from public.answers a
      join public.daily_questions dq on dq.id = a.daily_question_id
     where dq.for_date = today and a.person <> me
  ) into partner_answered_today;

  return next;
end;
$$;

revoke all on function public.question_stats(date) from public, anon;
grant execute on function public.question_stats(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- More questions. The old pool was 42 entries, which one a day exhausts in
-- six weeks and then starts repeating.
-- ---------------------------------------------------------------------------

insert into public.questions (category, prompt, kind) values
  ('romantic', 'What is the most romantic thing I have ever done without planning it?', 'open'),
  ('romantic', 'Where would you want to be kissed goodbye every morning?', 'open'),
  ('romantic', 'What does feeling loved by me actually look like on an ordinary day?', 'open'),
  ('romantic', 'What is a moment when you felt closest to me?', 'open'),
  ('romantic', 'What would you write on a note left in my pocket?', 'open'),
  ('romantic', 'What is the smallest thing I do that makes you feel chosen?', 'open'),
  ('funny', 'What is the most ridiculous argument we have ever had?', 'open'),
  ('funny', 'If our relationship had a laugh track, when would it play loudest?', 'open'),
  ('funny', 'What is my most predictable habit?', 'open'),
  ('funny', 'What would the title of a sitcom about us be?', 'open'),
  ('funny', 'What is the worst advice we have ever given each other?', 'open'),
  ('funny', 'If I were a household appliance, which one would I be?', 'open'),
  ('serious', 'What is something you need from me that you have not asked for yet?', 'open'),
  ('serious', 'What do you worry about most when you think about us?', 'open'),
  ('serious', 'How do you want to be treated when you are wrong about something?', 'open'),
  ('serious', 'What does trust mean to you in practice, not in theory?', 'open'),
  ('serious', 'What is a boundary of yours I should understand better?', 'open'),
  ('serious', 'When you are quiet, what is usually going on?', 'open'),
  ('personal_growth', 'What are you working on in yourself right now?', 'open'),
  ('personal_growth', 'What is a habit you would like me to hold you to?', 'open'),
  ('personal_growth', 'What did you believe a year ago that you no longer believe?', 'open'),
  ('personal_growth', 'What is something you are proud of that nobody noticed?', 'open'),
  ('personal_growth', 'What kind of person do you want to be in ten years?', 'open'),
  ('relationship', 'What is one thing we do well that we never give ourselves credit for?', 'open'),
  ('relationship', 'How do you know when we are drifting, and what pulls us back?', 'open'),
  ('relationship', 'What is a rule we have never spoken out loud but both follow?', 'open'),
  ('relationship', 'What should we do more of, and what should we do less of?', 'open'),
  ('relationship', 'What do you think I misunderstand about you most often?', 'open'),
  ('preferences', 'Morning person or night person, and has that changed since we met?', 'open'),
  ('preferences', 'What is your ideal amount of time together in a normal week?', 'open'),
  ('preferences', 'How do you like to receive bad news?', 'open'),
  ('preferences', 'What is your favorite way to be surprised?', 'open'),
  ('memories', 'What is the first photo of us you would show a stranger?', 'open'),
  ('memories', 'What is a place that will always mean us?', 'open'),
  ('memories', 'What is something we said early on that turned out to be true?', 'open'),
  ('future', 'What is one thing you hope never changes about us?', 'open'),
  ('future', 'What would our ideal home smell like on a Sunday morning?', 'open'),
  ('future', 'What is a promise you would make me for the next year?', 'open'),
  ('random', 'What is the best thing you have eaten this month?', 'open'),
  ('random', 'What is on your mind right now that has nothing to do with me?', 'open'),
  ('random', 'What is a small thing that made you happy today?', 'open'),
  ('random', 'What would you do with a completely free afternoon tomorrow?', 'open'),
  ('random', 'What is the last thing that genuinely surprised you?', 'open')
on conflict do nothing;

insert into public.questions (category, prompt, kind, option_a, option_b) values
  ('preferences', 'Would you rather we plan every detail or figure it out as we go?', 'this_or_that', 'Plan every detail', 'Figure it out'),
  ('preferences', 'Would you rather have a big loud celebration or a quiet one with just us?', 'this_or_that', 'Big and loud', 'Quiet and ours'),
  ('funny', 'Would you rather never argue again or never be late again?', 'this_or_that', 'Never argue', 'Never be late'),
  ('romantic', 'Would you rather slow dance in the kitchen or watch the sunrise together?', 'this_or_that', 'Kitchen slow dance', 'Sunrise together'),
  ('future', 'Would you rather travel constantly or build one perfect home?', 'this_or_that', 'Travel constantly', 'One perfect home'),
  ('serious', 'Would you rather talk a problem through right away or sleep on it first?', 'this_or_that', 'Talk it through now', 'Sleep on it')
on conflict do nothing;

insert into public.questions (category, prompt, kind) values
  ('funny', 'Guess my answer: which of us would survive longer without a phone?', 'guess_mine'),
  ('preferences', 'Guess my answer: what is my comfort meal?', 'guess_mine'),
  ('romantic', 'Guess my answer: what is my favorite thing about your face?', 'guess_mine'),
  ('random', 'Guess my answer: what am I most looking forward to this month?', 'guess_mine'),
  ('memories', 'Guess my answer: which day together would I call the best one?', 'guess_mine')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Realtime for the new tables
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.question_packs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.question_milestones;
  exception when duplicate_object then null;
  end;
end;
$$;
