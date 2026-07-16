-- Storage bucket and policies, plus seed content.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'
  ]
)
on conflict (id) do nothing;

create policy media_read on storage.objects for select
  using (bucket_id = 'media' and public.is_member());

create policy media_insert on storage.objects for insert
  with check (
    bucket_id = 'media'
    and public.is_member()
    and (storage.foldername(name))[1] in ('chat', 'memories', 'drawings', 'avatars', 'voice', 'attachments')
  );

create policy media_update_own on storage.objects for update
  using (bucket_id = 'media' and owner = auth.uid());

create policy media_delete_own on storage.objects for delete
  using (bucket_id = 'media' and (owner = auth.uid() or public.is_member()));

-- ---------------------------------------------------------------------------
-- Seed: original daily questions across categories.
-- ---------------------------------------------------------------------------

insert into public.questions (category, prompt, kind) values
  ('memories', 'What is the very first thing you remember noticing about me?', 'open'),
  ('memories', 'Which small moment together do you replay in your head the most?', 'open'),
  ('memories', 'What is something funny that happened to us that still makes you smile?', 'open'),
  ('memories', 'If you could relive one hour we spent together, which would it be?', 'open'),
  ('memories', 'What song instantly brings back a memory of us?', 'open'),
  ('favorites', 'What is your favorite thing I do without realizing I am doing it?', 'open'),
  ('favorites', 'What is your favorite way for us to spend a lazy Sunday?', 'open'),
  ('favorites', 'Which meal could you eat with me every week forever?', 'open'),
  ('favorites', 'What is your favorite photo of us and why that one?', 'open'),
  ('future', 'Describe a place you want us to visit together someday.', 'open'),
  ('future', 'What is one tradition you hope we start this year?', 'open'),
  ('future', 'What does a perfect ordinary Tuesday look like for us in five years?', 'open'),
  ('future', 'What skill do you want us to learn together?', 'open'),
  ('communication', 'What is the best way to comfort you after a hard day?', 'open'),
  ('communication', 'What is something you find hard to say out loud but easier to write?', 'open'),
  ('communication', 'When do you feel most listened to by me?', 'open'),
  ('communication', 'What is a small misunderstanding we should laugh about now?', 'open'),
  ('appreciation', 'What did I do recently that meant more to you than I probably know?', 'open'),
  ('appreciation', 'What quality of mine do you hope never changes?', 'open'),
  ('appreciation', 'What is something I taught you without meaning to?', 'open'),
  ('fun', 'If we opened a tiny shop together, what would we sell?', 'open'),
  ('fun', 'What fictional couple are we most like and why?', 'open'),
  ('fun', 'If we swapped phones for a day, what would surprise you most?', 'open'),
  ('dreams', 'What is a dream you have that you have never said out loud to me?', 'open'),
  ('dreams', 'If money did not matter for one year, what would we do?', 'open'),
  ('everyday', 'What part of your day do you most wish I could be there for?', 'open'),
  ('everyday', 'What tiny daily habit of ours do you secretly love?', 'open'),
  ('date_ideas', 'Plan our next date in exactly three sentences.', 'open'),
  ('date_ideas', 'What is a date you would love that we have never tried?', 'open'),
  ('getting_to_know', 'What were you like at eight years old?', 'open'),
  ('getting_to_know', 'What is a small fear you have never told me about?', 'open'),
  ('getting_to_know', 'What compliment do you wish you heard more often?', 'open'),
  ('fun', 'Would you rather have a picnic under the stars or breakfast on a mountain?', 'this_or_that'),
  ('favorites', 'Would you rather rewatch our favorite movie or discover a new one together?', 'this_or_that'),
  ('everyday', 'Would you rather get a good morning text or a good night call?', 'this_or_that'),
  ('future', 'Would you rather live somewhere sunny and busy or quiet and rainy?', 'this_or_that'),
  ('fun', 'Guess my answer: what would I grab first in a water balloon fight?', 'guess_mine'),
  ('favorites', 'Guess my answer: what is my current favorite song?', 'guess_mine'),
  ('everyday', 'Guess my answer: what did I have for breakfast today?', 'guess_mine'),
  ('getting_to_know', 'Guess my answer: what superpower would I pick?', 'guess_mine');

update public.questions set option_a = 'Picnic under the stars', option_b = 'Breakfast on a mountain'
  where prompt like 'Would you rather have a picnic%';
update public.questions set option_a = 'Rewatch our favorite', option_b = 'Discover a new one'
  where prompt like 'Would you rather rewatch%';
update public.questions set option_a = 'Good morning text', option_b = 'Good night call'
  where prompt like 'Would you rather get a good morning%';
update public.questions set option_a = 'Sunny and busy', option_b = 'Quiet and rainy'
  where prompt like 'Would you rather live somewhere%';

-- Default notification preferences for both people.
insert into public.notification_prefs (person) values ('cami'), ('joseph')
on conflict (person) do nothing;

insert into public.person_settings (person) values ('cami'), ('joseph')
on conflict (person) do nothing;
