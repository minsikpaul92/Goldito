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

-- Notices go to the other party and only for shared posts (private never notifies):
--   sitter post → the pet's owner (5.3)
--   owner post  → the sitter(s) on duty for that pet right now (5.9)
create or replace function public.notify_feed_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pet_name text;
  v_owner_name text;
  r record;
begin
  select p.owner_id, p.name, pr.display_name into v_owner, v_pet_name, v_owner_name
  from public.pets p
  join public.profiles pr on pr.id = p.owner_id
  where p.id = new.pet_id;

  if new.sitter_id is not null then
    perform public.notify_user(
      v_owner,
      'feed_post',
      format('New photo of %s 📸', v_pet_name),
      null,
      new.pet_id,
      null,
      new.id
    );
  else
    for r in
      select distinct on (b.sitter_id) b.sitter_id, b.id as booking_id
      from public.bookings b
      join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = new.pet_id and bp.active
      where b.status = 'confirmed'
        and exists (
          select 1 from public.care_window(new.pet_id, b.sitter_id) w
          where now() between lower(w) - interval '30 minutes' and upper(w) + interval '2 hours'
        )
    loop
      perform public.notify_user(
        r.sitter_id,
        'feed_post',
        format('%s shared a photo of %s 📸', v_owner_name, v_pet_name),
        null,
        new.pet_id,
        r.booking_id,
        new.id
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger notify_feed_post on public.feed_posts;
create trigger notify_feed_post
  after insert on public.feed_posts
  for each row
  when (new.task_log_id is null and new.visibility = 'shared')
  execute function public.notify_feed_post();
