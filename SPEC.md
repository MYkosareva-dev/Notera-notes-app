# Notera Notes — Technical Specification
> Version: 1.0 | Date: 2026-08-18 | Status: Production-ready
> Tier: M | Modules: M1 Auth & Sessions, M2 Database (server-side)

## Module checklist
| # | Module | YES/NO | Reason |
|---|---|---|---|
| M1 | Auth & Sessions | **YES** | Email/password sign-in via Supabase Auth; every note is per-user |
| M2 | Database | **YES** | Notes persist in Supabase Postgres, one `notes` table |
| M3 | API Endpoints | NO | No custom HTTP API: reads happen in Server Components, writes in Server Actions, both through the Supabase SDK. See Decision in Block A |
| M4 | Payments | NO | Free tool |
| M5 | Legal & Privacy | NO | Study project; the only accounts are two dashboard-created test accounts owned by the developer; no analytics, no tracking cookies |
| M6 | i18n | NO | English-only UI, strings hardcoded via `lib/copy.ts` |
| M7 | Realtime / sync | NO | Single-user-per-account tool; two tabs are last-write-wins (edge case G-C1) |
| M8 | File upload | NO | No uploads in scope |
| M9 | Notifications | NO | System sends nothing (password-reset flow is out of scope) |
| M10 | Analytics | NO | Privacy + simplicity |
| M11 | Cron | NO | No time-driven behavior |
| M12 | Third-party integrations | NO | Supabase is the backend itself (covered by M1/M2); zero other runtime integrations |
| M13 | Performance & scale | NO | Hard cap: 1,000 notes per user (rule B7) replaces the section |
| M14 | Admin panel | NO | No operators |
| M15 | AI/LLM | NO | None |

---

## BLOCK A: Overview

A private, per-user notes app. A signed-in user creates, edits and deletes their own notes; each account sees only its own rows. Unauthenticated visitors can reach only the sign-in page. Runs locally via `npm run dev`; nothing is deployed this sprint.

### Stack
| Item | Choice | Constraint |
|---|---|---|
| Framework | Next.js (latest stable), **App Router only** | Pages Router prohibited |
| Language | TypeScript, `strict: true`, `noUnusedLocals: true` | No `any` in committed code |
| Styling | Tailwind CSS | No CSS modules, no styled-components |
| Backend | Supabase: Postgres + Supabase Auth | The ONLY persistence layer |
| Supabase clients | `@supabase/supabase-js` + `@supabase/ssr` | Session lives in **cookies**, never in `localStorage` |
| Icons | `lucide-react` | Carried over from Notera |
| Font | Inter via `next/font/google` | Fallback `system-ui` |
| Runtime | Node ≥ 20, local `npm run dev` on `localhost:3000` | No build/deploy targets this sprint |
| **Prohibited** | Pages Router; any ORM (Prisma/Drizzle); custom password handling of any kind; the service-role key anywhere in the app code or in any `NEXT_PUBLIC_*` variable; `localStorage`/`sessionStorage` for note data or session data; `dangerouslySetInnerHTML`; any other npm dependency without explicit owner approval | |

> Decision: No custom `/api` routes (M3 = NO). Reads run in Server Components, mutations in Server Actions; both call Supabase with the anon key under RLS. This removes an entire layer where auth mistakes could hide, and the server-side session check is exactly what the sprint grades.
> Decision: auth cookies keep `@supabase/ssr` default options (`path: /`, `sameSite: lax`, `httpOnly: false`, 400-day `maxAge`). `httpOnly: false` is what the official cookie pattern ships, because `createBrowserClient` reads the session through `document.cookie`; forcing `httpOnly: true` would break that documented contract and the `supabase/client.ts` entry above. Accepted for a local-only sprint with no injection sink in the app (no `dangerouslySetInnerHTML`, every string from `lib/copy.ts`) — revisit at deployment, together with `secure` in production.
> Decision: Sessions are cookie-based via `@supabase/ssr`, because the server must be able to verify the session before rendering protected pages; the default browser client stores sessions in `localStorage`, which the server cannot see and which the assignment prohibits.
> Decision: On the server the ONLY way to read the authenticated user is `supabase.auth.getUser()`. `getSession()` does not validate the JWT and is prohibited for any access decision.
> Decision (from the P0 persistence consultation): all notes data access goes through ONE `server-only` module, `lib/notes.ts` (the DAL). It calls `getUser()` itself and refuses to run without a user. Rationale: every Server Action is a publicly callable POST endpoint and Next.js protects nothing by itself; a single chokepoint turns per-function discipline into one auditable file. The module seam also replaces the previous project's HTTP seam: same substitutability, no cookie-forwarding hazard, and a browser cannot call it.
> Decision: There is no sign-up, password-reset or email flow. Test accounts are created by hand in the Supabase dashboard (assignment requirement 1).
> Decision: UI copy is English; all user-visible strings live in `lib/copy.ts` (rule B5).

### Repository layout
```
app/
  layout.tsx                 # Root layout: Inter font, <Toaster/>
  page.tsx                   # redirect("/notes")
  error.tsx                  # Global error boundary (recoverable screen + Try again)
  not-found.tsx              # Friendly 404
  sign-in/page.tsx           # Public sign-in page (Server Component + <SignInForm/>)
  sign-in/actions.ts         # Server Action: signIn (public page never imports from notes/)
  notes/layout.tsx           # PROTECTED layout: server-side getUser() check → redirect("/sign-in")
  notes/page.tsx             # Notes list (Server Component fetch) + tag filter
  notes/actions.ts           # Server Actions: createNote, updateNote, deleteNote, signOut
  notes/[id]/page.tsx        # Note editor page (Server Component fetch → <NoteEditor/>)
  notes/[id]/not-found.tsx   # "This note doesn't exist (anymore)."
proxy.ts                     # Session refresh + redirect unauthenticated /notes* → /sign-in
components/
  SignInForm.tsx  SignOutButton.tsx  NoteCard.tsx  NoteEditor.tsx
  TagEditor.tsx  TagFilter.tsx
  Header.tsx  EmptyState.tsx  ConfirmDialog.tsx  Toast.tsx  Skeletons.tsx
lib/
  notes.ts                   # server-only data-access layer (DAL): ALL notes reads/writes; calls getUser() itself, throws/redirects when no user
  supabase/server.ts         # createServerClient (cookies) — used by the DAL and auth actions
  supabase/proxy.ts          # session refresh helper for proxy.ts
  supabase/client.ts         # createBrowserClient — ONLY where a client component must call auth
  supabase/env.ts            # the two NEXT_PUBLIC_* vars, read once and validated
  types.ts                   # Note type, LIMITS
  validation.ts              # shared input predicates (email shape), used by form AND action
  copy.ts                    # every user-visible string; numbers interpolated from LIMITS
docs/                        # pasted official Supabase/Next docs fetched via Context7, each with "Source: <url>" + annotations
docs/persistence-decision.md # public record of the P0 persistence consultation
.claude/commands/review-auth.md
supabase/schema.sql          # the exact SQL from Block C (also executed in the SQL Editor)
.env.example                 # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY + where to find values
.gitignore                   # root-anchored patterns: /node_modules/, /.next/, /.env*.local
CLAUDE.md  README.md  REFLECTION.md  SPEC.md  BUILD_PHASES.md  PHASE_PROMPTS.md
WORKLOG.md (private, gitignored)
```

### Roles
| Role | Description | Access |
|---|---|---|
| Authenticated user | Signed in via a dashboard-created test account | Full CRUD on **their own** notes only |
| Unauthenticated visitor | No valid session | `/sign-in` only; every `/notes*` URL redirects to `/sign-in` |

### Routes
| Path | Screen | Access |
|---|---|---|
| `/` | Redirect to `/notes` | Any (redirect target enforces auth) |
| `/sign-in` | Sign-in form | Public; a signed-in visitor is redirected to `/notes` |
| `/notes` | Notes list + tag filter + New note | Authenticated only (`proxy.ts` + `notes/layout.tsx` server check) |
| `/notes/[id]` | Note editor | Authenticated only; a note not owned by the user → `notFound()` |
| unknown `/notes/[id]` | `notes/[id]/not-found.tsx` | Authenticated |

---

## BLOCK B: User Stories

Persona: **Mara**, a freelance illustrator who keeps client briefs and ideas as short notes. She has a test account `account-a` created in the Supabase dashboard.

### US1 — Sign in
1. Mara opens `http://localhost:3000` → is redirected to `/sign-in` (no session).
2. She enters her email and a wrong password → inline error "Email or password is incorrect." — the form stays filled except the password.
3. She enters the correct password → redirected to `/notes`.
4. She reloads `/notes` → still signed in (cookie session survives reload).
- [ ] Wrong credentials show the exact copy above, nothing else (no Supabase raw error)
- [ ] Successful sign-in lands on `/notes`
- [ ] Session survives a full page reload
- [ ] A signed-in user opening `/sign-in` is redirected to `/notes`

### US2 — Workspace is private
1. Mara signs out via the header button → redirected to `/sign-in`.
2. She pastes `http://localhost:3000/notes` into the address bar → the server redirects to `/sign-in`, and no note content is fetched because the DAL refuses without a user.
3. She pastes a direct note URL `/notes/9f2e…` → same redirect.
- [ ] No `/notes*` URL renders any note data without a valid session — owned by fence 1 (`lib/notes.ts`); the layout redirect alone does not stop a page from rendering
- [ ] The check happens server-side (disabling JS does not expose the workspace)
- [ ] Sign-out clears the session cookie

