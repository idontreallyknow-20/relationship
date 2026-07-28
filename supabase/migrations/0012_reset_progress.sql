-- Clear both jars, again, and for a better reason than last time.
--
-- 0011 threw away saves that had been played on a broken curve. This one
-- throws away saves that were played on a different game.
--
-- What changed: the eight tier production chain is gone, and so is the floor
-- that things sank to, the crabs that walked along it picking them up, and the
-- things that drifted in to be tapped open. The jar is now a jar you put
-- hearts into. They merge as they pile up, ten of one colour becoming one of
-- the next; a full jar is sealed and goes on a shelf where it keeps paying
-- forever; and the otters and crabs sit around the jar rather than inside it.
--
-- So there is nothing to convert. A row from before this holds a count of
-- depths bought, a number of deepenings, and balances in pearls, shells and
-- sea glass, and none of those has an honest exchange rate into a jar you fill
-- and seal, because the old thing is not a smaller version of the new one.
--
-- The client already refuses a save older than version nine on load (see
-- `RESET_SAVES_BEFORE` in src/game/state.ts). Doing it here as well matters
-- because `reconcile` in persistence.ts reads the permanent counters from this
-- row's *columns* rather than from the state blob, so a stale row would write
-- its lifetime hearts and its rebirth count straight onto an otherwise clean
-- save. There is a test for exactly that case.
--
-- This is destructive and there is no undo. It touches only the two game
-- tables. Messages, memories, letters, moods, plans, drawings, questions,
-- profiles and the couple row are all untouched.

begin;

-- The saves themselves. The rows are recreated by the client on next load, and
-- `game_save` inserts on demand, so deleting rather than truncating keeps the
-- foreign keys and policies exactly as they are.
delete from public.game_saves;

-- The per-day hearts history, which is what the Us screen graphs. Keeping it
-- would leave a week of enormous numbers beside a jar that starts at zero.
delete from public.game_daily;

commit;
