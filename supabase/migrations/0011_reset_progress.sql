-- Clear both jars.
--
-- Asked for directly, and necessary rather than tidy. Every save written
-- before this point was played on a curve where a rebirth did not clear the
-- production chain, so those rows carry counts the current game could not
-- produce: hundreds of deepenings, moon balances that took a broken feedback
-- loop to earn, and lifetime totals sitting on the floating point ceiling.
--
-- The client discards a stale save on load anyway (see `RESET_SAVES_BEFORE`),
-- but doing it here as well means the old numbers are actually gone rather
-- than merely ignored, and that the daily history graph starts again with the
-- rest of it.
--
-- This is destructive and there is no undo. It touches only the three game
-- tables. Messages, memories, letters, moods, plans, drawings, questions,
-- profiles and the couple row are all untouched.

begin;

-- The saves themselves. The rows are recreated by the client on next load,
-- and `game_save` inserts a row on demand, so deleting rather than truncating
-- keeps the foreign keys and policies exactly as they are.
delete from public.game_saves;

-- The per-day hearts history, which is what the Us screen graphs. Keeping it
-- would leave a week of enormous numbers next to a jar that starts at zero.
delete from public.game_daily;

commit;