### US3 — Create a note
1. On `/notes` Mara clicks **New note** → a Server Action inserts a row (`title: ""`, `content: ""`) and redirects to `/notes/[newId]`.
2. She types a title and content → the editor autosaves on a 300 ms debounce (rule B2).
3. Supabase is unreachable mid-save → toast "Couldn't save. Retrying…", retry ×3 with backoff; on final failure a persistent banner with **Retry now** appears; her typed text is never rolled back.
4. She reloads the page → the note is there with the saved text.
- [ ] Note exists in Supabase `notes` table with her `user_id`
- [ ] Reload shows the saved title and content
- [ ] Save failure shows the exact toast copy and never loses in-memory text
- [ ] An empty title renders as "Untitled" in the list (stored as `""`)

### US4 — Edit and delete
1. Mara opens a note from the list, edits the title inline, edits the content → autosave.
2. She clicks **Delete** → `ConfirmDialog` "Delete this note? This can't be undone." with **Delete** / **Cancel**.
3. Cancel → nothing happens. Delete → row removed, redirect to `/notes`, toast "Note deleted."
4. She reloads `/notes` → the note is gone.
- [ ] Edit persists across reload
- [ ] Delete asks for confirmation before destroying content
- [ ] Deleted note's URL now renders the not-found screen

### US5 — Tags *(optional task, delivered on branch `feat/tags`)*
1. On a note page Mara adds tags `client` and `urgent` via `TagEditor` (Enter commits a tag; leaving the field commits what is in it; × removes one, and focus returns to the tag input).
2. She tries an 11th tag → toast built from `LIMITS.tagsPerNote`: "A note can have up to 10 tags."
3. On `/notes` she clicks the `client` chip in `TagFilter` — in the right-hand column on her laptop, in the cloud above the grid on her phone — → the list re-fetches **from Supabase** filtered by the tag (`.contains('tags', [tag])`), not in the browser.
4. She clicks **All tags** → the full list returns.
- [ ] Tags persist across reload
- [ ] Tag filter queries the database, not client memory
- [ ] Cap message text is derived from `LIMITS`, not typed out
> Decision (Phase 6 full-review gate): **blur commits, not only Enter.** Step 1 originally specified Enter alone, which meant typing `urgent` and clicking into the textarea discarded it silently — while the debounced save fired for the other fields and the indicator settled on "Saved". This app spends `callAction`, rule B8's whole ladder and the unmount flush on never losing typed text; a field that drops it on a click was the one place that promise did not hold. A tag REJECTED on blur still keeps its text and still toasts, so the stricter path loses nothing either. Navigating away with the back link blurs the field first, so the commit lands inside the unmount flush (G-12) rather than racing it.
> Decision (same gate): **removing a chip returns focus to the tag input.** The × destroys itself, and removing the last chip unmounts the whole list, so focus fell to `<body>` and the next keystroke went nowhere — on a keyboard, the difference between removing three chips and removing one. Same rule the Toast viewport already follows: a control that vanishes owes the caret back. The input is the target because it is the only control in the row guaranteed to still be mounted.

### US6 — Two accounts see different data
1. Mara signs out; her colleague signs in with `account-b` (second dashboard-created account).
2. `/notes` shows an empty state — none of Mara's notes.
3. `account-b` pastes the direct URL of Mara's note → `notFound()` screen, not the note.
- [ ] Account B sees zero of Account A's notes in the list
- [ ] Direct URL access to a foreign note renders not-found (RLS returns no row)
- [ ] SQL Editor shows rows with two distinct `user_id` values

> Scope decision: IN — sign-in/out, protected workspace, notes CRUD with autosave, tags + tag filter, minimalist Notera-derived design, dark-mode toggle. OUT — do NOT build: sign-up page, password reset, search, image uploads, sharing, realtime sync, kanban boards, note-to-note links, export. The OUT list is a prohibition, not a backlog.
>
> **Amendment — 2026-08-24, owner override, branch `lab/agents`.** `dark mode` moved OUT → IN
> for a lab exercise on subagent workflows. This is the only item ever moved off the OUT list;
> every remaining entry is unchanged and still a prohibition, and rule 17 continues to bind for
> all of them. The approach was proposed and approved at an architect gate before any
> code was written; the acceptance boxes are US7 below.

### US7 — Dark mode *(owner override, branch `lab/agents`)*
1. Mara opens `/sign-in` on a machine set to dark → the page is already dark, with no
   flash of light and no correction after load; the control shows **System**.
2. She picks **Light** → the page turns light immediately and stays light after a
   reload, and stays light even though her OS is still dark.
3. She signs in; `/notes` and the editor honour the same choice, and the control in the
   header shows **Light**.
4. She picks **System** → the choice is cleared and the page follows the OS again.
- [ ] The first paint matches the stored preference — no flash, on any of the three states
- [ ] An explicit **Light** choice survives a dark OS, and the reverse
- [ ] The choice survives a reload, a sign-out and a sign-in
- [ ] The control is reachable and correct on `/sign-in`, before any account exists
- [ ] Keyboard: one tab stop for the group, arrows move between the three options
- [ ] Both themes readable at 1280 and 375; nothing overflows in either

---

## BLOCK C: Data Model

```
auth.users (managed by Supabase Auth — never modified by this app)
    1 ──────────── N
public.notes (user_id)
```

### `supabase/schema.sql` — execute in the Supabase SQL Editor
```sql
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
```

> Decision (Phase 4 gate): the list is ordered by **`updated_at desc`**, not `created_at desc`, so the order follows the timestamp the card prints (Block E). Sorting by one column while displaying another produced a list whose order contradicted its own labels — edit an old note and it stayed at the bottom saying "2 minutes ago". Through Phase 5 the only index was `(user_id, created_at desc)`, so the query sorted instead of walking an index; the matching `(user_id, updated_at desc)` was deliberately left to the Phase 6 amendment batch rather than slipped in as an un-run DDL edit (rule 8). **It shipped in Phase 6 — see the index decision below.**
> Decision: RLS is enabled even though the assignment only demands query-level filtering. RLS is the server-enforced second fence: even a buggy query cannot leak foreign rows. Application queries STILL filter by `user_id` explicitly (rule B4) — defense in depth, and the explicit filter uses the index.
> Decision: tags are a `text[]` column, not a join table. One user's tags never interact with another's, cardinality is tiny (≤10), and the tag filter is a single `contains` query. A join table would double the RLS surface for zero benefit at this size.
> Decision (Phase 6, owner-run): **`listNotes`'s two access paths now each have their index.** The query orders by `updated_at desc` (Phase 4's decision, above) and, when a chip is selected, adds `tags @> ARRAY[…]`; through Phase 5 both were answered by scanning and sorting the owner's rows. `notes_user_updated_idx` is what the ordering walks, and `notes_tags_idx` is a **GIN** index because `@>` on an array is not a btree operation — without it the containment predicate is re-checked row by row no matter how selective the tag is. Both were executed in the SQL Editor by the owner at the Phase 6 gate and are written here in the same change (rule 8), which closes two of the four amendments parked at the Phase 2 gate.
> The honest cost, recorded so nobody has to rediscover it: a GIN index is maintained on **every write**, and this app writes on a 300 ms autosave debounce while the user types. At `LIMITS.notesPerUser` = 1,000 rows neither index earns much — the owner filter alone cuts to a tiny set — so this is the shape being right rather than a measured speed-up, and the write cost is the price of that. `notes_user_created_idx` was kept through Phase 6 even though no query orders by `created_at`. **It was dropped at the Phase 7 gate — see the amendment decision below.**

> Decision (Phase 7 gate, owner-run): **three amendments, and the fourth declined.** The DDL is `supabase/phase7-amendments.sql`; it **ran in the SQL Editor at the gate**, and its four verification queries read as described — `proconfig` shows the pinned `search_path`, `pg_indexes` lists three indexes with the `created_at` one gone, `pg_policies` shows all four qualifiers in the InitPlan form, and account A's workspace still lists exactly A's notes. The code block above and `supabase/schema.sql` were rewritten in the same change to match what now exists (rule 8 — these files describe a database that exists, not one that was planned). `phase7-amendments.sql` stays in the repo as the record of what ran; `schema.sql` alone provisions a fresh project.
> 1. **`set_updated_at` gets a pinned `search_path`.** `alter function public.set_updated_at() set search_path = ''` — Supabase's linter raises `function_search_path_mutable` on any function without one, because a function that resolves unqualified names through the *caller's* `search_path` can be aimed at a look-alike object placed earlier in that path. This body only assigns `new.updated_at = now()`, and `now()` lives in `pg_catalog`, which is always in scope regardless of `search_path` — so an empty path is safe here and the warning goes away for a real reason rather than by suppression.
> 2. **`notes_user_created_idx` dropped.** Since Phase 4 the list orders by `updated_at desc`, and Phase 6 added `notes_user_updated_idx` to answer exactly that; the `created_at` pair has had no reader since. Keeping it means a third index maintained on a table that writes on a 300 ms autosave debounce, to serve an ordering nothing asks for. If a "newest first" sort is ever added, this is one `create index` away.
> 3. **The four RLS policies rewritten to `(select auth.uid()) = user_id`.** Supabase's `auth_rls_initplan` advisory: wrapped in a scalar subquery the call becomes an InitPlan, evaluated **once per statement** instead of once per candidate row. The predicate is semantically identical — same rows, same fence — so this is cost, not behaviour. **Magnitude, stated so "once per candidate row" is not read as table-wide:** rule 7 already puts an explicit `.eq("user_id", user.id)` on every query, so the candidate set was never the whole table — it is the owner's rows (≤ `LIMITS.notesPerUser` = 1,000) for a list, and one or two rows for the primary-key paths. At that size this buys well under 1% of one request. Like the GIN index above, it is **the shape being right rather than a measured speed-up**; it silences a real advisory and costs nothing, and the security fence it rides on is the explicit filter, not this.
> 4. **DECLINED — a database fence for `LIMITS.tagMax` (24 characters per tag) and `LIMITS.notesPerUser` (1,000 rows per user).** Neither is expressible as a `check` constraint here: a per-element length test over a `text[]` needs a subquery, and a per-user row count needs to see other rows, so both mean a **trigger** — a plpgsql function on every insert and update of the table that autosaves while the user types. That is disproportionate for a local study project with two accounts, and it is the same write path the GIN index already taxes.
>
>    **Accepted, documented limitation.** What guards these two caps instead: `lib/notes.ts` enforces both on write (`createNote` counts rows before inserting; `updateNote` refuses a patch holding an over-long tag), and the read side refuses an over-long *filter* value without a round-trip. What stays unguarded is precisely one thing — a row written by hand in the SQL Editor can hold a tag longer than 24 characters or push an account past 1,000 notes, and the database will accept it. The blast radius is small and known: an over-long stored tag renders truncated on the card (`lib/tagChip.ts`), and it makes the next tag patch on that note fail validation until it is removed. The three constraints that ARE in the schema (title length, content length, tag count) stay as the second fence for the caps that a `check` can express. Revisit if this app ever gains a second writer that is not `lib/notes.ts`.

