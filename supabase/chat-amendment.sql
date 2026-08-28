-- Notera Notes — chat history persistence (SPEC Block B US8, second amendment).
--
-- STATUS: **RAN in the SQL Editor on 2026-08-28**, and the five uncommented verification
-- queries below read as described (owner-confirmed). `supabase/schema.sql` carries the
-- same table so a FRESH clone provisions the whole shape in one pass; this file stays as
-- the record of what ran, not as a further thing to run — the same standing as
-- `phase7-amendments.sql` and `security-amendments.sql`.
--
-- SPEC Block C holds the authoritative record of the outcome, including the `pg_policies`
-- output verbatim, because the two ABSENT policies are the append-only property and an
-- assertion in prose cannot show an absence the way the result table does.
--
-- Note which two were NOT run: probes 4 and 5 are commented out and stay that way. Each
-- writes to the table — 4 expects two REFUSALS, 5 expects a SUCCESS whose row then has to
-- be deleted — so running the file must not fire them by accident. They are there to be
-- uncommented deliberately, one at a time, by someone testing the constraint.
--
-- WHAT THIS ADDS, and the one thing it does not: a single append-only table for chat
-- turns. It does not touch `public.notes`, its policies, its indexes or its trigger — the
-- notes fences are byte-for-byte what they were, and nothing here grants any new reach
-- over them.

-- Chat turns: one row per message, owned by exactly one auth user, grouped into
-- conversations by `conversation_id`.
--
-- NO `conversations` TABLE, deliberately. A conversation is a GROUP OF MESSAGES and
-- nothing else — it has no title, no settings and no independent lifetime — so a parent
-- table would exist only to hold a primary key that this column already holds. The one
-- thing it would buy is an EMPTY conversation being able to exist, and an empty
-- conversation is exactly the state that needs no storage: "New chat" clears the screen
-- and the next message mints the id. SPEC US8 records the visible consequence (starting a
-- new chat and reloading before typing resumes the previous conversation).
create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  conversation_id uuid not null,

  -- `seq` IS THE ORDERING, and it is why this table has a column `public.notes` does not
  -- need. A question and its answer are inserted in ONE statement, inside one
  -- transaction, and `now()` is transaction-scoped — so both rows would carry an
  -- IDENTICAL `created_at` and their relative order would be undefined. A conversation
  -- whose answer can sort before its question is not a conversation. An identity column
  -- is assigned in row order within a multi-row insert, so it gives the deterministic
  -- order that a timestamp cannot. `created_at` stays for display and forensics; it is
  -- never what an ORDER BY uses.
  seq             bigint generated always as identity,

  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now(),

  -- Content bounds, and the asymmetry between the two roles is the point.
  --
  -- A USER message is capped at `LIMITS.chatMessageMax` (2,000), the same number the
  -- composer blocks at and `lib/chat.ts` re-checks — this is that cap's database fence,
  -- and unlike `LIMITS.tagMax` it IS expressible as a `check`, because it needs no
  -- subquery and no other row. (SPEC Block C's declined trigger fence stands for the two
  -- caps that genuinely need one; this is not one of them.)
  --
  -- An ASSISTANT message is bounded far more loosely, at `LIMITS.chatReplyMax`
  -- (100,000), and NOT at 2,000. The reply's length is the model's to decide, not the
  -- app's, so a 2,000-cap here would reject a perfectly good answer AFTER the call had
  -- been paid for.
  --
  -- 100,000 IS A STORAGE-SANITY BOUND, NOT A PROMISE ABOUT THE MODEL. It was originally
  -- justified as sitting above any reply the default model could physically produce —
  -- arithmetic from `openai/gpt-4o-mini`'s 16,384 max output tokens (~65,000 characters)
  -- — and that justification did not survive the first model change: at
  -- `anthropic/claude-haiku-4.5` the max is 64,000 output tokens, roughly 256,000
  -- characters. The bound is therefore reachable and is deliberately NOT raised: an
  -- over-long reply fails this check, the app SHOWS the reply and reports the exchange
  -- unsaved (`persisted: false`), and that is the path a failed write already takes.
  -- Raising it means another migration; capping the model's output would truncate real
  -- answers to protect a storage limit. See lib/types.ts for the full reasoning.
  --
  -- `role` is named in the predicate rather than the check being split in two, so the
  -- asymmetry is visible on one line to anyone reading the constraint.
  constraint chat_messages_content_bounds check (
    char_length(content) > 0
    and char_length(content) <= 100000
    and (role <> 'user' or char_length(content) <= 2000)
  )
);

