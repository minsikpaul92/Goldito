-- Phase 05 (5.8): feed visibility + owner as author.
-- Numbered 007c because 008 is reserved for care — see supabase/README.md.
--   posted_by   the real author (sitter today, owner now too); delete = author only
--   visibility  'shared' = owner + on-duty sitter see it; 'private' = only the author
--   sitter_id   stays for sitter posts, null for owner posts
-- Private posts must never notify the other party, and their media row must stay hidden too.

alter table public.feed_posts
  add column posted_by uuid references public.profiles (id) on delete cascade;
update public.feed_posts set posted_by = sitter_id;
alter table public.feed_posts
  alter column posted_by set not null,
  alter column posted_by set default auth.uid(),
  alter column sitter_id drop not null,
  add column visibility text not null default 'shared'
    check (visibility in ('shared', 'private')),
  add constraint feed_posts_author_chk check (sitter_id is null or sitter_id = posted_by);

-- Is this media attached to someone else's private post? (security definer: the caller
-- cannot read that post under RLS, so the policy cannot ask the table directly.)
create or replace function public.media_hidden_from_me(m uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.feed_posts fp
    where fp.media_id = m and fp.visibility = 'private' and fp.posted_by <> auth.uid()
  )
$$;
revoke execute on function public.media_hidden_from_me(uuid) from public, anon;
grant execute on function public.media_hidden_from_me(uuid) to authenticated, service_role;

drop policy media_select on public.media;
create policy media_select on public.media
  for select to authenticated
  using (
    uploaded_by = (select auth.uid())
    or (public.can_access_pet(pet_id) and not public.media_hidden_from_me(id))
  );

drop policy feed_posts_select on public.feed_posts;
create policy feed_posts_select on public.feed_posts
  for select to authenticated
  using (
    posted_by = (select auth.uid())
    or (visibility = 'shared' and public.can_access_pet(pet_id))
  );

drop policy feed_posts_insert on public.feed_posts;
create policy feed_posts_insert on public.feed_posts
  for insert to authenticated
  with check (
    posted_by = (select auth.uid())
    and (
      (sitter_id = (select auth.uid()) and public.is_on_duty_for(pet_id))
      or (sitter_id is null and public.is_owner_of(pet_id))
    )
    and exists (
      select 1 from public.media m
      where m.id = media_id
        and m.pet_id = feed_posts.pet_id
        and m.uploaded_by = (select auth.uid())
        and m.purpose = 'feed'
    )
  );

drop policy feed_posts_delete on public.feed_posts;
create policy feed_posts_delete on public.feed_posts
  for delete to authenticated
  using (posted_by = (select auth.uid()));

-- Owner notice only for a sitter's shared post (owner → sitter notice comes with 5.9).
drop trigger notify_feed_post on public.feed_posts;
create trigger notify_feed_post
  after insert on public.feed_posts
  for each row
  when (new.task_log_id is null and new.visibility = 'shared' and new.sitter_id is not null)
  execute function public.notify_feed_post();
