-- 014w: breed needs cache (11.15 S4, #185).
--
-- What the breed lookup found for a breed that is not in the reviewed list (backend/app/data/breed_needs.json):
-- up to three short needs, each from a trusted site, with the links they came from. One row per species and breed, so
-- a breed is searched once. `found = false` remembers a search that found nothing, so the same breed is not searched
-- again every time a card opens. Only the backend reads and writes it (service role): the app asks the API.

create table public.breed_notes (
  species text not null check (species in ('dog', 'cat')),
  -- Lowercase letters, digits and single spaces ("golden retriever").
  breed_key text not null check (char_length(breed_key) between 1 and 80),
  chips jsonb not null default '[]' check (jsonb_typeof(chips) = 'array'),
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  found boolean not null,
  fetched_at timestamptz not null default now(),
  primary key (species, breed_key)
);

alter table public.breed_notes enable row level security;

revoke all on public.breed_notes from anon, authenticated;
grant all on public.breed_notes to service_role;
