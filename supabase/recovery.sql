-- Emergency re-entry: run this in the Supabase SQL editor to mint a fresh
-- one-time invite when both people are locked out. It prints the raw token;
-- open https://YOUR-DOMAIN/invite#TOKEN on the device you want to pair.
-- Change 'cami' to 'joseph' as needed.

with new_token as (
  select encode(extensions.gen_random_bytes(32), 'hex') as token
), ins as (
  insert into public.invites (token_hash, person, expires_at)
  select encode(extensions.digest(token, 'sha256'), 'hex'), 'cami', now() + interval '7 days'
  from new_token
  returning id
)
select token as invite_token from new_token;