### Seed data (run AFTER creating the two test accounts; replace the UUIDs with the real ones from Authentication → Users)
```sql
insert into public.notes (user_id, title, content, tags) values
  ('11111111-aaaa-4bbb-8ccc-000000000001', 'Brief: Hoffmann bakery logo', 'Warm palette, hand-drawn type. Deadline Friday. Client hates gradients.', '{client,urgent}'),
  ('11111111-aaaa-4bbb-8ccc-000000000001', 'Idea: birds sketchbook series', 'Ten common city birds, one per spread, ink + one accent colour.', '{ideas}'),
  ('22222222-bbbb-4ccc-8ddd-000000000002', 'Grocery list', 'Oat milk, rye bread, tomatoes.', '{}');
```

### `lib/types.ts` core
```ts
export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string; // ISO 8601
  updated_at: string;
}

export const LIMITS = {
  titleMax: 200,
  contentMax: 50_000,
  tagMax: 24,        // characters per tag
  tagsPerNote: 10,
  notesPerUser: 1_000,
} as const;
```

---

## BLOCK D: API Endpoints
Skipped (M3 = NO — see module checklist and the Decision note in Block A).

---

## BLOCK E: UI/UX

Design language is carried over from Notera: neutral surface, generous spacing, Inter, soft shadows. Test widths: **1280** and **375** — nothing may overflow at either.
> Decision (Phase 6): this line used to promise Notera's **12-colour chip palette reused for tags**, and it is corrected rather than implemented. Twelve hues would be twelve new tokens on a palette Phase 5 closed with "no new hue enters the palette", and they would have to *mean* something — a colour per tag is a category signal, and this app has no categories, so the mapping would have to be a hash of the tag text: stable, arbitrary, and unexplainable to the person reading it. Tag chips therefore take no new hue. What every chip shares — pill radius, medium weight, and truncation with a `title` so a clipped 24-character tag stays readable — lives in `lib/tagChip.ts` and is imported by all three sites (rule 11). Colour splits by ROLE: the STATIC chips (card, editor) use the accent tint (`--color-accent-soft` ground, `--color-accent` text), while `TagFilter`'s chips are LINKS WITH A SELECTED STATE, so their idle form is neutral (`--color-surface` on `--color-border`) and only the selected one takes solid accent. Sizes differ by site on purpose: the card is a dense preview and its chips are the smallest; the editor's are padded asymmetrically to sit against their × button.
> Decision (Phase 6 full-review gate): this paragraph previously claimed "the same chip shape in all three places" and the accent tint everywhere, and the code disagreed — the filter's idle chip was already neutral. The CODE was right and the sentence was corrected, not the CSS: an accent-tinted idle chip beside an accent-filled selected chip reads as two selected states, which is precisely the thing a filter must not be ambiguous about. The divergence is recorded rather than quietly patched because it is the shape rule 18 exists to catch — a SPEC sentence written from intent and never re-read against what shipped. Recorded here because the promise was in this file first (rule 18).

### Design tokens (paste-ready CSS vars, from Notera)
```css
:root {
  --color-bg: #f6f7f9;
  --color-surface: #ffffff;
  --color-border: #e4e7ec;
  --color-text: #1a1d23;
  --color-text-muted: #6b7280;
  --color-accent: #4f46e5;
  --color-accent-soft: #eef2ff;
  --color-danger: #dc2626;
  --radius-card: 14px;
  --shadow-card: 0 1px 3px rgb(16 24 40 / 0.07), 0 1px 2px rgb(16 24 40 / 0.04);
}
```

Phase 5 adds six DERIVED tokens beside them in `app/globals.css` — the pressed shade of the same indigo and of the same red, the palest tint of that red, a control radius under the card radius, and the same shadow recipe at two more depths. No new hue enters the palette. A token was added where a value repeats ACROSS FILES; a few one-off alphas (`border-text/15`, `ring-danger/*`, `text-text-muted/70`) are still written inline, so this list is the shared vocabulary and not an index of every colour the app computes. Naming those is parked as post-sprint debt.

```css
  --color-accent-strong: #4338ca; /* accent, one step down: hover/active fill */
  --color-danger-strong: #b91c1c; /* danger, one step down: hover/active fill */
  --color-danger-soft: #fef2f2; /* the palette red at its palest: a loud ground */
  --radius-control: 10px; /* buttons, inputs, menu items — smaller than a card */
  --shadow-card-hover: 0 4px 12px rgb(16 24 40 / 0.08), 0 2px 4px rgb(16 24 40 / 0.05);
  --shadow-pop: 0 12px 28px rgb(16 24 40 / 0.12), 0 2px 6px rgb(16 24 40 / 0.06);
```

Phase 5 adds exactly one new motion: a 160 ms entrance (`--animate-rise`) for things that appear over the page — toast, menu, dialog — plus colour and shadow transitions on hover. It does not touch the two pre-existing looping animations, the `animate-spin` on a pending submit and the `animate-pulse` on skeleton bars. Every animation in the app, new and old, is suppressed under `prefers-reduced-motion: reduce`.

### Dark palette (Block B US7)

Dark mode is a **token swap and nothing else**: every colour in the app is already a
`@theme` variable, so the dark theme redefines those variables and no component gains a
`dark:` utility. The dark values are the same indigo, red and neutral ramp read from the
other end — no new hue, the rule Phase 5 closed with — and twice literally, since the
dark surface is the light palette's ink (`#1a1d23`) and the dark ink is the light
palette's ground (`#f6f7f9`).

```css
  --dark-color-bg: #12141a;         --dark-color-accent: #a5b4fc;
  --dark-color-surface: #1a1d23;    --dark-color-accent-soft: #23263f;
  --dark-color-border: #2b303a;     --dark-color-accent-strong: #c7d2fe;
  --dark-color-text: #f6f7f9;       --dark-color-danger: #f87171;
  --dark-color-text-muted: #9aa3b2; --dark-color-danger-soft: #2a1719;
  --dark-color-on-accent: #12141a;  --dark-color-danger-strong: #fca5a5;
  /* plus the three shadows at real black, much higher alpha */
```

One COLOUR token is added to the light palette as well: `--color-on-accent` (`#ffffff`),
the ink that sits on a filled accent or danger control. Six places wrote `text-white`
directly on such a fill, and white is right on a dark indigo and wrong on a light one —
so the literal had to become a token before the palette could invert. That closes six of
the un-tokenized one-offs the Phase 5 gate parked. The seventeen alpha-of-token
utilities (`border-text/15`, `text-text-muted/70`, `ring-danger/*`, `bg-surface/95`,
`bg-bg/85` and the rest) stay inline and stay fine, because an alpha OF a token inverts
with the token for free.
> Decision (code-review gate, this branch): `--color-scrim` is the SECOND token dark mode
> forced, and it is the exception that proves the sentence above. `ConfirmDialog`'s
> backdrop was `bg-text/40` — an alpha of the ink — which is a scrim on a white page and a
> 40% WHITE HAZE the moment the ink goes light, losing the elevation cue on the one
> control in the app that must not lose it. A scrim always darkens what is behind it, in
> both themes, so it cannot be an alpha of anything that inverts; it is now its own token
> carrying its own opacity (`rgb(16 24 40 / 0.4)` light, `rgb(0 0 0 / 0.62)` dark). The
> "inverts for free" rule holds for every alpha whose ROLE follows its neighbours — and a
> scrim's does not.

**Three states, one attribute.** `data-theme="dark"` and `data-theme="light"` are the
explicit choices; NO attribute is `system`, and with nothing stamped the
`prefers-color-scheme` block in `app/globals.css` decides. `:not([data-theme="light"])`
on that block is what lets an explicit Light choice survive a dark OS.

