-- ============================================================================
-- Anchor · supabase-setup.sql — run this ONCE in a NEW Supabase project.
-- Dashboard → SQL Editor → New query → paste everything → Run.
--
-- Creates everything Anchor needs: each user's whole state as one JSON
-- document (anchor_data, revision-checked), automatic backups, and the tutor
-- platform (roles, groups, library decks, homework, notes, audit log) — all
-- locked down with row-level security, so the public site key can only ever
-- reach what each signed-in person is allowed to see.
--
-- Afterwards: make yourself admin (bottom of this file), and deploy the
-- edge function in supabase/functions/admin-users (see docs/CLOUD-SETUP.md).
-- The same changes, as applied to the live project, are in supabase/migrations/.
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

create table if not exists public.anchor_backups (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  data     jsonb not null,
  taken_at timestamptz not null default now(),
  reason   text
);
alter table public.anchor_backups enable row level security;

-- Anchor v7 · tutor platform. Additive only: existing clients keep working.
-- (Applied to production 14 Nov 2026. The admin email below is a placeholder —
--  the live project's admin was set directly.)

-- 0 · Backups hardening + full safety snapshot of every account
alter table public.anchor_backups add column if not exists kind text not null default 'manual';
alter table public.anchor_backups add column if not exists taken_by uuid;
alter table public.anchor_backups add column if not exists rev bigint;
alter table public.anchor_backups add column if not exists bytes int;
update public.anchor_backups set kind = 'legacy' where kind = 'manual';
create index if not exists anchor_backups_user_taken on public.anchor_backups (user_id, taken_at desc);
insert into public.anchor_backups (user_id, data, reason, kind, bytes)
  select user_id, data, 'snapshot before v7 tutor migration', 'migration', pg_column_size(data) from public.anchor_data;

-- 1 · Profiles
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  display_name text not null default '',
  role         text not null default 'user' check (role in ('user', 'student', 'tutor', 'admin')),
  tutor_id     uuid references auth.users (id) on delete set null,
  year_level   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists profiles_tutor on public.profiles (tutor_id);
alter table public.profiles enable row level security;

create table if not exists public.profile_notes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.profile_notes enable row level security;

insert into public.profiles (user_id, email, created_at)
  select id, coalesce(email, ''), created_at from auth.users
  on conflict (user_id) do nothing;
-- Make yourself the admin (database console only — the API can never grant it):
-- update public.profiles set role = 'admin' where email = 'YOU@example.com';

-- 2 · Access helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_tutor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('tutor', 'admin'));
$$;
create or replace function public.can_manage(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles me where me.user_id = auth.uid() and (
           me.role = 'admin'
           or (me.role = 'tutor' and exists (select 1 from public.profiles s where s.user_id = target and s.tutor_id = me.user_id))));
