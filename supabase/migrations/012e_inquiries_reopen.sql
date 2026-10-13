-- 012e (CR-4, code review 2026-10-13): inquiries a request closed open again when that request does not happen.
--
-- 011z closes the owner's other open inquiries about the same pet and dates as soon as a booking is REQUESTED (so the
-- other sitters stop reading the pet's Life Record). Nothing reopened them: when the request was declined, cancelled
-- or timed out (011l sweep), the owner had lost every other conversation for those dates — send_inquiry_reply,
-- change_inquiry_dates and the AI draft all refuse a closed inquiry.
--
-- Now the closing booking is remembered on the inquiry (`closed_by_booking`), and when that booking is declined or
-- cancelled its inquiries open again — unless another live booking (requested / confirmed) of the owner still covers
-- that pet and those dates, which then becomes the one that keeps it closed. Past stays are left closed.
-- Inquiries closed in any other way (closed_by_booking null) never reopen.

alter table public.inquiries
  add column closed_by_booking uuid references public.bookings (id) on delete set null;

create or replace function public.close_sibling_inquiries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found then
    return new;
  end if;
  update public.inquiries i
  set status = 'closed', closed_by_booking = b.id
  where i.owner_id = b.owner_id
    and i.sitter_id <> b.sitter_id
    and i.status = 'open'
    and new.pet_id = any (i.pet_ids)
    and tstzrange(i.drop_off_at, i.pick_up_at, '[)') && new.care_range;
  return new;
end;
$$;

create or replace function public.reopen_sibling_inquiries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.inquiries;
  v_other uuid;
begin
  for i in
    select * from public.inquiries
    where closed_by_booking = new.id and status = 'closed'
    for update
  loop
    select b2.id into v_other
    from public.booking_pets bp
    join public.bookings b2 on b2.id = bp.booking_id
    where b2.owner_id = i.owner_id
      and b2.id <> new.id
      and b2.sitter_id <> i.sitter_id
      and b2.status in ('requested', 'confirmed')
      and bp.pet_id = any (i.pet_ids)
      and bp.care_range && tstzrange(i.drop_off_at, i.pick_up_at, '[)')
    limit 1;
    if v_other is not null then
      update public.inquiries set closed_by_booking = v_other where id = i.id;
    elsif i.pick_up_at > now() then
      update public.inquiries set status = 'open', closed_by_booking = null where id = i.id;
    end if;
  end loop;
  return new;
end;
$$;

create trigger bookings_reopen_sibling_inquiries
  after update of status on public.bookings
  for each row
  when (new.status in ('declined', 'cancelled') and old.status is distinct from new.status)
  execute function public.reopen_sibling_inquiries();

revoke execute on function public.reopen_sibling_inquiries() from public, anon, authenticated;