**No flash, and no inline script.** The preference is a COOKIE, read in
`app/layout.tsx`, so the attribute goes out with the first byte and CSS resolves the
palette before anything paints. Web storage cannot do this — the server cannot read it —
which is why the usual `next-themes` shape needs a blocking script in `<head>`. It is
also why the cookie is not a Supabase column: `/sign-in` must carry the control before
there is a user to key a row to. Nothing about this reaches Postgres, so rule 8 is
untouched. `color-scheme` is set alongside the tokens, or form controls, scrollbars and
the caret stay light on a dark page.
> Decision: the control is THREE-STATE, not a two-way toggle (owner decision at the
> architect gate). A two-way toggle has to say which side it is on, and for a visitor
> with no cookie the server cannot know — their OS preference never reaches the request.
> It would either guess the icon and correct itself after hydration, or render nothing
> decisive and be briefly inert. **System** is a truthful third answer, so the page and
> the control are both right from the first byte.
> Decision: rule 6 gained one sentence rather than an exception — a non-secret display
> preference in a cookie is neither note nor session data. Written down rather than
> assumed, so a later `/review-auth` does not have to re-derive it.
> Decision (owner, at the code-review gate): the toggle is on `/sign-in` and in
> `Header`, and **stays off `/notes/[id]`**. Choosing a theme is a RARE action — once per
> person, or once per change of mind — and it is reachable from both screens a person
> passes through on the way to a note. The editor has no header, and its sticky row is
> specified here with two controls that are both about the text being typed; a third
> control there would be the only one on that screen with nothing to do with the note.
> Asked and answered, so it is not an open question: the cost is one extra hop from the
> editor to `/notes`, and that is accepted rather than overlooked.

### Screen: `/sign-in`
- Layout: centered card (max-w-sm) on `--color-bg`; app name "Notera Notes" above the card; the theme control absolutely positioned in the top-right corner, so it does not push the card off the vertical middle.
- Fields: email (`type=email`, autocomplete `username`), password (`type=password`, autocomplete `current-password`) with a show/hide toggle — an icon-only `type="button"` (lucide `Eye` / `EyeOff`) inside the field's right edge that switches the input between `password` and `text`, default hidden, `aria-label` from `lib/copy.ts` — and submit **Sign in** (full-width, accent).
- States: **Loading** — button shows spinner + disabled while the action runs; **Empty** — n/a (a form is its own empty state; recorded decision); **Error** — inline text under the form, exact copy: "Email or password is incorrect." for bad credentials, "Something went wrong. Try again." for any other failure.
- Actions: submit → Server Action `signIn` → success `redirect("/notes")` / failure shows the inline error, password field cleared.

### Screen: `/notes`
- Layout: `Header` — sticky at the top of the viewport, on a 95%-opaque surface so the grid scrolls under it rather than behind a hard edge (app name and a decorative mark left; the theme control, then **New note** and **Sign out**, right); below it the workspace splits into `TagFilter` and a responsive card grid, **most recently updated first** — the same timestamp each card displays. **At `md` and up** `TagFilter` is a right-hand COLUMN 224 px wide (240 px from `lg`) beside the grid: an **All tags** button across the top of it, then one chip per distinct tag of the user's notes, alphabetical, wrapping down the column. It scrolls with the page — no sticky, no scroll area of its own. **Below `md`** there is no column: the same items are a wrapping cloud above the grid, **All tags** first, on as many lines as they need. The grid takes whatever width is left: 1 column at 375, 2 from `md`, 3 at 1280.
> Decision (Phase 6, owner request): the first build made that row a single line with `overflow-x-auto`, which is unusable past about sixteen tags — the seventeenth is reachable only by a horizontal drag, on a page that has no other sideways motion, and there is no way to see how many tags you have. The replacement is a layout change ONLY: same `listTags()` data, same `?tag=` URL, same server-side `.contains` query. What changed is how much width the list is allowed, so it wraps after one chip in a column instead of scrolling off the side of a row.
> Decision: **one DOM tree, not two.** The cloud and the sidebar are the same wrapping flex list under different width constraints; the only breakpoint-aware class inside `TagFilter` is `md:w-full` on the All tags item, which makes it take its whole line so the tags begin on the next one. The alternative — rendering the list twice behind `hidden`/`md:block` — would put two copies of every link in the accessibility tree and two `nav` landmarks with the same name. Placement (which side, how wide) is passed in by `/notes`, so the component decides nothing about where it sits.
> Decision: the third grid column moves from `lg` to `xl`. Column count is measured against the width the sidebar LEAVES, not the viewport: at `lg` three cards beside a 240 px column are ~224 px each, and two are comfortable. 1280 still shows three, which is what this block promises.
- `NoteCard`: title (or "Untitled" in muted style when empty), 2-line content preview, tag chips, `updated_at` as relative date, and a `MoreMenu` "⋮" trigger in the top-right corner — revealed on hover (or keyboard focus) where the pointer HAS hover, always visible where it does not, and kept visible while its own menu is open.
> Decision (Phase 5, from the Phase 4 fresh-session review): the condition is `@media (hover: hover)`, not a width breakpoint. It was `sm:` through Phase 4, which reads "wide screen" as "has a mouse" — so on any touch screen wider than 640 px the trigger sat invisible-and-tappable in the corner of every card, and a tap there opened a menu the user could not see. Verified in Chrome over CDP at 1280 (opacity 0 at rest, 1 on hover), at 1024 with touch emulation (opacity 1) and at 375 (opacity 1). Click anywhere else on the card → `/notes/[id]`.
> Decision: the card-wide link is an ABSOLUTE OVERLAY, not the card's wrapper element, and it carries the note's title as its accessible name. Interactive content may not nest inside an `<a>`: a trigger inside the link would be activated by the link on Enter, and no amount of `stopPropagation` fixes that. As siblings there is nothing to stop — a click on the menu never reaches the link. The cost, accepted: the preview text is not selectable.
> Decision (Phase 5): a sticky header needs a stated Z-ORDER, because it is the first element in this app that can cover another. The scale is: card menu dropdown 40 > `Header` 30 > the editor's sticky status row 20 > the card-wide link overlay (auto). Toasts sit above all of it at 50, and `ConfirmDialog` above everything via `showModal()`'s top layer. The rule that makes it work is negative: **`MoreMenu`'s root carries no z-index**, so it creates no stacking context and its dropdown's 40 is measured against the header rather than against its own root. Adding a `z-*` to that root — or to `NoteCardMenu`'s `className` — re-breaks it, and the symptom is subtle: the menu only disappears once the card is scrolled far enough to reach the header. It shipped that way in Phase 5 and was caught at the gate.

- States: **Loading** — 6 skeleton cards (`Skeletons.tsx`); **Empty** — illustration-free card: "No notes yet." + subtext "Create your first note to get started." + **New note** CTA; empty because of a tag filter: "No notes with this tag."; **Error** — full-width inline card: "Couldn't load your notes." + **Try again** button (re-fetch).
- Actions table:

| Trigger | Result | On failure |
|---|---|---|
| New note | Server Action insert → redirect `/notes/[id]` | Toast "Couldn't create the note. Try again." |
| Click card | Navigate `/notes/[id]` | — |
| ⋮ → **Edit** | Navigate `/notes/[id]` — the named form of clicking the card, because the whole-card link is convenient but silent | — |
| ⋮ → **Delete** | `ConfirmDialog` (US4 copy) → the SAME `deleteNote` Server Action, therefore the same DAL and the same ownership filter → `revalidatePath` drops the card in place + toast "Note deleted." No second deletion path exists | Toast; the note stays. "This note no longer exists." if it was already gone (G-13) |
| Click tag chip | Server re-fetch filtered by tag | Error state card |
| Theme option | The attribute on `<html>` flips locally at once → Server Action writes (or clears) the cookie. No `revalidatePath`: the theme is in no cached payload, so revalidating would re-render the grid to produce identical markup | none — the choice holds for this document and is simply not remembered past a reload (G-30) |
| Sign out | Server Action → `revalidatePath` + redirect `/sign-in` | none — the redirect happens regardless, because auth-js has already cleared the local session on every error path; the error is logged server-side, not shown |
> Decision (Phase 4 gate, owner-approved): "none" covers the OFFLINE case too. When the action cannot run at all the session is still live, the user stays where they are, and nothing is shown — the failure is logged for the developer only (CLAUDE.md rule 13 is satisfied by the log, not by a message, because there is nothing the user could act on that the button does not already offer). A visible "couldn't sign out" notice is a post-sprint candidate; it would change this row, so it is not a silent improvement anyone should make in passing.

