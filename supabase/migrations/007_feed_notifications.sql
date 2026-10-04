-- Phase 05 — feed album category + owner notification on sitter posts (not task-linked).

alter table public.feed_posts
  add column category text
  check (category is null or category in ('meal', 'walk', 'nap', 'play', 'other'));

create or replace function public.notify_feed_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pet_name text;
begin
  select p.owner_id, p.name into v_owner, v_pet_name
  from public.pets p
  where p.id = new.pet_id;

  perform public.notify_user(
    v_owner,
    'feed_post',
    format('New photo of %s 📸', v_pet_name),
    null,
    new.pet_id,
    null,
    new.id
  );

  return new;
end;
$$;

create trigger notify_feed_post
  after insert on public.feed_posts
  for each row
  when (new.task_log_id is null)
  execute function public.notify_feed_post();
