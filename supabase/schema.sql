-- Notera Notes — the whole schema, as it exists in the project's Supabase database.
-- Run this file in the SQL Editor to provision a fresh project from nothing.
--
-- It already includes the Phase 7 amendments, so a fresh clone gets the current shape
-- in one pass. `phase7-amendments.sql` is the migration that brought an ALREADY
-- provisioned database here (a pinned search_path, one index dropped, the policies
-- rewritten); it is kept as the record of what ran, not as a second thing to run.

-- Notes table: one row per note, owned by exactly one auth user.
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title      text not null default '' check (char_length(title) <= 200),
  content    text not null default '' check (char_length(content) <= 50000),
  tags       text[] not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Three of the five app-level caps are also CHECK constraints above: title length,
-- content length and tag count. The other two — 24 characters per tag and 1,000 notes
-- per user — are enforced only in lib/notes.ts, because a per-element test over a
-- text[] and a per-user row count both need a trigger, and a trigger on a table that
-- autosaves while the user types is disproportionate here. Declined deliberately at the
-- Phase 7 gate; SPEC Block C records the trade-off and what it leaves open.

alter table public.notes enable row level security;

-- RLS: each verb restricted to the row owner, and the owner is auth.uid() — the id in
-- the request's JWT. The call is wrapped in `(select …)` so Postgres evaluates it ONCE
-- per statement as an InitPlan instead of once per candidate row (Supabase's
-- auth_rls_initplan advisory). `(select auth.uid()) = user_id` and `auth.uid() =
-- user_id` accept exactly the same rows; only the cost differs.
create policy "notes_select_own" on public.notes
  for select using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.notes
  for insert with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes
  for update using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes
  for delete using ((select auth.uid()) = user_id);

-- The list's ordering, owner-scoped: the screen walks (user_id, updated_at desc), and
-- updated_at is the timestamp each card prints (Block E). A matching (user_id,
-- created_at desc) index existed until Phase 7 and was dropped — nothing has ordered by
-- created_at since Phase 4, and it was a third index maintained on every autosave. One
-- `create index` brings it back if a "newest first" sort is ever added.
create index notes_user_updated_idx on public.notes (user_id, updated_at desc);

-- The tag filter is a containment predicate (tags @> ARRAY['client']). GIN is the
-- index type that answers @> on an array column; a btree cannot.
create index notes_tags_idx on public.notes using gin (tags);

-- Auto-touch updated_at on every update.
--
-- search_path is pinned empty (Supabase's function_search_path_mutable lint): a function
-- that resolves unqualified names through the CALLER's search_path can be aimed at a
-- look-alike object placed earlier in that path. Empty is safe for this body because it
-- calls only now(), which lives in pg_catalog and is resolvable regardless. Any name
-- added here later must be schema-qualified.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin new.updated_at = now(); return new; end $$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();
