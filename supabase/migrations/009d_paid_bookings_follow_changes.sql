-- Review fix (2026-10-06): a paid booking follows the changes agreed after checkout.
--
-- 1. An agreed handoff change on a paid booking used to leave everything as paid at checkout:
--    - the price snapshot kept the old total (2 nights paid, 10 nights booked) → it is re-quoted, and the
--      owner is told the new total (`price_updated`; demo payment, nothing is charged);
--    - moving a handoff to the owner's home added `home_access` to the required consents, but nobody
--      signed it and the entry codes still unlocked → checkout opens again (`paid_at` cleared, the last
--      paid quote kept) and the owner is told to sign (`checkout_needed`).
-- 2. Consents are signed at checkout only: by the owner, on a confirmed booking that is not paid yet, for a
--    kind the booking requires.
-- 3. The owner's profile (home address, emergency contact) is shared with the sitter only after payment,
--    like the handoff addresses (D31 / D44 — "home address stays private until payment").

create or replace function public.follow_paid_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_drop public.booking_handoffs;
  v_pick public.booking_handoffs;
  v_pets int;
  v_quote jsonb;
  v_missing int := 0;
begin
  if new.status <> 'agreed' or old.status = 'agreed' then
    return new;
  end if;
  select * into b from public.bookings where id = new.booking_id;
  if b.status <> 'confirmed' or b.paid_at is null then
    return new;
  end if;

  begin
    select count(*)::int into v_missing
    from unnest(public.required_consents(b.id)) k
    where not exists (select 1 from public.booking_consents c where c.booking_id = b.id and c.kind = k);
  exception when others then
    v_missing := 0;
  end;
  if v_missing > 0 then
    update public.bookings set paid_at = null, updated_at = now() where id = b.id;
    perform public.notify_user(
      b.owner_id, 'checkout_needed',
      'Your stay changed — sign the new consent to finish checkout',
      public.booking_pet_names(b.id),
      null, b.id, b.id
    );
    return new;
  end if;

  v_drop := public.current_handoff(b.id, 'drop_off');
  v_pick := public.current_handoff(b.id, 'pick_up');
  select count(*)::int into v_pets from public.booking_pets bp where bp.booking_id = b.id and bp.active;
  begin
    v_quote := public.quote_booking(b.sitter_id, b.service_type, v_drop.scheduled_at, v_pick.scheduled_at,
      greatest(v_pets, 1));
  exception when others then
    v_quote := null; -- rates removed meanwhile: keep the paid quote
  end;
  if v_quote is not null
     and (v_quote->>'total')::numeric is distinct from (b.price_snapshot->>'total')::numeric then
    update public.bookings set price_snapshot = v_quote, updated_at = now() where id = b.id;
    perform public.notify_user(
      b.owner_id, 'price_updated',
      format('New total for your stay: $%s %s (demo)', v_quote->>'total', coalesce(v_quote->>'currency', 'CAD')),
      format('Was $%s — %s', coalesce(b.price_snapshot->>'total', '?'), public.booking_pet_names(b.id)),
      null, b.id, b.id
    );
  end if;
  return new;
end;
$$;

create trigger booking_handoffs_follow_paid_booking
  after update of status on public.booking_handoffs
  for each row execute function public.follow_paid_booking_change();

revoke execute on function public.follow_paid_booking_change() from public, anon, authenticated;

drop policy booking_consents_insert on public.booking_consents;
create policy booking_consents_insert on public.booking_consents
  for insert to authenticated
  with check (
    signer_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.owner_id = (select auth.uid())
        and b.status = 'confirmed'
        and b.paid_at is null
    )
    and kind = any (public.required_consents(booking_id))
  );

-- Addresses & emergency contacts: a PAID booking until 24 h after the agreed pick-up.
create or replace function public.has_current_booking_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    join public.booking_handoffs p
      on p.booking_id = b.id and p.kind = 'pick_up' and p.status = 'agreed'
    where b.status = 'confirmed'
      and b.paid_at is not null
      and p.scheduled_at + interval '24 hours' > now()
      and ((b.owner_id = auth.uid() and b.sitter_id = other)
        or (b.sitter_id = auth.uid() and b.owner_id = other))
  )
$$;
