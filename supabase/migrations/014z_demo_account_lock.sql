-- 014z: the shared demo accounts keep their password and email (audit 2026-10-21).
--
-- The Try demo password ships in the web bundle (EXPO_PUBLIC_DEMO_PASSWORD), so anyone signed in as a demo account
-- could call auth.updateUser({ password }) or change its email and lock the judges out. Both the app and the Admin API
-- reach auth.users through the Auth server's own database role, so the role cannot tell them apart. Instead a
-- `@goldito.test` account's password and email only change inside a short unlock window that only the service role can
-- open (backend/scripts/seed_demo.py opens it, refreshes the accounts, then closes it).

create table public.demo_account_unlock (
  id boolean primary key default true check (id),
  until timestamptz not null
);

alter table public.demo_account_unlock enable row level security;

revoke all on public.demo_account_unlock from anon, authenticated;
grant all on public.demo_account_unlock to service_role;

-- Opens (5 minutes) or closes the window. Service role only.
create or replace function public.set_demo_accounts_unlocked(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.demo_account_unlock (id, until)
  values (true, case when p_on then now() + interval '5 minutes' else '-infinity'::timestamptz end)
  on conflict (id) do update set until = excluded.until
$$;

revoke execute on function public.set_demo_accounts_unlocked(boolean) from public, anon, authenticated;
grant execute on function public.set_demo_accounts_unlocked(boolean) to service_role;

create or replace function public.guard_demo_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(old.email, '')) like '%@goldito.test'
    and (new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email)
    and not exists (select 1 from public.demo_account_unlock where until > now())
  then
    raise exception 'Demo accounts cannot change their password or email.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_demo_account() from public, anon, authenticated;

create trigger guard_demo_account
  before update on auth.users
  for each row execute function public.guard_demo_account();
