-- 015j (#345): the Feed follows Figma. Tags for every care photo, a memo, a sticker in the Feed, and a delete / hide
-- that is each person's own.
--
--   1. feed_posts.category also allows 'potty' and 'mood'; feed_posts.note is the author's short memo (up to 200).
--      log_care_checkin and complete_task_log write both (meal, walk, nap, potty, mood; a wake-up or a plain note is
--      untagged). Old posts are filled in from the task log or the check-in that used the same photo.
--   2. feed_post_hidden: one row per person and post, 'hidden' (out of the grid, can come back) or 'removed' (gone from
--      my Feed, for good). The post itself is never touched by it, so what a sitter sends stays in the owner's Feed when
--      the sitter removes it, and the other way round. feed_posts_select leaves out what I removed.
--   3. hide_feed_post / unhide_feed_post / remove_feed_post. remove_feed_post(post, 'me') removes it from my Feed only;
--      ('everyone') is the author's, for a shared post, within 30 minutes of sending. It answers {"purge": true} when
--      nobody can see the post any more (the backend then deletes the row and the photo file, unless something else
--      still uses it) and clears the notices that pointed at it.
--   4. A sitter keeps reading their own posts after the stay (select already allowed posted_by = me), and may add a
--      private post for a pet they have cared for. Shared posts still need the care window.
--   5. A saved sticker is also a private post of its maker, so it shows in their Feed (and nobody else's).

alter table public.feed_posts drop constraint feed_posts_category_check;
alter table public.feed_posts
  add constraint feed_posts_category_check
  check (category is null or category in ('meal', 'walk', 'nap', 'play', 'other', 'potty', 'mood'));

alter table public.feed_posts
  add column note text,
  add constraint feed_posts_note_chk check (note is null or char_length(note) between 1 and 200);

-- Backfill: a task photo by its task, a check-in photo by the check-in that uses the same file.
update public.feed_posts fp
   set category = case t.type
         when 'feeding' then 'meal' when 'walk' then 'walk' when 'sleep' then 'nap'
         when 'litter' then 'potty' when 'play' then 'play' else null end,
       note = nullif(left(btrim(coalesce(l.note_text, '')), 200), '')
  from public.task_logs l
  join public.care_tasks t on t.id = l.task_id
 where fp.task_log_id = l.id and fp.category is null and fp.note is null;

update public.feed_posts fp
   set category = case c.kind
         when 'meal' then 'meal' when 'walk' then 'walk' when 'nap' then 'nap'
         when 'potty' then 'potty' when 'mood' then 'mood' else null end,
       note = nullif(left(btrim(coalesce(c.note_text, '')), 200), '')
  from public.care_checkins c
 where fp.task_log_id is null and fp.caption_source = 'task'
   and c.media_id = fp.media_id and c.pet_id = fp.pet_id
   and fp.category is null and fp.note is null;

-- Has this sitter's stay with the pet started (it may be over)? Read: their own posts always; write: private only.
create or replace function public.has_cared_for(pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_window(pet, auth.uid()) w
    where lower(w) <= now()
  )
$$;
revoke execute on function public.has_cared_for(uuid) from public, anon;
grant execute on function public.has_cared_for(uuid) to authenticated, service_role;

create table public.feed_post_hidden (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  state text not null check (state in ('hidden', 'removed')),
  at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index feed_post_hidden_user_idx on public.feed_post_hidden (user_id);

alter table public.feed_post_hidden enable row level security;

-- Own rows only, and only to read: hiding and removing go through the functions below.
create policy feed_post_hidden_select on public.feed_post_hidden
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.feed_post_hidden from anon, authenticated;
grant select on public.feed_post_hidden to authenticated;
grant all on public.feed_post_hidden to service_role;

drop policy feed_posts_select on public.feed_posts;
create policy feed_posts_select on public.feed_posts
  for select to authenticated
  using (
    (
      posted_by = (select auth.uid())
      or (visibility = 'shared' and public.can_access_pet(pet_id))
    )
    and not exists (
      select 1 from public.feed_post_hidden h
      where h.post_id = feed_posts.id and h.user_id = (select auth.uid()) and h.state = 'removed'
    )
  );

drop policy feed_posts_insert on public.feed_posts;
create policy feed_posts_insert on public.feed_posts
  for insert to authenticated
  with check (
    posted_by = (select auth.uid())
    and (
      (
        sitter_id = (select auth.uid())
        and (
          public.is_on_duty_for(pet_id)
          or (visibility = 'private' and public.has_cared_for(pet_id))
        )
      )
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

-- Can I see this post right now (the select policy, for the functions below that bypass RLS)?
create or replace function public.can_see_feed_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.feed_posts fp
    where fp.id = p_post
      and (fp.posted_by = auth.uid() or (fp.visibility = 'shared' and public.can_access_pet(fp.pet_id)))
      and not exists (
        select 1 from public.feed_post_hidden h
        where h.post_id = fp.id and h.user_id = auth.uid() and h.state = 'removed'
      )
  )
$$;
revoke execute on function public.can_see_feed_post(uuid) from public, anon;
grant execute on function public.can_see_feed_post(uuid) to authenticated, service_role;

-- Everyone but the author who can read this post: a sitter's shared post is the pet's owner's; an owner's shared post is
-- the sitters whose care window (plus the 2 h wrap-up) is still open.
create or replace function public.feed_post_other_viewers(p public.feed_posts)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select pt.owner_id
    from public.pets pt
   where pt.id = p.pet_id and p.sitter_id is not null and p.visibility = 'shared'
  union
  select b.sitter_id
    from public.bookings b
    join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = p.pet_id and bp.active
   where p.sitter_id is null and p.visibility = 'shared' and b.status = 'confirmed'
     and exists (
       select 1 from public.care_window(p.pet_id, b.sitter_id) w where upper(w) + interval '2 hours' > now()
     )
$$;
revoke execute on function public.feed_post_other_viewers(public.feed_posts) from public, anon, authenticated;
grant execute on function public.feed_post_other_viewers(public.feed_posts) to service_role;

create or replace function public.hide_feed_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_see_feed_post(p_post) then
    raise exception 'not_found';
  end if;
  insert into public.feed_post_hidden (post_id, user_id, state) values (p_post, auth.uid(), 'hidden')
  on conflict (post_id, user_id) do update set state = 'hidden', at = now();
end;
$$;

create or replace function public.unhide_feed_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.feed_post_hidden
   where post_id = p_post and user_id = auth.uid() and state = 'hidden';
end;
$$;

create or replace function public.remove_feed_post(p_post uuid, p_scope text default 'me')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_post public.feed_posts;
  v_purge boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_scope not in ('me', 'everyone') then
    raise exception 'bad_scope';
  end if;
  select * into v_post from public.feed_posts where id = p_post;
  if not found or not public.can_see_feed_post(p_post) then
    raise exception 'not_found';
  end if;

  if p_scope = 'everyone' then
    if v_post.posted_by <> v_me then
      raise exception 'not_author';
    end if;
    if v_post.visibility = 'shared' and now() - v_post.created_at > interval '30 minutes' then
      raise exception 'too_late';
    end if;
    v_purge := true;
  else
    insert into public.feed_post_hidden (post_id, user_id, state) values (p_post, v_me, 'removed')
    on conflict (post_id, user_id) do update set state = 'removed', at = now();
    -- Gone for everyone only when the author and every other reader have each removed it.
    v_purge := exists (
        select 1 from public.feed_post_hidden h
        where h.post_id = p_post and h.user_id = v_post.posted_by and h.state = 'removed'
      )
      and not exists (
        select 1 from public.feed_post_other_viewers(v_post) u(id)
        where not exists (
          select 1 from public.feed_post_hidden h
          where h.post_id = p_post and h.user_id = u.id and h.state = 'removed'
        )
      );
  end if;

  if v_purge then
    delete from public.notifications
     where ref_id = p_post and type in ('feed_post', 'photo_request_fulfilled');
  end if;
  return jsonb_build_object('purge', v_purge);
end;
$$;

revoke execute on function public.hide_feed_post(uuid) from public, anon;
revoke execute on function public.unhide_feed_post(uuid) from public, anon;
revoke execute on function public.remove_feed_post(uuid, text) from public, anon;
grant execute on function public.hide_feed_post(uuid) to authenticated, service_role;
grant execute on function public.unhide_feed_post(uuid) to authenticated, service_role;
grant execute on function public.remove_feed_post(uuid, text) to authenticated, service_role;

-- A saved sticker is a private post of its maker (the sitter's never reaches the owner, nor the owner's the sitter).
create or replace function public.feed_post_for_sticker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility, created_at)
  select new.pet_id,
         case when pt.owner_id = new.created_by then null else new.created_by end,
         new.created_by, new.media_id, 'private', new.created_at
    from public.pets pt
   where pt.id = new.pet_id;
  return new;
end;
$$;
revoke execute on function public.feed_post_for_sticker() from public, anon, authenticated;

create trigger feed_post_for_sticker
  after insert on public.pet_stickers
  for each row execute function public.feed_post_for_sticker();

insert into public.feed_posts (pet_id, sitter_id, posted_by, media_id, visibility, created_at)
select ps.pet_id,
       case when pt.owner_id = ps.created_by then null else ps.created_by end,
       ps.created_by, ps.media_id, 'private', ps.created_at
  from public.pet_stickers ps
  join public.pets pt on pt.id = ps.pet_id
 where not exists (select 1 from public.feed_posts fp where fp.media_id = ps.media_id);

-- complete_task_log (008): the photo post carries the task's tag and the memo.
create or replace function public.complete_task_log(
  p_task_log uuid,
  p_media_id uuid default null,
  p_note_text text default null
)
returns public.task_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.task_logs;
  v_task public.care_tasks;
  v_pet_name text;
  v_owner uuid;
  v_title text;
  v_emoji text;
  v_on_time text;
  v_note text := nullif(btrim(coalesce(p_note_text, '')), '');
  v_category text;
begin
  select * into v_log from public.task_logs where id = p_task_log for update;
  if not found then
    raise exception 'task_log_not_found';
  end if;
  if not public.in_care_window(v_log.pet_id, now()) then
    raise exception 'not_in_care_window';
  end if;
  if v_log.status = 'done' then
    raise exception 'already_done';
  end if;
  if p_media_id is not null and not exists (
    select 1 from public.media m
    where m.id = p_media_id
      and m.pet_id = v_log.pet_id
      and m.uploaded_by = auth.uid()
      and m.purpose = 'task_proof'
  ) then
    raise exception 'invalid_media';
  end if;

  select * into v_task from public.care_tasks where id = v_log.task_id;
  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = v_log.pet_id;

  update public.task_logs
  set status = 'done', completed_at = now(), completed_by = auth.uid(), media_id = p_media_id,
      note_text = v_note
  where id = v_log.id
  returning * into v_log;

  v_on_time := case when now() <= v_log.due_at + interval '60 minutes' then ' on time' else '' end;
  v_emoji := case v_task.type
    when 'medication' then '💊' when 'walk' then '🦮' when 'feeding' then '🍽️'
    when 'litter' then '🧹' when 'play' then '🎾' else '😴' end;
  v_title := case v_task.type
    when 'medication' then format('%s''s medication is done%s %s', v_pet_name, v_on_time, v_emoji)
    when 'walk' then format('%s had a walk%s %s', v_pet_name, v_on_time, v_emoji)
    when 'feeding' then format('%s had %s%s %s', v_pet_name, lower(v_task.title), v_on_time, v_emoji)
    when 'litter' then format('%s''s litter box is clean %s', v_pet_name, v_emoji)
    when 'play' then format('%s had playtime%s %s', v_pet_name, v_on_time, v_emoji)
    else format('%s is asleep %s', v_pet_name, v_emoji)
  end;
  perform public.notify_user(v_owner, 'task_done', v_title, v_note, v_log.pet_id, null, v_log.id);

  v_category := case v_task.type
    when 'feeding' then 'meal' when 'walk' then 'walk' when 'sleep' then 'nap'
    when 'litter' then 'potty' when 'play' then 'play' else null end;

  if p_media_id is not null then
    insert into public.feed_posts
      (pet_id, sitter_id, posted_by, media_id, caption, caption_source, task_log_id, visibility, category, note)
    values
      (v_log.pet_id, auth.uid(), auth.uid(), p_media_id,
       format('%s %s — %s', v_emoji, v_task.title, coalesce(v_note, 'done')), 'task', v_log.id, 'shared',
       v_category, left(v_note, 200));
  end if;

  return v_log;
end;
$$;

revoke execute on function public.complete_task_log(uuid, uuid, text) from public, anon;
grant execute on function public.complete_task_log(uuid, uuid, text) to authenticated, service_role;

-- log_care_checkin (015i): the photo post carries the check-in's tag and the memo.
create or replace function public.log_care_checkin(
  p_pet uuid,
  p_kind text,
  p_value text default null,
  p_note_text text default null,
  p_media_id uuid default null
)
returns public.care_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.care_checkins;
  v_pet_name text;
  v_owner uuid;
  v_note text := nullif(btrim(coalesce(p_note_text, '')), '');
  v_title text;
  v_emoji text;
  v_category text;
begin
  if not public.in_care_window(p_pet, now()) then
    raise exception 'not_in_care_window';
  end if;
  if (p_kind = 'note' or p_value = 'other') and v_note is null then
    raise exception 'note_required';
  end if;
  if p_media_id is not null and not exists (
    select 1 from public.media m
    where m.id = p_media_id
      and m.pet_id = p_pet
      and m.uploaded_by = auth.uid()
      and m.purpose = 'task_proof'
  ) then
    raise exception 'invalid_media';
  end if;

  -- Value / length / species rules live in the table (checks + trigger) and surface as errors.
  insert into public.care_checkins (pet_id, created_by, kind, value, note_text, media_id)
  values (p_pet, auth.uid(), p_kind, case when p_kind = 'note' then null else p_value end, v_note, p_media_id)
  returning * into v_row;

  -- A meal, a walk or a potty the sitter reports settles the nearest open task of that kind today (a pet may eat
  -- early). "Didn't eat" settles nothing. No second notice: the check-in notice below already tells the owner.
  if (p_kind = 'meal' and p_value in ('all', 'most', 'little', 'other'))
     or p_kind = 'walk'
     or (p_kind = 'potty' and p_value in ('normal', 'soft', 'other')) then
    update public.task_logs
       set status = 'done', completed_at = now(), completed_by = auth.uid()
     where id = (
       select l.id
         from public.task_logs l
         join public.care_tasks t on t.id = l.task_id
        where l.pet_id = p_pet
          and l.status = 'pending'
          and t.type = case p_kind when 'meal' then 'feeding' when 'walk' then 'walk' else 'litter' end
          and l.due_at >= public.local_ts(public.app_today(), '00:00')
          and l.due_at < public.local_ts(public.app_today() + 1, '00:00')
        order by l.due_at
        limit 1
     );
  end if;

  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = p_pet;

  v_emoji := case p_kind
    when 'meal' then '🍽️' when 'potty' then '💩' when 'walk' then '🦮'
    when 'mood' then case p_value
      when 'playful' then '🎾' when 'excited' then '🤩' when 'calm' then '😌' when 'tired' then '😴'
      when 'missing' then '🥺' when 'sad' then '😢' when 'anxious' then '😟' else '😊' end
    when 'nap' then '💤' when 'wake' then '☀️' else '📝' end;
  v_title := case p_kind
    when 'meal' then case p_value
      when 'all' then format('%s ate everything', v_pet_name)
      when 'most' then format('%s ate most of the meal', v_pet_name)
      when 'little' then format('%s ate a little', v_pet_name)
      when 'other' then format('Meal update for %s', v_pet_name)
      else format('%s skipped the meal', v_pet_name) end
    when 'potty' then case p_value
      when 'other' then format('Potty update for %s', v_pet_name)
      else format('Potty update for %s: %s', v_pet_name, p_value) end
    when 'walk' then format('%s had a %s-minute walk', v_pet_name, p_value)
    when 'mood' then case p_value
      when 'missing' then format('%s is missing you', v_pet_name)
      else format('%s seems %s', v_pet_name, p_value) end
    when 'nap' then format('%s is taking a nap', v_pet_name)
    when 'wake' then format('%s woke up', v_pet_name)
    else format('Note from your sitter about %s', v_pet_name)
  end || ' ' || v_emoji;
  -- What was sent is the title; a typed memo rides along as the body.
  perform public.notify_user(v_owner, 'care_checkin', v_title, v_note, p_pet, null, v_row.id);

  v_category := case p_kind
    when 'meal' then 'meal' when 'walk' then 'walk' when 'nap' then 'nap'
    when 'potty' then 'potty' when 'mood' then 'mood' else null end;

  if p_media_id is not null then
    insert into public.feed_posts
      (pet_id, sitter_id, posted_by, media_id, caption, caption_source, visibility, category, note)
    values
      (p_pet, auth.uid(), auth.uid(), p_media_id,
       case when v_note is null then v_title else v_title || ' — ' || v_note end, 'task', 'shared',
       v_category, left(v_note, 200));
  end if;

  return v_row;
end;
$$;

revoke execute on function public.log_care_checkin(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.log_care_checkin(uuid, text, text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