$$;
create or replace function public.can_access(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() = target or public.can_manage(target);
$$;
create or replace function public.my_tutor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select tutor_id from public.profiles where user_id = auth.uid();
$$;

-- 3 · Profile policies + guards
create policy "profiles: read own" on public.profiles for select using (user_id = (select auth.uid()));
create policy "profiles: read managed" on public.profiles for select using ((select public.can_manage(user_id)));
create policy "profiles: read my tutor" on public.profiles for select using (user_id = (select public.my_tutor_id()));
create policy "profiles: managers update" on public.profiles for update using ((select public.can_manage(user_id))) with check ((select public.can_manage(user_id)) or (select public.is_admin()));
create policy "notes(private): managers" on public.profile_notes for all
  using ((select public.can_manage(user_id))) with check ((select public.can_manage(user_id)));

-- The admin role can ONLY be granted/removed from the database console.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.role = 'admin' then raise exception 'admin role can only be granted from the database console'; end if;
    else
      if (old.role = 'admin') <> (new.role = 'admin') then
        raise exception 'admin role can only be changed from the database console';
      end if;
      if new.user_id <> old.user_id then raise exception 'cannot change user_id'; end if;
      if not public.is_admin() then
        if new.role not in ('user', 'student') and new.role is distinct from old.role then
          raise exception 'only the admin can make tutors';
        end if;
        if new.tutor_id is distinct from old.tutor_id and new.tutor_id is not null and new.tutor_id <> auth.uid() then
          raise exception 'tutors can only assign students to themselves';
        end if;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.update_my_profile(p_display_name text) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set display_name = left(trim(coalesce(p_display_name, '')), 60) where user_id = auth.uid();
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where user_id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();

-- 4 · Audit log
create table if not exists public.admin_audit (
  id     bigint generated always as identity primary key,
  actor  uuid default auth.uid(),
  target uuid,
  action text not null,
  detail jsonb not null default '{}',
  at     timestamptz not null default now()
);
create index if not exists admin_audit_target on public.admin_audit (target, at desc);
create index if not exists admin_audit_at on public.admin_audit (at desc);
alter table public.admin_audit enable row level security;
create policy "audit: admin reads" on public.admin_audit for select using ((select public.is_admin()));
create policy "audit: tutors write own" on public.admin_audit for insert
  with check (actor = (select auth.uid()) and (select public.is_tutor()));

-- 5 · anchor_data: revisions, server timestamps, safe backups
alter table public.anchor_data add column if not exists rev bigint not null default 0;
alter table public.anchor_data add column if not exists updated_by uuid;
update public.anchor_data set rev = 1 where rev = 0;
alter table public.anchor_data drop constraint if exists anchor_data_is_object;
alter table public.anchor_data add constraint anchor_data_is_object check (jsonb_typeof(data) = 'object');

create or replace function public.anchor_data_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.rev := old.rev + 1; new.user_id := old.user_id;
  else new.rev := 1; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists anchor_data_stamp on public.anchor_data;
create trigger anchor_data_stamp before insert or update on public.anchor_data
  for each row execute function public.anchor_data_stamp();

create or replace function public.anchor_data_backup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  k text := null;
  why text;
  ob int := pg_column_size(old.data);
  nb int := pg_column_size(new.data);
begin
  if old.data is not distinct from new.data then return null; end if;
  if actor is distinct from old.user_id then
    if not exists (select 1 from public.anchor_backups where user_id = old.user_id and kind = 'admin' and taken_at > now() - interval '10 minutes') then
      k := 'admin';
      why := 'before edit by ' || coalesce((select nullif(display_name, '') from public.profiles where user_id = actor),
                                           (select email from public.profiles where user_id = actor), 'database console');
    end if;
    if actor is not null then
      insert into public.admin_audit (actor, target, action, detail)
      values (actor, old.user_id, 'doc.write', jsonb_build_object('rev', new.rev, 'bytes', nb));
    end if;
  elsif ob > 4000 and nb < ob * 0.6 then
    k := 'shrink'; why := 'before a large shrink (' || ob || ' → ' || nb || ' bytes)';
  elsif not exists (select 1 from public.anchor_backups where user_id = old.user_id and kind = 'daily' and taken_at > now() - interval '20 hours') then
    k := 'daily'; why := 'daily automatic backup';
  end if;
  if k is not null then
    insert into public.anchor_backups (user_id, data, reason, kind, taken_by, rev, bytes)
    values (old.user_id, old.data, why, k, actor, old.rev, ob);
    delete from public.anchor_backups where id in (
      select id from public.anchor_backups where user_id = old.user_id and kind = k
      order by taken_at desc offset (case k when 'daily' then 14 when 'admin' then 40 else 10 end));
  end if;
  return null;
end $$;
drop trigger if exists anchor_data_backup on public.anchor_data;
create trigger anchor_data_backup after update on public.anchor_data
  for each row execute function public.anchor_data_backup();

drop policy if exists "Users read own data" on public.anchor_data;
drop policy if exists "Users insert own data" on public.anchor_data;
drop policy if exists "Users update own data" on public.anchor_data;
drop policy if exists "Users delete own data" on public.anchor_data;
create policy "data: read" on public.anchor_data for select using ((select public.can_access(user_id)));
create policy "data: insert" on public.anchor_data for insert with check ((select public.can_access(user_id)));
create policy "data: update" on public.anchor_data for update using ((select public.can_access(user_id))) with check ((select public.can_access(user_id)));
create policy "data: delete" on public.anchor_data for delete using (user_id = (select auth.uid()) or (select public.is_admin()));

-- conflict-safe save: writes only if nobody saved since p_base_rev, else returns the current doc to merge
create or replace function public.save_anchor(p_user uuid, p_data jsonb, p_base_rev bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.anchor_data%rowtype;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or not (p_data ? 'v') then
    raise exception 'invalid Anchor document';
  end if;
  update public.anchor_data set data = p_data where user_id = p_user and rev = p_base_rev returning * into r;
  if found then return jsonb_build_object('ok', true, 'rev', r.rev, 'updated_at', r.updated_at); end if;
  select * into r from public.anchor_data where user_id = p_user;
  if not found then
    insert into public.anchor_data (user_id, data) values (p_user, p_data)
    on conflict (user_id) do nothing returning * into r;
    if found then return jsonb_build_object('ok', true, 'rev', r.rev, 'updated_at', r.updated_at); end if;
    select * into r from public.anchor_data where user_id = p_user;
    if not found then raise exception 'not allowed'; end if;
  end if;
  return jsonb_build_object('ok', false, 'rev', r.rev, 'updated_at', r.updated_at, 'updated_by', r.updated_by, 'data', r.data);
end $$;

create policy "backups: read" on public.anchor_backups for select using ((select public.can_access(user_id)));

create or replace function public.take_backup(p_user uuid, p_reason text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare bid bigint;
begin
  if not public.can_access(p_user) then raise exception 'not allowed'; end if;
  insert into public.anchor_backups (user_id, data, reason, kind, taken_by, rev, bytes)
  select user_id, data, left(coalesce(p_reason, 'manual backup'), 200), 'manual', auth.uid(), rev, pg_column_size(data)
  from public.anchor_data where user_id = p_user returning id into bid;
  delete from public.anchor_backups where id in (
    select id from public.anchor_backups where user_id = p_user and kind = 'manual' order by taken_at desc offset 30);
  return bid;
end $$;
create or replace function public.restore_backup(p_backup bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare b public.anchor_backups%rowtype; newrev bigint;
begin
  select * into b from public.anchor_backups where id = p_backup;
  if not found or not public.can_access(b.user_id) then raise exception 'not allowed'; end if;
  perform public.take_backup(b.user_id, 'before restoring backup from ' || to_char(b.taken_at at time zone 'Australia/Sydney', 'DD Mon HH24:MI'));
  update public.anchor_data set data = b.data where user_id = b.user_id returning rev into newrev;
  if auth.uid() is distinct from b.user_id then
    insert into public.admin_audit (actor, target, action, detail) values (auth.uid(), b.user_id, 'backup.restore', jsonb_build_object('backup', p_backup));
  end if;
  return newrev;
end $$;

-- 6 · Groups
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, student_id)
);
create index if not exists group_members_student on public.group_members (student_id);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
create policy "groups: owner or admin" on public.groups for all
  using (tutor_id = (select auth.uid()) or (select public.is_admin()))
  with check ((tutor_id = (select auth.uid()) and (select public.is_tutor())) or (select public.is_admin()));
create policy "group_members: owner or admin" on public.group_members for all
  using (exists (select 1 from public.groups g where g.id = group_id and (g.tutor_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.groups g where g.id = group_id and (g.tutor_id = (select auth.uid()) or (select public.is_admin())))
              and (select public.can_manage(student_id)));

-- 7 · Library decks
create table if not exists public.library_decks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('subject', 'essay', 'chain')),
  source_id    text not null,
  title        text not null,
  description  text not null default '',
  version      int not null default 1,
  content      jsonb not null,
  card_count   int not null default 0,
  archived     boolean not null default false,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (owner_id, source_id)
);
alter table public.library_decks enable row level security;
create policy "decks: owner or admin" on public.library_decks for all
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check ((owner_id = (select auth.uid()) and (select public.is_tutor())) or (select public.is_admin()));

-- 8 · Assignments
create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id   uuid not null references auth.users (id) on delete cascade,
  group_id     uuid references public.groups (id) on delete set null,
  deck_id      uuid references public.library_decks (id) on delete set null,
  title        text not null,
  note         text not null default '',
  scope        jsonb not null default '{}',
  goal         jsonb not null default '{"type": "anchor", "pct": 100}',
  due_on       date,
  status       text not null default 'active' check (status in ('active', 'done', 'archived')),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists assignments_student on public.assignments (student_id, status);
create index if not exists assignments_tutor on public.assignments (tutor_id, status);
create index if not exists assignments_deck on public.assignments (deck_id);
alter table public.assignments enable row level security;
create policy "assignments: managers" on public.assignments for all
  using ((tutor_id = (select auth.uid()) and (select public.can_manage(student_id))) or (select public.is_admin()))
  with check ((tutor_id = (select auth.uid()) and (select public.can_manage(student_id))) or (select public.is_admin()));
create policy "assignments: student reads own" on public.assignments for select using (student_id = (select auth.uid()));

create policy "decks: students read their tutor's" on public.library_decks for select
  using (owner_id = (select public.my_tutor_id())
         or exists (select 1 from public.assignments a where a.deck_id = library_decks.id and a.student_id = (select auth.uid())));

create or replace function public.complete_assignment(p_id uuid, p_done boolean) returns void
language sql security definer set search_path = '' as $$
  update public.assignments
     set status = case when p_done then 'done' else 'active' end,
         completed_at = case when p_done then coalesce(completed_at, now()) else null end
   where id = p_id and student_id = auth.uid() and status <> 'archived';
$$;

-- 9 · Notes
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_id      uuid not null references auth.users (id) on delete cascade,
  facet      text,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notes_to on public.notes (to_id, created_at desc);
alter table public.notes enable row level security;
create policy "notes: read" on public.notes for select
  using (to_id = (select auth.uid()) or from_id = (select auth.uid()) or (select public.is_admin()));
create policy "notes: managers write" on public.notes for insert
  with check (from_id = (select auth.uid()) and (select public.can_manage(to_id)));
create policy "notes: sender or admin delete" on public.notes for delete
  using (from_id = (select auth.uid()) or (select public.is_admin()));
create or replace function public.mark_note_read(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notes set read_at = coalesce(read_at, now()) where id = p_id and to_id = auth.uid();
$$;

-- 10 · Roster with metrics computed in-database
create or replace function public.doc_streak(doc jsonb) returns int
language plpgsql stable set search_path = '' as $$
declare
  need int := greatest(1, least(10, coalesce((doc #>> '{settings,dailyGoal}')::int, 20)));
  d date := (now() at time zone 'Australia/Sydney')::date;
  n int := 0;
begin
  if coalesce((doc #>> array['act', to_char(d, 'YYYY-MM-DD'), 'n'])::int, 0) < need then d := d - 1; end if;
  while coalesce((doc #>> array['act', to_char(d, 'YYYY-MM-DD'), 'n'])::int, 0) >= need loop
    n := n + 1; d := d - 1;
    exit when n > 2000;
  end loop;
  return n;
end $$;

create or replace function public.roster() returns table (
  user_id uuid, email text, display_name text, role text, tutor_id uuid, year_level text,
  created_at timestamptz, last_sign_in_at timestamptz, doc_updated_at timestamptz, updated_by uuid, rev bigint, bytes int,
  subjects int, chains int, essays int, facets int, anchored int,
  reviews_7d int, reviews_30d int, last_study_day text, streak int,
  active_assignments int, overdue_assignments int, unread_notes int
)
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Australia/Sydney')::date;
begin
  if not public.is_tutor() then raise exception 'not allowed'; end if;
  return query
  select p.user_id, p.email, p.display_name, p.role, p.tutor_id, p.year_level,
         u.created_at, u.last_sign_in_at, d.updated_at, d.updated_by, d.rev, pg_column_size(d.data),
         coalesce(jsonb_array_length(d.data -> 'subjects'), 0),
         coalesce(jsonb_array_length(d.data -> 'chains'), 0),
         coalesce(jsonb_array_length(d.data -> 'essays'), 0),
         coalesce((select count(*)::int from jsonb_object_keys(coalesce(d.data -> 'state', '{}'))), 0),
         coalesce((select count(*)::int from jsonb_each(coalesce(d.data -> 'state', '{}')) s
                    where s.value ->> 'conf' = 'g' and coalesce((s.value ->> 'got')::int, 0) >= 3), 0),
         coalesce((select sum((a.value ->> 'n')::int)::int from jsonb_each(coalesce(d.data -> 'act', '{}')) a
                    where a.key >= to_char(today - 6, 'YYYY-MM-DD')), 0),
         coalesce((select sum((a.value ->> 'n')::int)::int from jsonb_each(coalesce(d.data -> 'act', '{}')) a
                    where a.key >= to_char(today - 29, 'YYYY-MM-DD')), 0),
         (select max(a.key) from jsonb_each(coalesce(d.data -> 'act', '{}')) a where (a.value ->> 'n')::int > 0),
         case when d.data is null then 0 else public.doc_streak(d.data) end,
         (select count(*)::int from public.assignments x where x.student_id = p.user_id and x.status = 'active'),
         (select count(*)::int from public.assignments x where x.student_id = p.user_id and x.status = 'active' and x.due_on < today),
         (select count(*)::int from public.notes n where n.to_id = p.user_id and n.read_at is null)
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.anchor_data d on d.user_id = p.user_id
  where public.is_admin() or p.tutor_id = auth.uid();
end $$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; lock them down.
-- trigger-only functions: nobody calls these over the API
revoke execute on function public.anchor_data_backup(), public.anchor_data_stamp(), public.profiles_guard(),
  public.handle_new_user(), public.handle_user_email() from public, anon, authenticated;
-- signed-in only (each checks permissions internally / via RLS)
revoke execute on function public.is_admin(), public.is_tutor(), public.can_manage(uuid), public.can_access(uuid),
  public.my_tutor_id(), public.update_my_profile(text), public.save_anchor(uuid, jsonb, bigint),
  public.take_backup(uuid, text), public.restore_backup(bigint), public.complete_assignment(uuid, boolean),
  public.mark_note_read(uuid), public.roster(), public.doc_streak(jsonb) from public, anon;
grant execute on function public.is_admin(), public.is_tutor(), public.can_manage(uuid), public.can_access(uuid),
  public.my_tutor_id(), public.update_my_profile(text), public.save_anchor(uuid, jsonb, bigint),
  public.take_backup(uuid, text), public.restore_backup(bigint), public.complete_assignment(uuid, boolean),
  public.mark_note_read(uuid), public.roster(), public.doc_streak(jsonb) to authenticated;

-- ─── Finally: make yourself the admin (only possible from this console) ───
-- update public.profiles set role = 'admin', display_name = 'Your name' where email = 'YOU@example.com';
