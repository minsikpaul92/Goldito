-- 014f: sitter onboarding answers (3D.2, #139) — a numbered list the sitter answers once, shown to owners.
--
-- Each answer is a short text and, for the questions that have a few fixed choices, a choice (the chip the sitter
-- tapped, or the one read from a voice answer later). Everything is optional: a sitter can finish onboarding with
-- every question skipped. Two answers also drive the booking rules, so they are copied to the columns the rules read:
--   multiple_owners = yes / no  -> sitter_profiles.accepts_multiple_owners  (011l)
--   max_pets        = 1 … 10    -> sitter_profiles.default_max_pets         (the default spots of a slot)
-- The handoff answer (sitter_picks_up / owner_brings) is only stored here; the chat reads it as the sitter's default.
-- The free-text intro goes to sitter_profiles.bio.
--
-- `source` and `quote` are for the voice flow (docs/plan/phases/phase-03d-booking-chat.md § 3D.2 voice): a value that
-- came from a recording keeps the sentence it was read from. Typed answers have no quote.
--
-- Everything the sitter wrote is data shown to owners, never an instruction to a model.

alter table public.sitter_profiles
  add column onboarded_at timestamptz;

grant select (onboarded_at) on public.sitter_profiles to authenticated;

create table public.sitter_profile_answers (
  sitter_id uuid not null references public.profiles (id) on delete cascade,
  question_key text not null check (question_key ~ '^(multiple_owners|max_pets|walks_per_day|meals_per_day|home_all_day|activity|park_nearby|dog_sizes|cats|handoff|custom_[1-5])$'),
  question_text text check (char_length(question_text) <= 120), -- only for custom_N; built-in wording lives in the app
  answer text check (char_length(answer) <= 300),
  choice text check (char_length(choice) <= 40),
  source text not null default 'typed' check (source in ('typed', 'voice')),
  quote text check (char_length(quote) <= 300),
  position smallint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (sitter_id, question_key),
  check (answer is not null or choice is not null),
  check ((question_key like 'custom\_%') = (question_text is not null))
);

alter table public.sitter_profile_answers enable row level security;

-- The sitter reads their own answers; every owner reads every sitter's (a profile is public to owners).
create policy sitter_profile_answers_select on public.sitter_profile_answers
  for select to authenticated
  using (sitter_id = (select auth.uid()) or public.my_role() = 'owner');

revoke all on public.sitter_profile_answers from anon, authenticated;
grant select on public.sitter_profile_answers to authenticated;
grant all on public.sitter_profile_answers to service_role;

-- True when a built-in question accepts this choice.
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
    when p_key = 'handoff' then p_choice in ('sitter_picks_up', 'owner_brings')
    when p_key = 'dog_sizes' then p_choice ~ '^(small|medium|large)(,(small|medium|large)){0,2}$'
    else true -- custom_N: any short label
  end
$$;

-- Replace the whole list at once. p_answers: [{"key", "question"?, "answer"?, "choice"?, "source"?, "quote"?}, …];
-- an item with no answer and no choice is a skipped question and stores nothing. p_intro (when given) becomes the bio.
-- p_finish marks onboarding as done (once). Takes the same per-sitter lock as the schedule saves.
create or replace function public.save_sitter_answers(
  p_answers jsonb,
  p_intro text default null,
  p_finish boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  a jsonb;
  v_key text;
  v_answer text;
  v_choice text;
  v_question text;
  v_source text;
  v_quote text;
  v_pos smallint := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.my_role() is distinct from 'sitter' then raise exception 'forbidden'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 20 then
    raise exception 'invalid_answers';
  end if;
  if p_intro is not null and char_length(p_intro) > 600 then raise exception 'invalid_intro'; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  delete from public.sitter_profile_answers where sitter_id = v_uid;

  for a in select * from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(a) <> 'object' then raise exception 'invalid_answers'; end if;
    v_key := a ->> 'key';
    v_answer := nullif(btrim(a ->> 'answer'), '');
    v_choice := nullif(btrim(a ->> 'choice'), '');
    v_question := nullif(btrim(a ->> 'question'), '');
    v_source := coalesce(a ->> 'source', 'typed');
    v_quote := nullif(btrim(a ->> 'quote'), '');

    if v_key is null or v_key !~ '^(multiple_owners|max_pets|walks_per_day|meals_per_day|home_all_day|activity|park_nearby|dog_sizes|cats|handoff|custom_[1-5])$' then
      raise exception 'invalid_answers';
    end if;
    if v_source not in ('typed', 'voice') then raise exception 'invalid_answers'; end if;
    if not public.sitter_answer_choice_ok(v_key, v_choice) then raise exception 'invalid_choice'; end if;
    -- A skipped question stores nothing (a custom question with no answer is dropped too).
    continue when v_answer is null and v_choice is null;
    if v_key like 'custom\_%' and v_question is null then raise exception 'invalid_answers'; end if;
    if v_key not like 'custom\_%' then v_question := null; end if;

    insert into public.sitter_profile_answers (sitter_id, question_key, question_text, answer, choice, source, quote, position)
    values (v_uid, v_key, v_question, v_answer, v_choice, v_source,
            case when v_source = 'voice' then v_quote end, v_pos);
    v_pos := v_pos + 1;

    -- The two answers the booking rules read.
    if v_key = 'multiple_owners' and v_choice is not null then
      update public.sitter_profiles set accepts_multiple_owners = (v_choice = 'yes') where id = v_uid;
    elsif v_key = 'max_pets' and v_choice is not null then
      update public.sitter_profiles set default_max_pets = v_choice::int where id = v_uid;
    end if;
  end loop;

  if p_intro is not null then
    update public.sitter_profiles set bio = nullif(btrim(p_intro), '') where id = v_uid;
  end if;
  if p_finish then
    update public.sitter_profiles set onboarded_at = coalesce(onboarded_at, now()) where id = v_uid;
  end if;
end;
$$;

revoke execute on function public.save_sitter_answers(jsonb, text, boolean) from public, anon;
grant execute on function public.save_sitter_answers(jsonb, text, boolean) to authenticated, service_role;

revoke execute on function public.sitter_answer_choice_ok(text, text) from public, anon, authenticated;
