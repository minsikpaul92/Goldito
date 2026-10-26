-- 015s: reviews both ways are shared (2026-10-26, replaces the private part of D53 / 011g).
--
-- A sitter's review of an owner (sitter_owner_notes) is now read by that owner and by every sitter, so a sitter can
-- see how a new owner was with others before saying yes. The owner's review of a sitter shows in full on the
-- sitter's profile, not only the latest three comments, and the sitter reads every review about them. Reviewer
-- names stay first-name only. Existing notes become shared too (demo and test accounts only, no real users yet).

-- The owner a review is about can read its row; other sitters read it through owner_rating_summary.
drop policy sitter_owner_notes_select on public.sitter_owner_notes;
create policy sitter_owner_notes_select on public.sitter_owner_notes
  for select to authenticated
  using (sitter_id = (select auth.uid()) or owner_id = (select auth.uid()));

-- An owner's average, count and every review from sitters, newest first. For the owner and for any sitter.
create or replace function public.owner_rating_summary(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg', (select round(avg(rating)::numeric, 1) from public.sitter_owner_notes where owner_id = p_owner),
    'count', (select count(*) from public.sitter_owner_notes where owner_id = p_owner),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_id', n.booking_id, 'rating', n.rating, 'comment', n.comment, 'created_at', n.created_at,
        'mine', n.sitter_id = auth.uid(),
        'reviewer', split_part(coalesce(p.display_name, 'A sitter'), ' ', 1)
      ) order by n.created_at desc)
      from public.sitter_owner_notes n
      join public.profiles p on p.id = n.sitter_id
      where n.owner_id = p_owner
    ), '[]'::jsonb)
  )
  where auth.uid() = p_owner or public.my_role() = 'sitter'
$$;

-- The public side of a sitter's reviews: every comment now, not only the latest three.
create or replace function public.sitter_rating_summary(p_sitter uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg', (select round(avg(rating)::numeric, 1) from public.reviews where sitter_id = p_sitter),
    'count', (select count(*) from public.reviews where sitter_id = p_sitter),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
        'reviewer', split_part(coalesce(p.display_name, 'An owner'), ' ', 1)
      ) order by r.created_at desc)
      from public.reviews r
      join public.profiles p on p.id = r.owner_id
      where r.sitter_id = p_sitter and r.comment is not null
    ), '[]'::jsonb)
  )
  where auth.uid() is not null
$$;

revoke execute on function public.owner_rating_summary(uuid) from public, anon;
grant execute on function public.owner_rating_summary(uuid) to authenticated, service_role;
