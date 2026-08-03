-- The typed note between the two of them is the only notification now.
-- Stop the five-minute tick so the daily question, milestones, event
-- reminders, and letter unlocks no longer push on their own.

do $$
begin
  perform cron.unschedule('couple-tick');
exception when others then
  null; -- already unscheduled
end $$;
