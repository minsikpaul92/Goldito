-- 014b (Diary book): the sitter may write the diary page by hand, and a sent page can be shared as a public image.
--
-- 1. save_report_draft(pet, body): today's draft written by the sitter's own hand (no AI). It updates today's one draft
--    (011f: at most one draft per pet, sitter and day) or starts it, and returns its id; send_daily_report (009) still
--    sends it. The AI route (`/api/ai/daily-report`) keeps writing the same draft, so the two can be mixed: generate,
--    then edit by hand, or write first and generate over it. Only the sitter on duty for the pet, as for the AI draft.
-- 2. media.purpose gains 'diary_page': the PNG of a decorated diary page, uploaded when someone taps Share → Copy
--    public link. Cloudinary delivery URLs are public, so the link opens for anyone who has it — the app says so
--    before it uploads.

create or replace function public.save_report_draft(p_pet uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_me is null or not public.is_on_duty_for(p_pet) then
    raise exception 'not_on_duty';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'body_required';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'body_too_long';
  end if;

  update public.daily_reports
  set body = v_body, updated_at = now()
  where pet_id = p_pet and sitter_id = v_me and report_date = public.app_today() and status = 'draft'
  returning id into v_id;

  if v_id is null then
    insert into public.daily_reports (pet_id, sitter_id, report_date, body, status, inputs, model)
    values (p_pet, v_me, public.app_today(), v_body, 'draft', '{"by_hand": true}', null)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.save_report_draft(uuid, text) from public, anon;
grant execute on function public.save_report_draft(uuid, text) to authenticated, service_role;

alter table public.media drop constraint media_purpose_check;
alter table public.media add constraint media_purpose_check
  check (purpose in ('feed', 'task_proof', 'safety_label', 'report', 'handoff', 'sticker', 'diary_page'));
