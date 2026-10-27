-- 015t: Judge seats (#411). Four judge demo sets (judge1 to judge4), each held by one browser at a time.
--
-- A seat is held by a random holder id the browser keeps (both phones of the split view share it), not by an
-- account: the judge picks a seat before signing in. Taking a seat is atomic (the row lock serializes two clicks on
-- the same seat: one wins). The app sends a heartbeat about every minute; sign-out releases the seat; a seat with no
-- heartbeat for 10 minutes is free again. A released seat keeps its last holder, so the backend only resets the
-- set's stay when a different browser takes it (`fresh`).
--
-- Claim is service role only: the backend claims, then resets the set. Status, heartbeat and release are open to
-- the app (anon before sign-in, authenticated after); heartbeat and release need the holder id, which only the
-- holding browser knows, and status never shows it.

create table public.judge_seats (
  set_key text primary key check (set_key in ('judge1', 'judge2', 'judge3', 'judge4')),
  holder uuid,
  heartbeat_at timestamptz not null default '-infinity',
  claimed_at timestamptz
);

insert into public.judge_seats (set_key) values ('judge1'), ('judge2'), ('judge3'), ('judge4');

alter table public.judge_seats enable row level security;

revoke all on public.judge_seats from anon, authenticated;
grant all on public.judge_seats to service_role;

-- How long a seat stays held without a heartbeat.
create or replace function public.judge_seat_ttl()
returns interval
language sql
immutable
as $$ select interval '10 minutes' $$;

-- Take a seat for a browser. ok = the browser holds it now; fresh = a different browser held it before, so the set
-- must be reset. The same browser taking its own seat again (the other phone, a reload) only refreshes it.
create or replace function public.claim_judge_seat(p_set text, p_holder uuid)
returns table (ok boolean, fresh boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holder uuid;
  v_heartbeat timestamptz;
begin
  if p_holder is null then
    raise exception 'holder_required' using errcode = '22023';
  end if;
  select s.holder, s.heartbeat_at into v_holder, v_heartbeat
    from public.judge_seats s where s.set_key = p_set for update;
  if not found then
    raise exception 'unknown_seat' using errcode = '22023';
  end if;
  if v_holder is distinct from p_holder and v_heartbeat > now() - public.judge_seat_ttl() then
    return query select false, false;
    return;
  end if;
  update public.judge_seats
     set holder = p_holder,
         heartbeat_at = now(),
         claimed_at = case when v_holder is distinct from p_holder then now() else claimed_at end
   where set_key = p_set;
  return query select true, v_holder is distinct from p_holder;
end;
$$;

revoke execute on function public.claim_judge_seat(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_judge_seat(text, uuid) to service_role;

-- Keep a held seat. False when the seat was released or another browser took it: the app then signs out.
create or replace function public.judge_seat_heartbeat(p_set text, p_holder uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.judge_seats
     set heartbeat_at = now()
   where set_key = p_set and holder = p_holder and heartbeat_at > '-infinity'::timestamptz;
  return found;
end;
$$;

revoke execute on function public.judge_seat_heartbeat(text, uuid) from public;
grant execute on function public.judge_seat_heartbeat(text, uuid) to anon, authenticated, service_role;

-- Sign-out frees the seat at once. The holder stays, so the same browser coming back keeps its stay.
create or replace function public.release_judge_seat(p_set text, p_holder uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.judge_seats
     set heartbeat_at = '-infinity'
   where set_key = p_set and holder = p_holder
$$;

revoke execute on function public.release_judge_seat(text, uuid) from public;
grant execute on function public.release_judge_seat(text, uuid) to anon, authenticated, service_role;

-- The seat picker: which seats are in use, and which one this browser holds. Never returns a holder id.
create or replace function public.judge_seat_status(p_holder uuid)
returns table (set_key text, in_use boolean, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.set_key,
         s.heartbeat_at > now() - public.judge_seat_ttl(),
         s.holder is not distinct from p_holder and s.heartbeat_at > now() - public.judge_seat_ttl()
    from public.judge_seats s
   order by s.set_key
$$;

revoke execute on function public.judge_seat_status(uuid) from public;
grant execute on function public.judge_seat_status(uuid) to anon, authenticated, service_role;

-- The backend checks a judge's reset against the seat (#413): only the browser that holds the set may reset it.
create or replace function public.judge_seat_held(p_set text, p_holder uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.judge_seats s
     where s.set_key = p_set and s.holder = p_holder and s.heartbeat_at > now() - public.judge_seat_ttl()
  )
$$;

revoke execute on function public.judge_seat_held(text, uuid) from public, anon, authenticated;
grant execute on function public.judge_seat_held(text, uuid) to service_role;
