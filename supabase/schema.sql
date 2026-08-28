-- Notera Notes — the whole schema, as it exists in the project's Supabase database.
-- Run this file in the SQL Editor to provision a fresh project from nothing.
--
-- It already includes the Phase 7 amendments and the post-audit security amendments, so a
-- fresh clone gets the current shape in one pass. `phase7-amendments.sql` and
-- `security-amendments.sql` are the migrations that brought an ALREADY provisioned
-- database here; they are kept as the record of what ran, not as further things to run.
--
-- The `public.chat_messages` table at the bottom was added by the chat-persistence
-- amendment and RAN on 2026-08-28 (`chat-amendment.sql` is that migration, kept as the
-- record of what ran). So the sentence above — "as it exists" — is true of both tables,
-- which is what rule 8 asks of this file.

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

-- Take back the grants Supabase hands every new public table. It grants DML to both
-- `anon` and `authenticated`, so without this line row-level security is the ONLY thing
-- between the publishable key and every row here — one fence, at the layer most likely to
-- be switched off by hand during debugging and forgotten. Safe because nothing this app
-- does reaches the table as `anon`: every notes query goes through lib/notes.ts, which
-- calls getUser() first and refuses to run without a user. What it changes is the failure
-- mode of a hypothetical bypass — a direct REST call carrying only the publishable key
-- gets a permission error instead of being handed to RLS to adjudicate.
revoke all on table public.notes from anon;

-- RLS: each verb restricted to the row owner, and the owner is auth.uid() — the id in
-- the request's JWT. The call is wrapped in `(select …)` so Postgres evaluates it ONCE
-- per statement as an InitPlan instead of once per candidate row (Supabase's
-- auth_rls_initplan advisory). `(select auth.uid()) = user_id` and `auth.uid() =
-- user_id` accept exactly the same rows; only the cost differs.
--
-- `to authenticated` keeps each policy from being evaluated for a role that can never
-- match it: for `anon`, auth.uid() is null and `null = user_id` is null, never true, so
-- no row ever leaked without it. Cost, not exposure — and after the InitPlan rewrite
-- above what it saves is one InitPlan per statement rather than a call per row.
create policy "notes_select_own" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes
  for update to authenticated using ((select auth.uid()) = user_id)
                            with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

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
-- The privilege mode is spelled out rather than left to the default, which is already
-- invoker. A no-op that exists for the sake of the diff: the opposite mode is a two-word
-- edit that would let this function read and write rows the caller's policies refuse, and
-- a default cannot be reviewed — there is no line to notice changing. scripts/check.mjs
-- also fails on the opposite mode anywhere in supabase/.
--
-- search_path is pinned empty (Supabase's function_search_path_mutable lint): a function
-- that resolves unqualified names through the CALLER's search_path can be aimed at a
-- look-alike object placed earlier in that path. Empty is safe for this body because it
-- calls only now(), which lives in pg_catalog and is resolvable regardless. Any name
-- added here later must be schema-qualified.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin new.updated_at = now(); return new; end $$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- CHAT HISTORY — added by the chat-persistence amendment (SPEC Block B US8).
--
-- Ran on 2026-08-28. The migration for an already-provisioned database is
-- `supabase/chat-amendment.sql`, which carries the verification queries and the full
-- reasoning for every line below; this copy exists so a fresh clone gets one file to
-- run. Keep the two in step.
-- ===========================================================================

-- Chat turns: one row per message, owned by exactly one auth user, grouped into
-- conversations by `conversation_id`. There is deliberately NO `conversations` table — a
-- conversation is a group of messages and nothing else, and the one thing a parent table
-- would buy is an EMPTY conversation being able to exist, which is exactly the state that
-- needs no storage.
create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  conversation_id uuid not null,

  -- `seq` IS THE ORDERING, and it is why this table has a column public.notes does not
  -- need. A question and its answer are inserted in ONE statement, and `now()` is
  -- transaction-scoped — both rows would carry an identical `created_at` and their
  -- relative order would be undefined. An identity column is assigned in row order
  -- within a multi-row insert, which is the only thing here that gives a deterministic
  -- transcript. `created_at` stays for display; it is never what an ORDER BY uses.
  seq             bigint generated always as identity,

  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now(),

  -- The two roles are bounded DIFFERENTLY, and that asymmetry is the point. A user
  -- message is capped at LIMITS.chatMessageMax (2,000) — this is that cap's database
  -- fence, and unlike LIMITS.tagMax it needs no trigger. A reply is bounded far more
  -- loosely at LIMITS.chatReplyMax (100,000) because its length is the model's to decide,
  -- and that number is a STORAGE-SANITY bound rather than a promise about the model: at
  -- the default this project moved to it is reachable, and an over-long reply degrades to
  -- "shown but not saved" by design. See chat-amendment.sql and lib/types.ts.
  constraint chat_messages_content_bounds check (
    char_length(content) > 0
    and char_length(content) <= 100000
    and (role <> 'user' or char_length(content) <= 2000)
  )
);

alter table public.chat_messages enable row level security;

-- Same reasoning as public.notes: without this, RLS is the ONLY thing between the
-- publishable key and every row here.
revoke all on table public.chat_messages from anon;

-- SELECT and INSERT only. THE TWO MISSING POLICIES ARE THE FEATURE: with no `for update`
-- and no `for delete` policy, RLS denies both, so this table is APPEND-ONLY at the
-- database rather than by convention in the DAL. Nothing in the app edits or removes a
-- turn, and the absence of a policy states that more strongly than a comment could.
create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- The one access path this table has: `where user_id = $1 order by seq desc limit $2`,
-- which is how lib/chatMessages.ts reads the newest conversation in a single query. No
-- index on conversation_id: no query filters by it in the database (the grouping happens
-- in the DAL over rows already fetched), and an index nothing reads is maintenance paid
-- on every message for nothing.
create index chat_messages_user_seq_idx on public.chat_messages (user_id, seq desc);