alter table public.chat_messages enable row level security;

-- Take back the DML grants Supabase hands every new public table, for the same reason
-- `public.notes` does: without this, row-level security is the ONLY thing between the
-- publishable key and every row here. Nothing this app does reaches the table as `anon`
-- — `lib/chatMessages.ts` calls getUser() first and refuses without a user — so what
-- changes is the failure mode of a hypothetical bypass: a permission error instead of a
-- policy evaluation.
revoke all on table public.chat_messages from anon;

-- RLS: SELECT and INSERT only, each restricted to the row owner.
--
-- THE TWO MISSING POLICIES ARE THE FEATURE. With no `for update` and no `for delete`
-- policy, RLS denies both outright — so this table is APPEND-ONLY at the database, not
-- merely append-only by convention in the DAL. A chat transcript is a record of what was
-- said; nothing in the app edits or removes a turn, and the absence of a policy is a
-- stronger statement of that than a comment in TypeScript. Adding either later is a
-- deliberate act with a visible diff, which is the whole point.
--
-- `(select auth.uid())` wraps the call so Postgres evaluates it ONCE per statement as an
-- InitPlan rather than once per candidate row (Supabase's auth_rls_initplan advisory) —
-- the same form the four notes policies were rewritten to at the Phase 7 gate. `to
-- authenticated` keeps each policy from being evaluated for a role that can never match
-- it; for `anon`, auth.uid() is null and `null = user_id` is null, never true, so no row
-- would leak without it either. Cost, not exposure, in both cases.
create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- The one access path this table has, indexed for exactly that shape.
--
-- `lib/chatMessages.ts` reads the newest N turns for one user in ONE query — `where
-- user_id = $1 order by seq desc limit $2` — and then keeps the rows whose
-- conversation_id matches the newest row's. This index is what that walks. There is
-- deliberately NO index on `conversation_id`: no query filters by it in the database
-- (the grouping happens in the DAL, over rows already fetched), and an index nothing
-- reads is maintenance paid on every message for nothing. Add one the day a
-- conversation list needs `where conversation_id = $1`.
create index chat_messages_user_seq_idx on public.chat_messages (user_id, seq desc);

-- ---------------------------------------------------------------------------
-- VERIFICATION — run each of these after the DDL above and check the output.
-- Paste the results into SPEC Block C when flipping the pending marker.
-- ---------------------------------------------------------------------------

-- 1. RLS is on, and the table is not owned by a definer-privileged path.
--    Expect: relrowsecurity = t
select relname, relrowsecurity
from pg_class
where oid = 'public.chat_messages'::regclass;

-- 2. `anon` has no DML at all.
--    Expect: four rows, all false.
select verb, has_table_privilege('anon', 'public.chat_messages', verb) as anon_can
from (values ('select'), ('insert'), ('update'), ('delete')) as v(verb);

-- 3. Exactly two policies, both `{authenticated}`, and NOTHING for update or delete.
--    Expect: two rows — chat_messages_insert_own (INSERT), chat_messages_select_own
--    (SELECT). If an UPDATE or DELETE row appears, the append-only property is gone.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'chat_messages'
order by policyname;

-- 4. The content bounds actually bite. Both of these must FAIL.
--    Expect: 'new row ... violates check constraint "chat_messages_content_bounds"'.
--    Run them one at a time; each is meant to error. Replace the uuid with your own
--    user id from Authentication -> Users, or run them while signed in as that user.
-- insert into public.chat_messages (user_id, conversation_id, role, content)
--   values (auth.uid(), gen_random_uuid(), 'user', repeat('x', 2001));
-- insert into public.chat_messages (user_id, conversation_id, role, content)
--   values (auth.uid(), gen_random_uuid(), 'user', '');

-- 5. A 2,001-character ASSISTANT message is ACCEPTED where a user one is refused —
--    the asymmetry the constraint exists for. This one must SUCCEED; delete the row
--    afterwards as the table owner, since RLS gives nobody a delete policy.
-- insert into public.chat_messages (user_id, conversation_id, role, content)
--   values (auth.uid(), gen_random_uuid(), 'assistant', repeat('x', 2001));

-- 6. The index is there and is the one the read walks.
--    Expect: chat_messages_user_seq_idx on (user_id, seq DESC).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'chat_messages';

-- 7. After using the app: two accounts' turns stay separate, and every row has an owner.
--    Expect: one row per account that has chatted, and no null user_id.
select user_id, count(*) as turns, count(distinct conversation_id) as conversations
from public.chat_messages
group by user_id;
