-- Phase 7 schema amendments — run this whole file once in the Supabase SQL Editor.
--
-- Three changes, all owner-approved at the Phase 7 gate (SPEC Block C):
--   1. pin set_updated_at's search_path      (linter: function_search_path_mutable)
--   2. drop the superseded created_at index  (the list orders by updated_at)
--   3. rewrite the four RLS policies to (select auth.uid())   (linter: auth_rls_initplan)
--
-- Nothing here touches a row: no data is read, changed or deleted. The RLS rewrite
-- replaces each policy in a transaction, so the table is never left without its fence.
-- After it runs, supabase/schema.sql and SPEC Block C are updated to match (rule 8).
--
-- The fourth parked amendment — a database fence for LIMITS.tagMax and
-- LIMITS.notesPerUser — is DECLINED, not pending: both need a trigger on a table that
-- autosaves while the user types. It is recorded as an accepted limitation in SPEC
-- Block C, with what guards those two caps instead.

begin;

-- 1 ─────────────────────────────────────────────────────────────────────────────
-- An empty search_path is safe for this body: it calls only now(), which lives in
-- pg_catalog and is therefore always resolvable. Any name this function might later
-- reference must be schema-qualified.
alter function public.set_updated_at() set search_path = '';

-- 2 ─────────────────────────────────────────────────────────────────────────────
-- Superseded by notes_user_updated_idx (Phase 6). No query has ordered by created_at
-- since Phase 4. `if exists` so re-running this file is not an error.
drop index if exists public.notes_user_created_idx;

-- 3 ─────────────────────────────────────────────────────────────────────────────
-- (select auth.uid()) is evaluated once per statement as an InitPlan, rather than
-- once per candidate row. Same rows, same fence — this is cost, not behaviour.
drop policy if exists "notes_select_own" on public.notes;
drop policy if exists "notes_insert_own" on public.notes;
drop policy if exists "notes_update_own" on public.notes;
drop policy if exists "notes_delete_own" on public.notes;

create policy "notes_select_own" on public.notes
  for select using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.notes
  for insert with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes
  for update using ((select auth.uid()) = user_id)
              with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes
  for delete using ((select auth.uid()) = user_id);

commit;

-- ── Verify (run these after the commit; both should read as described) ──────────
--
-- a) The function's pinned path — expects {search_path=""}:
--      select proname, proconfig
--      from pg_proc
--      where oid = 'public.set_updated_at'::regproc;
--
-- b) Three indexes left, and no created_at one — expects notes_pkey,
--    notes_tags_idx, notes_user_updated_idx:
--      select indexname from pg_indexes
--      where schemaname = 'public' and tablename = 'notes'
--      order by indexname;
--
-- c) Four policies, each qualifier now wrapping auth.uid() in a subquery:
--      select policyname, cmd, qual, with_check from pg_policies
--      where schemaname = 'public' and tablename = 'notes'
--      order by policyname;
--
-- d) The fence still holds where it counts — sign in as account A in the app and
--    confirm the workspace still lists exactly A's notes. A policy rewrite that
--    typoed a column name would pass (a) to (c) and return an empty list here.
