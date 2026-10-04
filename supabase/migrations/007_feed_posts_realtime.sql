-- Phase 05 (5.7): owner Feed soft-refetch when a sitter deletes a post.
-- INSERT already notifies via notify_feed_post → notifications Realtime;
-- DELETE has no notification, so publish feed_posts for postgres_changes.
alter publication supabase_realtime add table public.feed_posts;
