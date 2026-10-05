-- Trigger functions are never meant to be called as RPCs; the Supabase advisor flagged them as
-- callable by `anon` (and `authenticated`) through /rest/v1/rpc. Triggers fire regardless of EXECUTE.
revoke execute on function public.care_task_reset_today() from public, anon, authenticated;
revoke execute on function public.guard_care_checkin_species() from public, anon, authenticated;
revoke execute on function public.notify_feed_post() from public, anon, authenticated;
