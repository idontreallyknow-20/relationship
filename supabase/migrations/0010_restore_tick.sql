-- Back to the full app: restore the five-minute tick that 0009 removed,
-- so the daily question, letter unlocks, event reminders, milestones, and
-- cleanup run again.

do $$
begin
  perform cron.unschedule('couple-tick');
exception when others then
  null; -- was not scheduled
end $$;

select cron.schedule('couple-tick', '*/5 * * * *', 'select private.run_tick()');
