-- 015c: cancelling a paid booking refunds it in full (#266).
--
-- The demo payment only sets paid_at (006, 014o) and nothing undid it, so a cancelled booking kept the green "Paid"
-- chip. Decided with Minsik: a cancel means a full refund. Demo money only; real refunds come with Stripe (#198).
--
-- * bookings.refunded_at: when the payment was refunded. paid_at stays as the record of the payment.
-- * A trigger on the status change, not a new cancel_booking (003): whichever way a paid booking ends up cancelled,
--   it is refunded. Today that is cancel_booking by the owner or the sitter; the other cancels (handoff decline,
--   Meet & Greet decline or timeout) happen only before confirm, so before any payment.
-- * The owner is told "Refunded in full" with the amount, both when they cancel and when the sitter does.
-- * cancel_booking already refuses once the stay has started (booking_in_progress), so a stay in progress is never
--   refunded here.

alter table public.bookings add column refunded_at timestamptz;

create or replace function public.refund_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and new.paid_at is not null and new.refunded_at is null then
    new.refunded_at := now();
  end if;
  return new;
end;
$$;

create trigger bookings_refund_on_cancel
  before update of status on public.bookings
  for each row execute function public.refund_on_cancel();

create or replace function public.notify_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.refunded_at is not null and old.refunded_at is null then
    perform public.notify_user(
      new.owner_id, 'booking_refunded',
      'Refunded in full',
      format('$%s %s back for %s (demo)',
        coalesce(new.price_snapshot ->> 'total', '?'),
        coalesce(new.price_snapshot ->> 'currency', 'CAD'),
        public.booking_pet_names(new.id)),
      null, new.id, new.id
    );
  end if;
  return new;
end;
$$;

-- On the status change, not "update of refunded_at": that column is set by the trigger above, not by the UPDATE itself.
create trigger bookings_notify_refund
  after update of status on public.bookings
  for each row execute function public.notify_refund();

revoke execute on function public.refund_on_cancel(), public.notify_refund() from public, anon, authenticated;