### Screen: `/notes/[id]`
- Layout: narrow column (max-w-2xl); back link "← All notes" top; then a STICKY status row — muted "Saved"/"Saving…" indicator left, plus a third state carrying rule B8's "Couldn't save your changes." once saving has actually stopped, and **Delete** (danger, ghost) right; below it the note sheet: a card (`--radius-card`, `--shadow-card`) holding the title as a borderless `input` (text-2xl, semibold) over a hairline, then `TagEditor` chips row and the content `textarea` (min-h 60dvh, borderless).
> Decision (Phase 5, owner priority 1): the save status is at the TOP of the editor column and sticky, not in a footer under 60dvh of textarea, because it is about the text being typed and has to be visible while it is typed. The two good states stay quiet — muted text with a small mark — and the failure state is loud: `--color-danger` at semibold on a `--color-danger-soft` pill. Same split in the notices: rule B8's retry toast is a plain white card, and its persistent banner (and G-1's session notice) is danger-tinted with a warning icon and a filled accent action. Placement and weight only; the autosave engine of Phase 4 is untouched.
> Decision (Phase 5, owner priority 2): title and content sit on ONE card rather than loose on the page background, divided by a hairline, with the whole sheet taking an accent border while either field has focus. A borderless input on a bare page does not read as an editor; the card is what says "this is the note".
- **Editor state rule:** title, content and tags are **local component state**, initialized from the server-fetched note; changes are pushed by a 300 ms debounced Server Action call (rule B2). Never bind inputs directly to server round-trips.
- States: **Loading** — skeleton (title bar + 8 text lines); **Empty** — an empty note is a valid state, placeholder text "Untitled" / "Start writing…"; **Error** — save failure per US3 step 3; load failure or foreign/unknown id → `not-found.tsx`: "This note doesn't exist (anymore)." + link "← All notes".
- Actions: Delete → `ConfirmDialog` (copy in US4) → Server Action → `/notes` + toast "Note deleted."
> Decision: the delete NAVIGATION is performed by the client once the action resolves, not by `redirect()` inside the action. A Server Action that redirects never returns its result, so the "Note deleted." toast would have to be shown before the row was gone — a guess that would also fire on a failed delete. The action returns `{ ok }`, the caller toasts and then navigates; user-visible behaviour is unchanged. `createNote` keeps `redirect()` in the action, because its success needs no toast.
> Decision (measured, Next 16.3.1): with a `loading.tsx` above this route, `notFound()` renders `not-found.tsx` with HTTP **200**, not 404 — the Suspense boundary lets the shell flush, which commits the status before the fetch resolves. Isolated on a scratch route: same page, 404 with no loading boundary above it, 200 with one. It is inherent rather than a bug to work around — a skeleton means "not fetched yet", a 404 means "fetched, absent", and a status cannot be streamed. Both are specified here, and every acceptance box names the SCREEN, so both stay and the status is recorded as known. To trade it the other way, drop `app/notes/loading.tsx` and `app/notes/[id]/loading.tsx` (a parent boundary reaches nested routes) and fetch before rendering.

### Components
| Component | Base | Notes |
|---|---|---|
| Header, EmptyState, ConfirmDialog | carried from Notera | restyle only |
| Toast | carried from Notera, extended in Phase 4 | `showToast(message, { variant, duration, action, key })`. `duration: "persistent"` **is** rule B8's banner and edge case G-1's session notice — one queue, so two notices cannot overlap; `action` carries **Retry now** / **Sign in**, rendered as a FILLED accent button, never a text link (a link-styled action was missed entirely on first encounter, and it is the only way out of the state the notice describes; accent rather than danger fill even inside a danger notice, because in this app red means destructive); `key` dedupes, so the retry ladder updates one notice instead of stacking four and a cap message toasts once. No separate `Banner` component: this table sanctions none, and rule 17 makes that a prohibition. |
| MoreMenu | **new in Phase 4** | Icon-only `⋮` trigger + `role="menu"` list. `aria-haspopup`/`aria-expanded`/`aria-controls`; opening focuses the first item; Escape closes and returns focus to the trigger; arrow keys move and wrap; an outside `pointerdown` closes without stealing focus back; focus leaving the menu closes it too (added Phase 5, from the Phase 4 fresh-session review — Tab off the last item used to walk out of the card with the menu still painted). Presentational — it takes a label and items and never knows what they do. **Recorded because the phase brief described it as carried over from Notera: it was not.** No `MoreMenu` existed in this repo, in any commit on any branch, or in this table (BUILD_PHASES names a Notera `InlineRename`, also never ported), so none of the behaviour above is inherited — it is new code, written and verified in Phase 4. |
| TagEditor | Notera `LabelEditor` descendant | Enter commits, × removes, cap per `LIMITS.tagsPerNote` |
| NoteCard, NoteCardMenu, Skeletons, SignInForm, NoteEditor, ErrorCard, NewNoteButton | new | per specs above |
| ThemeToggle | new (US7) | A three-option radio GROUP, not three buttons: one `<fieldset>` of native radios gets exclusivity, arrow-key movement with wrap, a single tab stop and the "1 of 3" announcement from the platform — the work `MoreMenu` had to hand-roll only because no element does menus. Icon-only with `sr-only` labels and a `title`; the group's name is `sr-only` too, because a fourth visible word does not fit beside two labelled controls at 375. Placement is the caller's (`className`), arrangement is its own — the `TagFilter` split. Exports `ThemeTogglePlaceholder`, an inert same-size box for `app/notes/loading.tsx`: that header renders inside a Suspense FALLBACK, a fallback may not suspend, so nothing in that tree can await the cookie. Guessing a state would show something false; rendering nothing would let the header jump. |
| TagFilter | new | Links, never buttons — the filter is a URL (`?tag=`), so it survives a reload, can be shared, and steps through Back. A Server Component with no state: following a chip re-renders on the server and re-queries Postgres, which is what US5's second acceptance box asks for. The boundary is split, not absolute: the component owns its INTERNAL arrangement at each breakpoint (`md:w-full` on the All tags item is what turns the cloud into the sidebar's stacked button), and `/notes` owns the EXTERNAL placement — which side, how wide, what gap — passed in as `className`. A caller wanting the cloud arrangement at desktop width cannot get it from `className` alone; one caller exists, so no `orientation` prop was invented for a second that does not. |

---

## BLOCK F: Business Logic

### Validation
| Field | Type | Rules (ordered) | Error copy (from `lib/copy.ts`) | On violation |
|---|---|---|---|---|
| email | string | required; valid email shape | "Enter a valid email address." | inline, block submit |
| password | string | required | "Enter your password." | inline, block submit |
| title | string | ≤ `LIMITS.titleMax` | "The title is limited to {n} characters." | block further input, toast once |
| content | string | ≤ `LIMITS.contentMax` | "The note is limited to {n} characters." | block further input, toast once |
| tag | string | trimmed; 1–`LIMITS.tagMax` chars; no duplicates on the note | "Tags are limited to {n} characters." / "This tag is already on the note." | toast, tag not added |
| tags count | — | ≤ `LIMITS.tagsPerNote` | "A note can have up to {n} tags." | toast, tag not added |

All `{n}` values are interpolated from `LIMITS` with `toLocaleString("en-US")` — never typed out (lesson from the previous review).

### Numbered rules
- **B1 — One mutation pipeline.** Every write goes: local state → debounced Server Action → Supabase → `revalidatePath`. No component talks to Supabase directly for writes; no write bypasses the action files.
> Known cost (measured, Phase 6 gate): **`revalidatePath` in `saveNote` makes every autosave re-render `/notes/[id]` on the server.** Revalidating any path marks the request as having revalidated, and Next then renders the current route's flight data beside the action result — so the POST answers with an RSC tree the editor discards, its text being local state after mount (rule B2). Owner-confirmed in DevTools: **~6.4 kB per autosave**, where a bare `{ ok: true }` is ~40 bytes. **And the bytes are the smaller half.** That re-render runs the route's own data path again — `app/notes/layout.tsx`'s `getUser()`, then `getNote()` inside the DAL, which is another `getUser()` plus a `SELECT`. Next dedupes an identical Auth request within ONE render pass, but the action and the revalidation-triggered render are not the same pass, so the honest figure is **2-3 Supabase round-trips per autosave instead of 1** — on the order of 70 ms at the ~35 ms round-trip this project measured at the Phase 6 gate — on top of the discarded 6.4 kB. `app/notes/actions.ts` states this correctly; this note recorded only the payload until the Phase 7 /full-review caught the omission. One more thing the parked decision should carry: `/notes` reads cookies, so it is never in the Full Route Cache, and what `revalidatePath` actually buys is invalidating the client Router Cache so a navigation back to the list refetches. That job is real — dropping the call would leave a stale list — which makes removing it less free than "it buys nothing" would suggest. `app/notes/actions.ts` previously claimed the opposite in a comment; the comment was corrected in the same change (rule 18). The call STAYS for now because this rule names `revalidatePath` as part of the pipeline — removing it from the save path is an amendment to B1, so it is parked as post-sprint debt with the measurement attached rather than dropped quietly. `createNote` and `deleteNote` keep it regardless: those genuinely change the list.
- **B2 — Local editor state.** `NoteEditor` holds title/content/tags in `useState`; a 300 ms debounce pushes changes; a `maxWait` of 5 s forces a save during continuous typing. In-memory text is never rolled back on failure.
- **B3 — Server-side auth only, three fences.** Access decisions use `supabase.auth.getUser()` on the server; `getSession()` for access decisions is prohibited. Fence 1 (authoritative): the DAL `lib/notes.ts` calls `getUser()` on every operation and throws/redirects without a user — no data moves without it. Fence 2: `app/notes/layout.tsx` calls `getUser()` and issues the redirect — it does **not** suppress the render: a redirecting layout still lets the sibling page render into the RSC payload (measured on Next 16.3.1), and layouts do not re-run on client navigation. No-render is therefore owned by fence 1. Fence 3 (convenience only, NEVER the gate): `proxy.ts` — Next's current name for `middleware.ts` — refreshes the session cookie and does a cheap early redirect.
- **B3b — DAL chokepoint.** No page, component or Server Action queries the `notes` table directly; everything imports from `lib/notes.ts` (marked `server-only`). Server Actions never trust a client-supplied user id — the DAL derives it from `getUser()`.
- **B4 — Explicit ownership filter.** Every notes query inside the DAL includes `.eq('user_id', user.id)` even though RLS also enforces it.
- **B5 — Copy from one home.** Every user-visible string lives in `lib/copy.ts`; numbers in copy are derived from `LIMITS`.
- **B6 — No web storage.** No note data, session data or derived cache in `localStorage`/`sessionStorage`.
- **B7 — Hard cap.** Creating a note beyond `LIMITS.notesPerUser` is blocked with "You've reached the limit of {n} notes."
- **B8 — Save feedback.** Failed save: retry ×3 (1 s / 2 s / 4 s), toast "Couldn't save. Retrying…", then persistent banner with **Retry now** — delivered as Toast's `duration: "persistent"` variant (Block E component table), all four steps sharing one dedupe key so the user sees one notice, not four. The three failures are told apart by a discriminated result, not a message: retryable (this rule), session expired (G-1) and note gone (G-13) need different behaviour.
  After the third failure the editor **stops saving automatically** and waits for **Retry now** (or for the sign-in G-1 offers): the notice is where the next move lives, so continuing to fire a save on every keystroke against a network that is still down would only pile invisible attempts up behind it. Typed text stays in local state throughout, so nothing is lost by waiting, and the indicator reads "Couldn't save your changes." rather than "Saving…" — an indicator must not claim progress that has stopped. Dismissing the notice with its × is not a way out: saving stays suspended, so the next edit re-surfaces the same notice (one dedupe key, so it never stacks). Without that, a dismissal left a failed save with its only affordance gone — the status indicator still reporting the failure and a reload the only exit, which is the one action that loses the text. The same holds for G-1's session notice.
