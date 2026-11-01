-- Bring-your-own-key: each user stores their own cloud AI key.
-- Keys are encrypted by the app server (AES-256-GCM, API_KEY_ENCRYPTION_SECRET)
-- before they reach the database, and are never sent back to the browser.
create table if not exists public.user_ai_keys (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  provider text not null check (provider in ('gemini')),
  encrypted_key text not null check (char_length(encrypted_key) <= 2000),
  key_hint text check (key_hint is null or char_length(key_hint) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

drop trigger if exists user_ai_keys_updated_at on public.user_ai_keys;
create trigger user_ai_keys_updated_at before update on public.user_ai_keys
  for each row execute function public.set_updated_at();

alter table public.user_ai_keys enable row level security;

drop policy if exists "user_ai_keys_select_own" on public.user_ai_keys;
create policy "user_ai_keys_select_own" on public.user_ai_keys for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "user_ai_keys_insert_own" on public.user_ai_keys;
create policy "user_ai_keys_insert_own" on public.user_ai_keys for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "user_ai_keys_update_own" on public.user_ai_keys;
create policy "user_ai_keys_update_own" on public.user_ai_keys for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "user_ai_keys_delete_own" on public.user_ai_keys;
create policy "user_ai_keys_delete_own" on public.user_ai_keys for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_ai_keys to authenticated;
grant all on public.user_ai_keys to service_role;

notify pgrst, 'reload schema';
