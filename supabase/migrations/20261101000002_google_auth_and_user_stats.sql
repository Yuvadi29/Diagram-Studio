-- Google sign-in profiles + user/login statistics for the Supabase dashboard.

-- ── Profiles from Google metadata (full_name / picture) ───────────────────
-- Never let profile creation block a sign-up: failures are swallowed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, email, display_name, avatar_url)
    values (
      new.id,
      new.email,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(new.email, '@', 1)
      ),
      coalesce(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), nullif(new.raw_user_meta_data ->> 'picture', ''))
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ── Login log ─────────────────────────────────────────────────────────────
-- One row per sign-in, recorded from auth.users.last_sign_in_at.
-- RLS is on with no policies and no grants: only the dashboard (postgres) and
-- the service role can read it; it is invisible to the app's public API.
create table if not exists public.user_logins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  provider text,
  logged_in_at timestamptz not null default now()
);
create index if not exists user_logins_user_idx on public.user_logins (user_id, logged_in_at desc);
create index if not exists user_logins_time_idx on public.user_logins (logged_in_at desc);
alter table public.user_logins enable row level security;
revoke all on public.user_logins from anon, authenticated;
grant all on public.user_logins to service_role;

create or replace function public.record_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is not null and (tg_op = 'INSERT' or new.last_sign_in_at is distinct from old.last_sign_in_at) then
    begin
      insert into public.user_logins (user_id, email, provider, logged_in_at)
      values (new.id, new.email, coalesce(new.raw_app_meta_data ->> 'provider', 'email'), new.last_sign_in_at);
    exception when others then
      raise warning 'record_user_login failed for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.record_user_login();

drop trigger if exists on_auth_user_first_login on auth.users;
create trigger on_auth_user_first_login
  after insert on auth.users
  for each row execute function public.record_user_login();

-- Backfill: the most recent sign-in of every existing user.
insert into public.user_logins (user_id, email, provider, logged_in_at)
select u.id, u.email, coalesce(u.raw_app_meta_data ->> 'provider', 'email'), u.last_sign_in_at
from auth.users u
where u.last_sign_in_at is not null
  and not exists (select 1 from public.user_logins l where l.user_id = u.id);

-- ── Dashboard views (Table Editor → user_stats / users_overview) ──────────
-- security_invoker: they run with the caller's privileges. anon/authenticated
-- have no grants, so the views are not reachable through the API.
create or replace view public.user_stats with (security_invoker = true) as
select
  (select count(*) from auth.users) as total_users,
  (select count(*) from auth.users where last_sign_in_at is not null) as users_who_logged_in,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours') as active_last_24h,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days') as active_last_7d,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days') as active_last_30d,
  (select count(*) from auth.users where created_at > now() - interval '24 hours') as new_users_last_24h,
  (select count(*) from auth.users where created_at > now() - interval '7 days') as new_users_last_7d,
  (select count(*) from public.user_logins where logged_in_at > now() - interval '24 hours') as logins_last_24h,
  (select count(*) from public.projects) as total_projects;

create or replace view public.users_overview with (security_invoker = true) as
select
  u.id,
  u.email,
  coalesce(p.display_name, u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') as name,
  coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
  u.created_at as signed_up_at,
  u.last_sign_in_at,
  (select count(*) from public.user_logins l where l.user_id = u.id) as login_count,
  (select count(*) from public.projects pr where pr.user_id = u.id) as project_count
from auth.users u
left join public.profiles p on p.id = u.id
order by u.last_sign_in_at desc nulls last;

revoke all on public.user_stats, public.users_overview from anon, authenticated;
grant select on public.user_stats, public.users_overview to service_role;

notify pgrst, 'reload schema';