> Decision (Phase 6 full-review gate): **a REFUSED patch suspends too, and it is a third suspended state, not a variant of the first two.** The other two are about a request that did not get through; this one is the server declining the payload — `updateNote` re-checks the Block F tag rules because a Server Action is a public POST, and answers `invalid` for a tag array it will not store. Until this gate that raised a one-shot "Something went wrong." and left saving ARMED. **Only a patch carrying `tags` can be refused** — the editor's patch is per-field, so on a note holding an unstorable tag, typing in the title or the body sends `{title}`/`{content}`, the bad tag never reaches validation, and the note saves normally (verified by the owner at this gate; an earlier draft of this note claimed any edit triggered it, which was wrong). The loop is armed by the first tag change and then does not stop: `saved` advances only on `ok`, so once one tags-bearing patch is refused, the draft and the saved arrays stay different and EVERY later patch — a pure title edit included — carries the tags again and is refused again, one POST and one server-side error per debounce window, with the text typed alongside refused in the same breath (a patch is refused whole). It is reachable without a forged request, by **two routes**, both of them stored data the DAL will not take back — a note seeded through the SQL Editor (the seed block in Block C; G-18 treats direct inserts as a real path) can carry either. **One:** a tag `isValidTag` rejects, because `LIMITS.tagMax` has no database counterpart. **Two:** duplicate tags — `{client,client}`, or `{Client,client}`, which `updateNote` refuses under the case-insensitive rule; the Block C CHECK bounds the array's LENGTH and nothing else, so neither pair is stopped on the way in, and `TagEditor` sends the raw array (it renders `dedupeTags` but does not rewrite stored data the user never asked it to touch). Either way, adding or removing any chip on that note made it permanently unsaveable. The notice is persistent, danger, and carries **Retry now** like the retryable one, with its own copy: "Couldn't save this note. Check its tags and try again." — "Retrying…" would be a lie, since the same bytes will be refused again, and the button is what turns a corrected note back into a saved one once the offending chip is gone. Tags are named because they are the only field that can arrive invalid from STORED data; the editor blocks an over-long title or body at the keystroke.
> Decision (Phase 4 gate, owner-approved): the suspension is where rule B8 ends, and it is NOT extended into auto-resume-on-reconnect. An `online` event listener would make the recovery automatic, and it is a reasonable thing to want — but B8 deliberately hands the next move to the user, and a save that fires itself the moment the network returns is a different promise from a button that says **Retry now**. Post-sprint candidate, not this branch.
> Decision: a Server Action call that fails in transport **rejects**; it does not return a result. Every client-side call therefore goes through `lib/callAction.ts`, which turns a dead network into `unavailable` and re-reports Next's `NEXT_REDIRECT` signal as success. Found by the Phase 4 browser pass: a bare `await` on an action left the editor's in-flight flag set forever, so one offline save silenced every later save — and the text was never written even after the network came back.

