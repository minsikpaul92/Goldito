-- 011g: the sitter's private review of an owner (feedback FB-25 · FB-29, 2026-10-09).
--
-- After a stay the sitter can rate the owner (1–5) and leave a short note. It is for the sitter alone: the owner
-- never reads it and is never told; when the same owner asks again, the sitter sees their earlier notes on the new
-- request. One note per booking, editable by its sitter. Written only through save_owner_note.

create table public.sitter_owner_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sitter_owner_notes_pair_idx on public.sitter_owner_notes (sitter_id, owner_id, created_at desc);

alter table public.sitter_owner_notes enable row level security;

-- The sitter who wrote it, and nobody else (not the owner).
create policy sitter_owner_notes_select on public.sitter_owner_notes
  for select to authenticated
  using (sitter_id = (select auth.uid()));

revoke all on public.sitter_owner_notes from anon, authenticated;
grant select on public.sitter_owner_notes to authenticated;
grant all on public.sitter_owner_notes to service_role;

create or replace function public.save_owner_note(p_booking uuid, p_rating int, p_comment text default null)
returns public.sitter_owner_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_row public.sitter_owner_notes;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.sitter_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if b.status <> 'confirmed' or not exists (
    select 1 from public.booking_handoffs
    where booking_id = p_booking and kind = 'pick_up' and completed_at is not null
  ) then
    raise exception 'stay_not_finished';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'comment_too_long';
  end if;

  -- No notification: the owner is never told.
  insert into public.sitter_owner_notes (booking_id, sitter_id, owner_id, rating, comment)
  values (p_booking, b.sitter_id, b.owner_id, p_rating, v_comment)
  on conflict (booking_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.save_owner_note(uuid, int, text) from public, anon;
grant execute on function public.save_owner_note(uuid, int, text) to authenticated, service_role;
