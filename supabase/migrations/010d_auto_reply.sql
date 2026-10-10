-- Phase 07B (7B.10): auto-send at a human pace (D36 · D37).
--
-- * sitter_profiles.ai_reply_mode ('manual' default / 'auto') and ai_consent_at: the sitter turns auto-send on
--   through set_ai_reply_mode, which needs their explicit consent ("replies go out in your name").
-- * inquiries.reply_typing_at / reply_visible_at: when the auto reply starts "typing" and when it appears. These are
--   just times (no text), readable by the owner, so their screen can time the typing → bubble without a cron job.
-- * notifications.visible_at: a notice can be written now and appear later. The owner's notice for an auto reply
--   shares the reply's visible_at, so the bell never announces a message that is not there yet.

alter table public.sitter_profiles
  add column ai_reply_mode text not null default 'manual' check (ai_reply_mode in ('manual', 'auto')),
  add column ai_consent_at timestamptz;

alter table public.inquiries
  add column reply_typing_at timestamptz,
  add column reply_visible_at timestamptz;

alter table public.notifications add column visible_at timestamptz not null default now();

drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and visible_at <= now());

create or replace function public.get_my_ai_reply_mode()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('mode', ai_reply_mode, 'consented', ai_consent_at is not null)
  from public.sitter_profiles
  where id = auth.uid()
$$;

create or replace function public.set_ai_reply_mode(p_mode text, p_consent boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.sitter_profiles where id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_mode not in ('manual', 'auto') then
    raise exception 'invalid_mode';
  end if;
  if p_mode = 'auto' and not coalesce(p_consent, false)
     and (select ai_consent_at is null from public.sitter_profiles where id = auth.uid()) then
    raise exception 'consent_required';
  end if;
  update public.sitter_profiles
  set ai_reply_mode = p_mode,
      ai_consent_at = case when p_mode = 'auto' and coalesce(p_consent, false) then now() else ai_consent_at end
  where id = auth.uid();
  return public.get_my_ai_reply_mode();
end;
$$;

revoke execute on function public.get_my_ai_reply_mode(), public.set_ai_reply_mode(text, boolean) from public, anon;
grant execute on function public.get_my_ai_reply_mode(), public.set_ai_reply_mode(text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
