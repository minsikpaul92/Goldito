-- 015l (#345): edit a Feed photo: several tags, the day and time it was taken, the memo.
--
--   1. feed_posts.tags: the tags of a photo (meal, walk, nap, mood, potty), any number of them. `category` stays what the
--      app and the care functions write (one tag); a before-insert trigger copies it into `tags` so every writer keeps
--      working, and the backfill does the same for old posts.
--   2. feed_posts.taken_at: when the photo is "from" (the day header, the order and the time on the photo). It starts as
--      the time it was sent and only its author moves it. `created_at` stays the time it was sent, so the 30 minutes in
--      which the author can delete it for both cannot be stretched by editing the time.
--   3. update_feed_post(post, taken_at, note, tags): the author of a post changes those three. Not in the future, a memo
--      of up to 200 characters, only the five tags.

alter table public.feed_posts
  add column tags text[] not null default '{}',
  add column taken_at timestamptz;

update public.feed_posts set taken_at = created_at;
update public.feed_posts
   set tags = array[category]
 where category in ('meal', 'walk', 'nap', 'mood', 'potty');

alter table public.feed_posts
  alter column taken_at set not null,
  add constraint feed_posts_tags_chk
    check (tags <@ array['meal', 'walk', 'nap', 'mood', 'potty']::text[] and cardinality(tags) <= 5);

create index feed_posts_pet_taken_idx on public.feed_posts (pet_id, taken_at desc);

create or replace function public.feed_posts_fill()
returns trigger
language plpgsql
as $$
begin
  if new.taken_at is null then
    new.taken_at := new.created_at;
  end if;
  if cardinality(new.tags) = 0 and new.category in ('meal', 'walk', 'nap', 'mood', 'potty') then
    new.tags := array[new.category];
  end if;
  return new;
end;
$$;

create trigger feed_posts_fill
  before insert on public.feed_posts
  for each row execute function public.feed_posts_fill();

create or replace function public.update_feed_post(
  p_post uuid,
  p_taken_at timestamptz,
  p_note text,
  p_tags text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_post public.feed_posts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_tags text[];
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_post from public.feed_posts where id = p_post;
  if not found or not public.can_see_feed_post(p_post) then
    raise exception 'not_found';
  end if;
  if v_post.posted_by <> v_me then
    raise exception 'not_author';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'note_too_long';
  end if;
  if p_taken_at is null or p_taken_at > now() + interval '5 minutes' then
    raise exception 'in_the_future';
  end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}')) t where t not in ('meal', 'walk', 'nap', 'mood', 'potty')) then
    raise exception 'bad_tag';
  end if;
  select coalesce(array_agg(t order by t), '{}') into v_tags from (select distinct t from unnest(coalesce(p_tags, '{}')) t) x;

  update public.feed_posts
     set taken_at = p_taken_at,
         note = v_note,
         tags = v_tags,
         category = case when cardinality(v_tags) > 0 then v_tags[1] else null end
   where id = p_post;
end;
$$;

revoke execute on function public.update_feed_post(uuid, timestamptz, text, text[]) from public, anon;
grant execute on function public.update_feed_post(uuid, timestamptz, text, text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
