-- Security amendments — run this whole file once in the Supabase SQL Editor.
--
-- Source: the `security-auditor` subagent run on the `lab/agents` branch. These are its
-- three Suggestions (S1-S3); its three Warnings were code and documentation fixes and
-- landed in the same commit as this file, needing no DDL. Nothing here changes which
-- rows a signed-in user can see: fence 1 (`lib/notes.ts`) and the four owner-only
-- policies are untouched. Two of the three narrow who can reach the table at all, and
-- the third makes a future weakening visible in a diff.
--
-- NOT named after a phase, unlike `phase7-amendments.sql`: the phases stop at 7 and this
-- work is post-gate. SPEC post-sprint debt item 7 (a dated `supabase/migrations/`
-- convention plus a permanent `verify.sql`) is the real fix for that naming problem and
-- is still parked — this is deliberately one more flat file, rather than a migration
-- convention half-adopted in passing.
--
-- Nothing here touches a row: no data is read, changed or deleted. One transaction, so a
-- failure on any statement leaves the table exactly as it is now.
--
-- AFTER THIS RUNS: `supabase/schema.sql` and SPEC Block C must be rewritten to match
-- (CLAUDE.md rule 8 — those files describe a database that exists, not one that was
-- planned), and SPEC post-sprint debt item 1 is closed by amendment 2 below. That sync is
-- a separate commit, made once the verification block at the bottom reads as described.

begin;

-- 1 ─────────────────────────────────────────────────────────────────────────────
-- Revoke the default grants on the table from `anon`.
--
-- Supabase grants DML on every new public table to both `anon` and `authenticated`, and
-- `schema.sql` has never touched table privileges — so until now row-level security was
-- the ONLY thing standing between the publishable key and every row in this table. That
-- is exactly one fence, at the layer most likely to be switched off by hand during
-- debugging and forgotten (see verification query (a) below).
--
-- Safe because no request this app makes reaches the table as `anon`: every notes query
-- goes through `lib/notes.ts`, which calls `getUser()` first and refuses to run without a
-- user, so an unauthenticated caller is turned away before a query is even built. What
-- this changes is the failure mode of a hypothetical bypass — a direct REST call carrying
-- only the publishable key now gets a permission error, instead of being handed to RLS to
-- adjudicate. Defence in depth, one line, no behaviour change.
revoke all on table public.notes from anon;

-- 2 ─────────────────────────────────────────────────────────────────────────────
-- Restrict the four policies to the `authenticated` role.
--
-- This closes SPEC post-sprint debt item 1, which parked it as "worth folding into the
-- next DDL run that happens for another reason" — this is that run. The assessment
-- recorded there still stands, and is worth restating so nobody reads this as a leak that
-- was left open: for `anon`, `auth.uid()` is null and `null = user_id` is null, never
-- true, so no row ever leaked. This is cost, not exposure. After the Phase 7 InitPlan
-- rewrite, what it saves is one InitPlan per statement rather than a call per row.
--
-- `alter policy` rather than drop-and-recreate: it changes only the role list, so the
-- table is never momentarily without the policy — not even inside this transaction.
alter policy "notes_select_own" on public.notes to authenticated;
alter policy "notes_insert_own" on public.notes to authenticated;
alter policy "notes_update_own" on public.notes to authenticated;
alter policy "notes_delete_own" on public.notes to authenticated;

-- 3 ─────────────────────────────────────────────────────────────────────────────
-- Spell out the trigger function's privilege mode instead of relying on the default.
--
-- INVOKER is already the default, so this changes nothing about how the function runs
-- today — it is a no-op, executed for the sake of the diff. The point is that the
-- opposite mode is a two-word edit which would let this function read and write rows the
-- caller's policies refuse, and a default cannot be reviewed: there is no line to notice
-- changing. Written out, the mode appears in `schema.sql`, so flipping it becomes a
-- visible change to a security-relevant line. `scripts/check.mjs` now also fails on the
-- opposite mode anywhere in `supabase/`, which is the automated half of the same guard.
alter function public.set_updated_at() security invoker;

commit;

-- ── Verify (run these after the commit; all five should read as described) ──────
--
-- a) ROW-LEVEL SECURITY IS ENABLED — expects one row, `t`:
--      select relrowsecurity from pg_class where oid = 'public.notes'::regclass;
--
--    The most important query in this repo, and it did not exist until the audit
--    (finding W1). Postgres lets policies exist on a table whose row-level security is
--    switched OFF, in which case they are simply not enforced — so `pg_policies`
--    returning four rows proves nothing about the fence, and neither does the dashboard's
--    "4 RLS policies" badge, which is the only live-fence artifact this repo holds.
--    Worse, signing in and seeing exactly your own notes ALSO passes with it off, because
--    fence 1's explicit `.eq("user_id", user.id)` scopes the rows on its own. This one
--    boolean is the only thing here that distinguishes an enforced fence from a
--    decorative one.
--
--    `relrowsecurity` is the flag that `enable row level security` sets. `relforcerowsecurity`
--    is a DIFFERENT flag — it additionally applies policies to the table's owner — and is
--    not what this project sets or needs; do not read one for the other.
--
-- b) `anon` can no longer reach the table — expects `f` for all four:
--      select p, has_table_privilege('anon', 'public.notes', p)
--      from unnest(array['select','insert','update','delete']) as p;
--
--    `has_table_privilege` rather than reading `information_schema.role_table_grants`,
--    because it answers the question actually being asked — can this role do this — and
--    accounts for privileges held indirectly through role membership, which a grants
--    table does not show. `authenticated` is deliberately NOT asserted here: it keeps its
--    grants, and the policies are what scope it.
--
-- c) Each policy now names exactly one role — expects `{authenticated}`, four times:
--      select policyname, roles, cmd from pg_policies
--      where schemaname = 'public' and tablename = 'notes'
--      order by policyname;
--
--    This also re-reads what the Phase 7 check asserted: four policies, one per verb.
--    A `{public}` in the roles column means amendment 2 did not take.
--
-- d) The trigger function is invoker-rights — expects `prosecdef` = `f`:
--      select proname, prosecdef, proconfig
--      from pg_proc where oid = 'public.set_updated_at'::regproc;
--
--    `proconfig` must STILL show the pinned, empty search_path from the Phase 7
--    amendments. Amendment 3 must not have dropped it, and that is the one way the
--    `alter function` above could regress something that was already correct.
--
-- e) The fence still holds where it counts — sign in as account A in the app, confirm the
--    workspace lists exactly A's notes, then create one and edit it so that the insert
--    policy and the trigger both run under the new role list. Amendment 1 is the one with
--    a plausible way to break the app rather than the schema, and (a) to (d) would all
--    pass while a signed-in user got a permission error.
