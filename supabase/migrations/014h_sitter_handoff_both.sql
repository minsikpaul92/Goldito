-- 014h: the handoff answer of sitter onboarding can hold both options (the sitter collects the pet and the owner brings it).
--
-- Only the list of accepted choices changes: "sitter_picks_up", "owner_brings", or both separated by a comma
-- (like dog_sizes). Everything else in sitter_answer_choice_ok stays as in 014f.

create or replace function public.sitter_answer_choice_ok(p_key text, p_choice text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_choice is null then true
    when p_key in ('multiple_owners', 'park_nearby', 'cats') then p_choice in ('yes', 'no')
    when p_key = 'max_pets' then p_choice ~ '^([1-9]|10)$'
    when p_key in ('walks_per_day', 'meals_per_day') then p_choice ~ '^[0-9]$'
    when p_key = 'home_all_day' then p_choice in ('home', 'away')
    when p_key = 'activity' then p_choice in ('active', 'relaxed')
    when p_key = 'handoff' then p_choice in ('sitter_picks_up', 'owner_brings', 'sitter_picks_up,owner_brings')
    when p_key = 'dog_sizes' then p_choice ~ '^(small|medium|large)(,(small|medium|large)){0,2}$'
    else true -- custom_N: any short label
  end
$$;

revoke execute on function public.sitter_answer_choice_ok(text, text) from public, anon, authenticated;
