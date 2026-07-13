-- ============================================================================
-- Anchor · supabase-setup.sql — run this ONCE in your Supabase project.
-- Dashboard → SQL Editor → New query → paste everything → Run.
--
-- Creates the one table Anchor needs (each user's whole state as one JSON
-- document) and locks it down with row-level security so every account can
-- only ever read and write its own row — even though the site's API key
-- is public.
-- ============================================================================

create table if not exists public.anchor_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.anchor_data enable row level security;

create policy "Users read own data"
  on public.anchor_data for select
  using (auth.uid() = user_id);

create policy "Users insert own data"
  on public.anchor_data for insert
  with check (auth.uid() = user_id);

create policy "Users update own data"
  on public.anchor_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own data"
  on public.anchor_data for delete
  using (auth.uid() = user_id);
