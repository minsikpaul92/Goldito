-- Phase 05 (5.7): owner Feed soft-refetch when a post is deleted.
-- INSERT already notifies via notify_feed_post → notifications Realtime;
-- DELETE has no notification, so publish feed_posts for postgres_changes.
-- (Numbered 007b because 008 is reserved for care — see supabase/README.md.)
-- Idempotent: safe if the table was already added (dashboard toggle or an earlier apply).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_posts'
  ) then
    alter publication supabase_realtime add table public.feed_posts;
  end if;
end
$$;