### Auth flows
**Sign-in:** `/sign-in` form → Server Action `signIn(formData)` → `createServerClient` → `auth.signInWithPassword({email, password})` → on error return `{ error: copy.auth.badCredentials }` → on success `redirect("/notes")`. Cookies are set by the `@supabase/ssr` client.
**Session refresh:** `proxy.ts` runs on every request, calls the `lib/supabase/proxy.ts` helper to refresh the auth cookie, and redirects `/notes*` → `/sign-in` when `getUser()` returns null (and `/sign-in` → `/notes` when it doesn't). A redirect built there copies the refreshed cookies and no-store headers onto the new response, or the refresh is lost.
> Decision (Phase 6): **both early redirects DROP the query string, and there is no `?next=` return path.** `redirectTo` clears `url.search`, so a signed-out visitor on `/notes?tag=client` is bounced to a bare `/sign-in`, signs in, and lands on an unfiltered `/notes` with no sign that a filter was lost. Harmless until this phase — nothing under `/notes` carried state in the URL before `TagFilter` — and it is written down now rather than fixed, because the fix is a feature: carrying the filter across the bounce means a return path, a return path means accepting a redirect target from the query string, and that means validating it against open-redirect abuse. That is real scope, and SPEC asks for neither preservation nor a return path. The filter is one click away on the page the user lands on; a same-origin `?next=` is a post-sprint candidate.
**Refresh happens in exactly one place.** A refresh rotates the refresh token, so the new pair must reach the browser; only the proxy owns a writable response. Every client from `lib/supabase/server.ts` therefore declines the rotation call and only validates the token it was given — a rotation performed where cookies cannot be written spends the browser's refresh token and signs the user out on the next request (found by the Phase 3 token-refresh probe).
**Guard:** three fences per rule B3 — DAL (authoritative), `app/notes/layout.tsx` (render guard), `proxy.ts` (cookie refresh + early redirect, never trusted as the gate).
**Sign-out:** header button → Server Action `signOut()` → `auth.signOut()` → `redirect("/sign-in")`.
**Registration / password reset:** none — accounts are created in the Supabase dashboard (Block A Decision).
**Rate limiting:** Supabase Auth's built-in limits are accepted as-is; no custom throttling (recorded decision, single-developer test accounts).

### Security
- RLS on `public.notes` for all four verbs (Block C) + explicit `user_id` filter (B4).
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist as env vars; the service-role key is never added to the project in any form.
- No hardcoded email addresses anywhere in the repo.
- All user text renders through JSX text nodes; `dangerouslySetInnerHTML` prohibited.
- Forged IDs: unknown or foreign note id → RLS returns no row → `notFound()`.
- Secrets only via `process.env.*`; `.env.local` is gitignored; `.env.example` is committed.

---

## BLOCK G: Edge Cases (M tier: ≥25)

**Auth & session**
1. Expired session while editing → next autosave gets 401 → banner "Your session expired." + **Sign in** link; typed text stays on screen. Trigger: cookie TTL passes mid-edit.
2. Signed-out user pastes `/notes` URL → `proxy.ts` + layout redirect to `/sign-in`; no note bytes, because the DAL returns none without a user (the layout redirect issues the bounce, it does not suppress the render).
3. Signed-in user opens `/sign-in` → redirect `/notes`.
4. Cookies cleared in DevTools, then any click → next server request treats as signed-out → redirect.
5. Sign-out in tab A while tab B edits → tab B's next save 401 → case 1 behavior.
6. Wrong password ×N → Supabase built-in rate limit error → show "Too many attempts. Wait a minute and try again."
7. Supabase Auth unreachable on sign-in → "Something went wrong. Try again." — never a raw error dump.

**Network & saving**
8. Save fails (network) → rule B8: retry ×3 with backoff, toast, banner, never roll back memory.
9. Load of `/notes` fails → Error state card with **Try again**.
10. Save succeeds but `revalidatePath` response is lost → editor still shows "Saved" after debounce confirmation from the action result only (never assume).
11. Continuous typing for minutes → `maxWait` 5 s forces periodic saves (B2).
12. Rapid navigation away right after typing → pending debounce flushes on unmount (save-on-unmount).

**Data**
13. Note deleted in tab A, tab B still shows it → tab B save returns zero rows updated → toast "This note no longer exists." + redirect `/notes`.
14. Foreign note id in URL (other account's UUID) → RLS returns no row → `notFound()` screen.
15. Malformed UUID in URL (`/notes/abc`) → query error caught → `notFound()`.
16. Empty title everywhere → list and editor render "Untitled" (muted); stored value stays `""`.
17. Two tabs, same account, same note → last-write-wins; recorded decision, documented in README ("Use one tab at a time").
18. `notes` row inserted directly in SQL Editor with another user's `user_id` → simply invisible to this user; app never assumes it created every row.

**Input & security**
19. `<script>alert(1)</script>` typed into title/content → renders as literal text (JSX escaping); never executes.
20. 50,000-character content → accepted; 50,001st character blocked with the LIMITS-derived message; editor stays responsive (local state, B2).
21. Tag with only spaces → trimmed to empty → rejected silently (input clears).
22. Duplicate tag → "This tag is already on the note."
23. 11th tag → "A note can have up to 10 tags."
24. SQL-injection attempt in tag filter value → the value never reaches a SQL string. `.contains('tags', […])` appends `tags=cs.{…}` to the request URL through `URLSearchParams`, PostgREST parses it as a filter on one column, and the comparison runs as `tags @> ARRAY[…]` — there is no query text for the value to escape into, and `.eq('user_id', …)` is a separate parameter that nothing in `tag` can widen. **Corrected in Phase 6:** "passed as a parameter through the SDK" was true of SQL but an overstatement about the array literal, which the SDK builds by joining the array RAW (verified in `node_modules/@supabase/postgrest-js`). A tag holding a comma or a brace would have changed that literal's *shape* — not into an injection, but into a filter for two tags, or into a `22P02` — so `lib/notes.ts` quotes each element before handing it over. The bug that would have shipped is a filter for `Design, UX` silently matching nothing.
25. Service-role key accidentally pasted into `.env.local` → app never reads it (no code references it); reviewer scan finds no `SUPABASE_SERVICE_ROLE` string in the repo.

**Limits & time**
26. 1,000th note reached → creation blocked with B7 copy.
27. `created_at` rendered in the user's local timezone via `toLocaleDateString` — dates may differ from UTC dashboard values by design (recorded decision).
28. System clock skew between client and server → all timestamps come from Postgres `now()`, never from the browser.

**Theme**
29. Visitor with no theme cookie, OS set to dark → served no `data-theme`, and CSS resolves dark. Nothing is guessed and nothing is corrected after load; the control reads **System**, which is exactly what is stored.
30. Theme clicked while offline → the page changes immediately and the cookie write fails. Nothing is shown and the change is NOT rolled back: the user has the theme for as long as this document lives, and only the memory of it is lost. Logged at `warn` for the developer. Reverting would turn a lost preference into a visible malfunction, and a toast would spend rule B8's single-notice queue — the one unsaved TEXT needs — on a colour scheme. Same position as the Sign out row in Block E's actions table. **Two consequences, both accepted:** re-picking the SAME option is not a retry — a radio fires no `change` event when it is already checked, so the only way to attempt the write again is to pick another option and come back; and the next server render re-seeds the control from the cookie, so a navigation restores the stored theme rather than leaving a control that disagrees with its own page (the fix for a desync found at the code-review gate).
31. Forged `notera-theme` cookie, or a forged POST to the theme action → any value that is not one of the three known words is read as `system`, and the action refuses to write it. The endpoint is anonymous-reachable by design (`/sign-in` needs it before there is a user) and safe because its whole authority is "set one cookie on the caller's own browser to one of three words" — it touches no Supabase client, no `getUser()` and no DAL, and must never gain a branch that does.

---

## BLOCK H: Definition of Done

1. `npm run dev` on a **fresh clone** (clean folder, `npm install`, `.env.local` created from `.env.example`) boots with zero errors and serves `/sign-in`.
2. The assignment's verification checklist passes end-to-end in a browser: sign in as account A → create a note → reload (still there) → sign out → direct `/notes` URL redirects to `/sign-in` → sign in as account B → sees none of A's notes.
3. Every acceptance checkbox in Block B passes at both 1280 and 375; nothing overflows.
4. Zero console errors during the click-script: sign in → create → type 500 chars → add 2 tags → filter by tag → delete → sign out.
5. Both greps run over **every code file this repo ships** — `app/`, `components/`, `lib/`, `scripts/`, and the root-level code files (`proxy.ts`, `next.config.ts`, `postcss.config.mjs`, and the committed `.env.example`), plus `supabase/` for the SQL — and return nothing. `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` and `.cjs` all count: Next's default `pageExtensions` routes `.jsx`, and `tsconfig.json` sets `allowJs: false`, so a `.jsx` page would ship while escaping both this check and `npm run typecheck` — a Phase 7 mutation test proved it. Next's generated `next-env.d.ts` is skipped. Never a `.env*` glob: printing a finding out of a real secrets file would leak the secret, the same reasoning that keeps `WORKLOG.md` out.
   `grep -ril "localStorage\|sessionStorage" app/ components/ lib/ scripts/ proxy.ts next.config.ts postcss.config.mjs .env.example`, and the same over "service_role\|SERVICE_ROLE" with `supabase/` added. Root-level code files are listed by name rather than globbed, because the generated `next-env.d.ts` must stay out; `npm run check` is the executable form of record and derives the list itself.
   **Build config and `scripts/` are in scope deliberately.** They are not app code, but they can read an env var and reach Supabase exactly as easily as a Server Action can — and narrowing this check to app code was a coverage regression against the old, over-broad `grep -ri . `, introduced by the same commit that created `scripts/`. Caught at the Phase 7 `/review-auth` and closed on the same branch.
   Everything else is **excluded by name**, because prose about a thing is not a use of it: `.agents/skills/` (vendor skill docs), `docs/` (the Context7 material, which quotes Supabase's own warnings), `.next/` and `node_modules/` (build output and dependencies), `.claude/` (see below), `SPEC.md` (it quotes both greps — including on this line), and `WORKLOG.md`, which is excluded for a second and stronger reason: rule 19 makes it off-limits, so a project check must never print it. Running the old, unscoped version of this check did.
   The known prose hits, enumerated so a future run can tell "unchanged" from "new" — and counted for a FRESH CLONE, not for one particular working tree: **four** vendor skill-doc files and **two** lines of SPEC.md (Block G edge case 25, and this check). The four are `supabase/SKILL.md` and `supabase-postgres-best-practices/references/security-rls-performance.md`, each appearing TWICE — once under `.agents/skills/` and once under `.claude/skills/`. Both copies are tracked deliberately: the rubric grades the official Supabase Agent Skills being installed in the repo, and removing either could break skill discovery on a fresh clone. `WORKLOG.md` holds two more, which this check must never print (rule 19). Anything else is a finding.
   **A trap worth knowing before you re-run this by hand:** on a working tree where `.claude/skills/*` are symlinks into `.agents/skills/*`, `grep -r` does NOT follow them and reports two hits instead of four. Use `grep -R`, or trust `npm run check`, which never walks either tree. This is exactly how the first version of this list came to be short by two.
5b. Dark mode holds at both widths and in all three states: with the cookie absent (OS decides), set to `light` on a dark OS, and set to `dark` on a light OS — checked on `/sign-in` and `/notes`, with no flash on first paint in any of them. `npm run check`'s web-storage check covers the other half of the claim: the preference is a cookie, and no shipping file so much as names a web-storage API — comments in `lib/theme.ts` and `app/layout.tsx` say "web storage" for exactly that reason, rather than growing the known-hits list for prose.
6. `grep -rn "getSession()" app/ lib/ proxy.ts` returns no access-decision usage (only the documented cookie-refresh helper if the current Supabase docs require it — annotate in `docs/` if so).
7. Supabase SQL Editor: `select user_id, count(*) from notes group by user_id;` shows two distinct `user_id` values after verification (screenshot saved to `docs/screenshots/`).
8. README documents: purpose, run steps, both env vars and where to find their values (Supabase dashboard → Settings → API), a screenshot of the local app, and the optional tasks with their branch/PR names.
9. Public self-signup is **off** at the Auth API, not merely unused by the app:
   `curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings"` reports `"disable_signup":true`.
   Re-checkable on purpose: this is dashboard state, so it can regress without a single line of code changing. It was found **enabled** at the Phase 2 gate and switched off there; the probe is what turns "we switched it off once" into something anyone can re-run in five seconds. The app never calls `signUp`, which is why the endpoint — not the app — is what has to be checked. Verified `true` at the Phase 7 gate.

---

## Post-sprint debt

Settled decisions that are deliberately NOT part of Block H — none blocks Done, each has
a recorded reason. Kept here so they are findable without reading the phase history.

1. **RLS policies get `to authenticated`.** The four policies are evaluated for the
   `anon` role too, where `auth.uid()` is null and the predicate is simply false — no
   row leaks, so this is cost, not exposure. Adding `to authenticated` skips the
   evaluation for a role that can never match — though after amendment 3 what it saves is ONE InitPlan per
   statement, not a call per row, so amendment 3 already absorbed most of this item's value. Deferred at the Phase 7
   `/review-auth` (owner decision): it is worth folding into the next DDL run that
   happens for another reason, and not worth a run of its own.
2. **`secure` and `httpOnly` on the auth cookies.** The `@supabase/ssr` defaults ship
   `httpOnly: false` because `createBrowserClient` reads the session through
   `document.cookie`; accepted for a local-only sprint with no injection sink, and to be
   revisited together with `secure` before any deployment (Block A decision).
3. **A database fence for `LIMITS.tagMax` and `LIMITS.notesPerUser`.** DECLINED, not
   pending — both need a trigger on a table that autosaves while the user types. The
   accepted limitation and what guards those caps instead are recorded in Block C.
4. **Two parked schema notes from the Phase 2 full-review:** an id-existence oracle and
   a schema idempotency note. Neither changes behaviour; neither is needed for Block H.
5. **A live-fence probe — `npm run check:live`. The strongest candidate for next
   sprint's deploy phase.** Nothing in this repo re-verifies the live database, and RLS
   is the second of the two fences the whole project rests on — the one most likely to
   be switched off by hand during debugging and forgotten. Every static check,
   `typecheck`, `build` and all ten review questions would stay green. Shape: read the
   URL and anon key from `.env.local` inside the script (never typed by a human, never a
   password — rule 20 is untouched), then `GET {URL}/rest/v1/notes?select=id` with the
   anon key alone must come back empty or refused, and `GET {URL}/auth/v1/settings` must
   report `"disable_signup":true`, which also automates Block H check 9. ~40 lines,
   `fetch`, no dependency; skips with a clear message when `.env.local` is absent. It
   stays OUT of `npm run check` on purpose: that command is hermetic and offline, which
   is why it can lead the gate ritual.
6. **A parity check for the schema, as a tenth check in `scripts/check.mjs`.** Block C
   embeds `supabase/schema.sql` verbatim (asserted by hand at the Phase 7 gate, and the
   Phase 7 edit had to be applied twice). Extracting the fenced block that follows the
   `### supabase/schema.sql` heading and comparing it byte for byte is ~10 lines, and it
   converts "the owner remembers to update both" into a failing command. Two of the five
   Phase 7 /full-review lanes proposed it independently.
7. **`supabase/migrations/` with dated filenames, plus a permanent `supabase/verify.sql`.**
   `phase7-amendments.sql` is named by a phase, and the phases stop at 7 — items 1 and 6
   above have no obvious home. A dated convention plus one clause in CLAUDE.md rule 8
   fixes that without importing the Supabase CLI (which would be a new dependency, a
   linked project and a shadow database to manage three DDL events). `verify.sql` would
   promote the four one-off verification queries into something re-runnable after every
   future amendment.
8. **Unit tests for the pure logic, via `node:test`.** Verified at the Phase 7 gate to
   need **no new dependency**: Node 24 strips types natively, and a ~14-line stdlib
   resolve hook handles this repo's `@/` aliases. Highest-value targets: `tagLiteral`'s
   PostgREST quoting, `isValidTag` at the `LIMITS.tagMax` boundary, and `callAction`'s
   narrowed `NEXT_HTTP_ERROR_FALLBACK` match, where a widening regex would silently turn
   a redirect into `ok: true`. Honest cost: `tagLiteral` is module-private inside a
   `server-only` module, so it needs exporting or moving to a pure module first.
9. **A preamble for `review-auth`.** Six of its ten questions (2, 3, 4, 6, 7, 9) are now
   decided mechanically by `npm run check`. The checklist should say so and point the
   reviewer at the residue the script cannot see — whether the id in
   `.eq("user_id", …)` came from `getUser()` rather than a request body, and whether the
   chain being read is the one a page actually calls.
10. **Cosmetics from the Phase 7 /full-review**, none behavioural: letter this section so
   it can be cited like "Block C"; add `scripts/`, `docs/screenshots/` and
   `supabase/phase7-amendments.sql` to Block A's repository layout; and reword Block A's
   `schema.sql` annotation, since rule 8 now makes the file authoritative and Block C the
   copy.
11. **Silent offline sign-out, and no auto-resume after the rule B8 suspension.** Both
   are settled decisions rather than defects, taken at the Phase 4 gate — the offline
   case under Block E's `/notes` screen, the suspension under Block F's numbered rules.
12. **A token-parity check across the two dark-mode remap blocks.** `app/globals.css`
   writes each dark VALUE once, in the `--dark-*` staging block, so the OS path and the
   explicit path cannot disagree about what `dark` means. What no amount of staging
   closes is MEMBERSHIP: both blocks must list every token, and adding a fourteenth
   colour to one and forgetting the other would make dark-by-OS and dark-by-choice
   render different palettes. Today there are thirteen colours and three shadows in
   each. Deferred at the code-review gate (owner decision): the real fix is a
   build-time check, and inventing one for sixteen lines is not this sprint's work. The
   hazard is named in the stylesheet so the next person to add a token reads it there.
13. **The redefined `dark:` variant has zero callers, and stays.** Tailwind ships a
   `dark:` variant keyed on `prefers-color-scheme` alone, which in this app is wrong by
   construction — it would ignore an explicit Light choice on a dark OS. The block in
   `app/globals.css` redefines it to match both theme paths. Nothing uses it, because
   the token swap is the whole mechanism; it is kept because **deleting it would not
   remove the variant, only the fix.** Accepted as recorded at the code-review gate, in
   the same spirit as `lib/supabase/client.ts` keeping zero callers: not dead code, a
   documented correction that has to be in place BEFORE the first caller needs it.
14. **The list read ships every note's full body.** `NOTE_COLUMNS` in `lib/notes.ts`
   selects `content`, and `listNotes` reads through it, so `/notes` transfers up to
   `LIMITS.contentMax` characters per note in order to paint the two-line CSS clamp in
   `components/NoteCard.tsx` — on every list render, every tag-chip click, and every
   navigation back to the list. At a few hundred notes this is already the dominant cost
   on the app's busiest route, and at `LIMITS.notesPerUser` it is the largest single
   number in the app. Raised at the audit gate (`ai-architect`) and recorded here
   because it had never been written into the repo at all: the fix is a preview source
   — a view, a generated column, or a truncating projection — plus splitting the list
   read's row type from the single-note read's, and what deferring costs is that every
   later consumer of the one shared type has to be revisited when it finally splits.
15. **The tag sidebar has no cap and no usage ordering.** `listTags` reads the `tags`
   column of up to `LIMITS.notesPerUser` rows and builds the distinct set in Node;
   `components/TagFilter.tsx` then renders one link per distinct tag with nothing
   bounding the count. Phase 6 settled the layout for sixteen tags by wrapping, but
   `LIMITS.tagsPerNote` times `LIMITS.notesPerUser` is thousands of distinct tags, and
   the failure is visual before it is slow: a sidebar taller than the grid beside it.
   The `text[]` model is a recorded and well-reasoned decision at ten tags per note
   (Block C), and it is also exactly what makes every obvious remedy — order by usage,
   cap with a "more" affordance, rename a tag everywhere — a full scan. Deferred at the
   audit gate: no user in this sprint reaches the count, and the remedy is a Block C
   amendment plus a DDL run, not a styling change.
16. **`NoteEditor` assumes it is the only writer, and until a precondition exists it
   must stay the only one.** `diff()` in `components/NoteEditor.tsx` decides what to
   send by comparing the draft against a client-held `saved` ref, and `updateNote`
   replaces whole fields with no `updated_at` precondition. Two tabs on one note is
   already recorded as accepted last-write-wins (Block F). What is NOT covered is a
   SECOND WRITE SURFACE — an inline rename, a bulk tag action, anything that writes a
   note outside the editor: it would leave `saved.current` stale while the indicator
   still reads "Saved", so the next keystroke silently reverts the other surface's
   write. **The rule, until that precondition exists: all note writes route through the
   editor.** Recorded at the audit gate rather than fixed, because the fix is a schema
   and DAL change (a compare-and-set on `updated_at`, plus a conflict outcome the UI has
   to say something about) and nothing in Block B asks for a second surface yet.
17. **The three items above compound the `revalidatePath` cost already measured under
   rule B1.** That measurement — ~6.4 kB and 2-3 Supabase round-trips per autosave — is
   recorded with its reasoning in Block B and is genuinely settled; what the audit gate
   added is that it does not stand alone. The discarded re-render is a re-render of the
   route whose list read is item 14 and whose sidebar is item 15, so the per-autosave
   cost scales with both. Consequence for whoever picks these up: items 14, 15 and the
   B1 amendment are one conversation, not three, and measuring any of them in isolation
   will understate it.
18. **Five non-behavioural findings from the audit gate's code review**, none of them
   fixed, each a smell rather than a defect: (a) `theme?: ThemePreference` in
   `components/Header.tsx` is optional so that `app/notes/loading.tsx` can omit it,
   which makes a future page that simply forgot to thread the cookie type-check and ship
   an inert control — a required prop with an explicit unknown value, or a separate
   skeleton component, would make the fallback deliberate; (b) `--dark-color-on-accent`
   re-types the hex of `--dark-color-bg` twenty lines above it in `app/globals.css`,
   which is safely a `var()` and is the one exception to that block's own "no duplicated
   hex values" comment (the other two repeats are cross-palette and would resolve
   circularly, so they need a shared neutral ramp or nothing); (c) item 13's redefined
   `dark:` variant emits no CSS today, confirmed absent from the compiled stylesheet, so
   a clean build and a clean browser pass are not evidence the selector works — one
   throwaway `dark:` utility exercised in a probe would turn that recorded decision into
   a verified one; (d) the "a queued second write simply wins" comment in
   `components/ThemeToggle.tsx` asserts an ordering the code does not establish (a bare
   awaited call, no transition and no in-flight guard), so it should either be pinned by
   observation or reworded; (e) an offline theme click logs twice, once from
   `lib/callAction.ts` and once from the toggle — G-30 requires the second one, so this
   is worth knowing when reading a console rather than worth changing.
19. **UNCONFIRMED MECHANISM: a restored Router Cache entry may re-apply a stale theme
   prop over a persisted choice.** Reasoned from the code at the audit gate, not
   observed. `setThemePreference` deliberately skips `revalidatePath` (G-30), so the
   client Router Cache entry for `/notes` keeps whatever `theme` prop it was rendered
   with; the effect at `components/ThemeToggle.tsx` then runs `setSelected(preference)`
   and `applyTheme(preference)` on every mount, including the mount that a back/forward
   navigation produces from that cached payload. G-30 sanctions the next SERVER RENDER
   re-seeding the control from the cookie, and a restored cache entry is not a server
   render — so this case is outside what was decided, and the effect widens the possible
   desync from the control alone to the page.
   **Owner's browser check (audit gate): could NOT reproduce — Back kept the page dark
   after switching to Dark.** Recorded as a real negative result, with the reason it is
   not yet conclusive: `applyTheme("system")` DELETES `data-theme` and hands the page
   back to `prefers-color-scheme`, so on a dark OS a revert to `system` repaints dark
   and the colour cannot move whatever the prop says. Two things make a future check
   discriminating, and either settles it: pick the theme OPPOSITE the OS (Light on a
   dark OS, or Dark on a light OS) so a revert to `system` has a visible colour to move
   to; and read the CONTROL rather than the page, since `setSelected` flips the radio to
   System with no dependence on the OS setting at all. Nothing is being changed on the
   strength of a mechanism nobody has seen — this entry exists so the next person tests
   the discriminating case instead of repeating the inconclusive one.
