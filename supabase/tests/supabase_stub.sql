-- Minimal Supabase stand-in for plain Postgres (local Docker / CI only — never run on Supabase).
-- Provides what 001–003 and rls_smoke.sql expect: API roles, auth.users + auth.uid(),
-- the `extensions` schema, Supabase-style default grants, and the realtime publication.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz default now()
);

-- Same resolution order as Supabase's auth.uid().
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to public;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create publication supabase_realtime;
