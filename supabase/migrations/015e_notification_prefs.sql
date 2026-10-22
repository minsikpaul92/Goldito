-- 015e: Settings → Notifications switches save and work (#292).
--
-- Three switches, kept on the person's profile:
--   trip   Trip updates: trip_started, trip_near, trip_arrived
--   daily  Daily notes and photos: report_sent, feed_post, photo_request_fulfilled
--   tips   Tips and news: tip, news (nothing sends these yet)
-- Everything else (bookings, chat, care requests, safety DANGER, reviews) is never muted: only the three families
-- above can be turned off.
--
-- * profiles.notification_prefs: the switches. Trip updates and Daily notes start on, Tips and news starts off.
-- * set_notification_pref(key, on): the person's own switch. profiles has no direct UPDATE grant beyond display_name,
--   so the switch goes through this function.
-- * A BEFORE INSERT trigger on notifications drops a notice whose family the person turned off. It sits on the table,
--   not in notify_user, because the notices are written by several triggers and the backend.

alter table public.profiles
  add column notification_prefs jsonb not null default '{"trip": true, "daily": true, "tips": false}'::jsonb;

create or replace function public.set_notification_pref(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_key is null or p_key not in ('trip', 'daily', 'tips') or p_on is null then
    raise exception 'invalid_pref';
  end if;
  update public.profiles
     set notification_prefs = jsonb_set(notification_prefs, array[p_key], to_jsonb(p_on))
   where id = auth.uid();
end;
$$;

revoke execute on function public.set_notification_pref(text, boolean) from public, anon;
grant execute on function public.set_notification_pref(text, boolean) to authenticated;

create or replace function public.notification_pref_key(p_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_type in ('trip_started', 'trip_near', 'trip_arrived') then 'trip'
    when p_type in ('report_sent', 'feed_post', 'photo_request_fulfilled') then 'daily'
    when p_type in ('tip', 'news') then 'tips'
  end;
$$;

create or replace function public.drop_muted_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.notification_pref_key(new.type);
begin
  if v_key is not null and exists (
    select 1 from public.profiles
     where id = new.user_id and notification_prefs ->> v_key = 'false'
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger notifications_drop_muted
  before insert on public.notifications
  for each row execute function public.drop_muted_notification();

revoke execute on function public.notification_pref_key(text), public.drop_muted_notification()
  from public, anon, authenticated;
