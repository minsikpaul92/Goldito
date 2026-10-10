-- Phase 07 (7.5): the sitter sends the daily report.
--
-- The AI draft (written by the backend with the service role) is private to the sitter: the owner's
-- policy on daily_reports only shows status = 'sent'. Sending is the sitter's approval — the text they
-- send is the FINAL text (their edits to the draft included); the owner never sees the AI draft.

create or replace function public.send_daily_report(p_report uuid, p_body text)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.daily_reports;
  v_body text := btrim(coalesce(p_body, ''));
  v_pet_name text;
  v_owner uuid;
  v_sitter_name text;
  v_booking uuid;
begin
  select * into v_report from public.daily_reports where id = p_report for update;
  if not found or v_report.sitter_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_report.status <> 'draft' then
    raise exception 'report_already_sent';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'body_required';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'body_too_long';
  end if;

  update public.daily_reports
  set body = v_body, status = 'sent', sent_at = now()
  where id = v_report.id
  returning * into v_report;

  select p.name, p.owner_id into v_pet_name, v_owner from public.pets p where p.id = v_report.pet_id;
  select display_name into v_sitter_name from public.profiles where id = v_report.sitter_id;
  select b.id into v_booking
  from public.bookings b
  join public.booking_pets bp on bp.booking_id = b.id and bp.pet_id = v_report.pet_id
  where b.sitter_id = v_report.sitter_id and b.status = 'confirmed'
  order by b.created_at desc
  limit 1;

  perform public.notify_user(
    v_owner,
    'report_sent',
    format('%s sent %s''s daily report 📓', v_sitter_name, v_pet_name),
    left(v_body, 140),
    v_report.pet_id,
    v_booking,
    v_report.id
  );
  return v_report;
end;
$$;

revoke execute on function public.send_daily_report(uuid, text) from public, anon;
grant execute on function public.send_daily_report(uuid, text) to authenticated, service_role;
