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
1. On a note page Mara adds tags `client` and `urgent` via `TagEditor` (Enter commits a tag; × removes one).
2. She tries an 11th tag → toast built from `LIMITS.tagsPerNote`: "A note can have up to 10 tags."
3. On `/notes` she clicks the `client` chip in `TagFilter` → the list re-fetches **from Supabase** filtered by the tag (`.contains('tags', [tag])`), not in the browser.
4. She clicks **All** → the full list returns.
- [ ] Tags persist across reload
- [ ] Tag filter queries the database, not client memory
- [ ] Cap message text is derived from `LIMITS`, not typed out

### US6 — Two accounts see different data
1. Mara signs out; her colleague signs in with `account-b` (second dashboard-created account).
2. `/notes` shows an empty state — none of Mara's notes.
3. `account-b` pastes the direct URL of Mara's note → `notFound()` screen, not the note.
- [ ] Account B sees zero of Account A's notes in the list
- [ ] Direct URL access to a foreign note renders not-found (RLS returns no row)
- [ ] SQL Editor shows rows with two distinct `user_id` values

> Scope decision: IN — sign-in/out, protected workspace, notes CRUD with autosave, tags + tag filter, minimalist Notera-derived design. OUT — do NOT build: sign-up page, password reset, search, image uploads, sharing, realtime sync, dark mode, kanban boards, note-to-note links, export. The OUT list is a prohibition, not a backlog.

---

## BLOCK C: Data Model

```
auth.users (managed by Supabase Auth — never modified by this app)
    1 ──────────── N
public.notes (user_id)
```

### `supabase/schema.sql` — execute in the Supabase SQL Editor
```sql
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

alter table public.notes enable row level security;

-- RLS: each verb restricted to the row owner. auth.uid() is the signed-in user's id.
create policy "notes_select_own" on public.notes
  for select using (auth.uid() = user_id);
create policy "notes_insert_own" on public.notes
  for insert with check (auth.uid() = user_id);
create policy "notes_update_own" on public.notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes_delete_own" on public.notes
  for delete using (auth.uid() = user_id);

-- List screen sorts by newest first and always filters by owner.
create index notes_user_created_idx on public.notes (user_id, created_at desc);

-- Auto-touch updated_at on every update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();
```

> Decision (Phase 4 gate): the list is ordered by **`updated_at desc`**, not `created_at desc`, so the order follows the timestamp the card prints (Block E). Sorting by one column while displaying another produced a list whose order contradicted its own labels — edit an old note and it stayed at the bottom saying "2 minutes ago". The index above is still `(user_id, created_at desc)`, so the query sorts instead of walking the index; at `LIMITS.notesPerUser` rows that costs nothing, and `(user_id, updated_at desc)` joins the Phase 6 schema amendment batch rather than being slipped in as an un-run DDL edit (rule 8).
> Decision: RLS is enabled even though the assignment only demands query-level filtering. RLS is the server-enforced second fence: even a buggy query cannot leak foreign rows. Application queries STILL filter by `user_id` explicitly (rule B4) — defense in depth, and the explicit filter uses the index.
> Decision: tags are a `text[]` column, not a join table. One user's tags never interact with another's, cardinality is tiny (≤10), and the tag filter is a single `contains` query. A join table would double the RLS surface for zero benefit at this size.
> Decision (Phase 6): **the two indexes this schema does not have are deliberate, and this is the record of it.** `listNotes` sorts by `updated_at desc` and, when a tag is selected, adds a `tags @> ARRAY[…]` predicate; the only index here is `(user_id, created_at desc)`, so both are answered by sorting and re-checking the owner's rows rather than by an index walk. The matching pair would be `(user_id, updated_at desc)` and `using gin (tags)`. Neither ships, for a reason and not by omission: `LIMITS.notesPerUser` caps a user at 1,000 rows and the owner filter cuts to those first, so the work saved is unmeasurable — while a GIN index is paid on **every save**, and this app saves on a 300 ms debounce while the user types. If the cap ever rises, both indexes come back with it. Also true, and the reason this is a decision rather than a TODO: the SQL in this block has already been executed, so adding DDL here without a SQL Editor re-run would make `supabase/schema.sql` a description of a database that does not exist (rule 8).

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
> Decision (Phase 6): this line used to promise Notera's **12-colour chip palette reused for tags**, and it is corrected rather than implemented. Twelve hues would be twelve new tokens on a palette Phase 5 closed with "no new hue enters the palette", and they would have to *mean* something — a colour per tag is a category signal, and this app has no categories, so the mapping would have to be a hash of the tag text: stable, arbitrary, and unexplainable to the person reading it. Tag chips therefore use the existing accent tint (`--color-accent-soft` ground, `--color-accent` text), the same chip shape in all three places they appear (card, editor, filter), with the filter's selected chip inverted to solid accent. Recorded here because the promise was in this file first (rule 18).

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

### Screen: `/sign-in`
- Layout: centered card (max-w-sm) on `--color-bg`; app name "Notera Notes" above the card.
- Fields: email (`type=email`, autocomplete `username`), password (`type=password`, autocomplete `current-password`) with a show/hide toggle — an icon-only `type="button"` (lucide `Eye` / `EyeOff`) inside the field's right edge that switches the input between `password` and `text`, default hidden, `aria-label` from `lib/copy.ts` — and submit **Sign in** (full-width, accent).
- States: **Loading** — button shows spinner + disabled while the action runs; **Empty** — n/a (a form is its own empty state; recorded decision); **Error** — inline text under the form, exact copy: "Email or password is incorrect." for bad credentials, "Something went wrong. Try again." for any other failure.
- Actions: submit → Server Action `signIn` → success `redirect("/notes")` / failure shows the inline error, password field cleared.

### Screen: `/notes`
- Layout: `Header` — sticky at the top of the viewport, on a 95%-opaque surface so the grid scrolls under it rather than behind a hard edge (app name and a decorative mark left; **New note** button and **Sign out** right); below it `TagFilter` chip row (chip **All** + one chip per distinct tag of the user's notes); then a responsive card grid (1 col at 375, 3 cols at 1280), **most recently updated first** — the same timestamp each card displays.
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
| NoteCard, NoteCardMenu, TagFilter, Skeletons, SignInForm, NoteEditor, ErrorCard, NewNoteButton | new | per specs above |

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
- **B2 — Local editor state.** `NoteEditor` holds title/content/tags in `useState`; a 300 ms debounce pushes changes; a `maxWait` of 5 s forces a save during continuous typing. In-memory text is never rolled back on failure.
- **B3 — Server-side auth only, three fences.** Access decisions use `supabase.auth.getUser()` on the server; `getSession()` for access decisions is prohibited. Fence 1 (authoritative): the DAL `lib/notes.ts` calls `getUser()` on every operation and throws/redirects without a user — no data moves without it. Fence 2: `app/notes/layout.tsx` calls `getUser()` and issues the redirect — it does **not** suppress the render: a redirecting layout still lets the sibling page render into the RSC payload (measured on Next 16.3.1), and layouts do not re-run on client navigation. No-render is therefore owned by fence 1. Fence 3 (convenience only, NEVER the gate): `proxy.ts` — Next's current name for `middleware.ts` — refreshes the session cookie and does a cheap early redirect.
- **B3b — DAL chokepoint.** No page, component or Server Action queries the `notes` table directly; everything imports from `lib/notes.ts` (marked `server-only`). Server Actions never trust a client-supplied user id — the DAL derives it from `getUser()`.
- **B4 — Explicit ownership filter.** Every notes query inside the DAL includes `.eq('user_id', user.id)` even though RLS also enforces it.
- **B5 — Copy from one home.** Every user-visible string lives in `lib/copy.ts`; numbers in copy are derived from `LIMITS`.
- **B6 — No web storage.** No note data, session data or derived cache in `localStorage`/`sessionStorage`.
- **B7 — Hard cap.** Creating a note beyond `LIMITS.notesPerUser` is blocked with "You've reached the limit of {n} notes."
- **B8 — Save feedback.** Failed save: retry ×3 (1 s / 2 s / 4 s), toast "Couldn't save. Retrying…", then persistent banner with **Retry now** — delivered as Toast's `duration: "persistent"` variant (Block E component table), all four steps sharing one dedupe key so the user sees one notice, not four. The three failures are told apart by a discriminated result, not a message: retryable (this rule), session expired (G-1) and note gone (G-13) need different behaviour.
  After the third failure the editor **stops saving automatically** and waits for **Retry now** (or for the sign-in G-1 offers): the notice is where the next move lives, so continuing to fire a save on every keystroke against a network that is still down would only pile invisible attempts up behind it. Typed text stays in local state throughout, so nothing is lost by waiting, and the indicator reads "Couldn't save your changes." rather than "Saving…" — an indicator must not claim progress that has stopped. Dismissing the notice with its × is not a way out: saving stays suspended, so the next edit re-surfaces the same notice (one dedupe key, so it never stacks). Without that, a dismissal left a failed save with its only affordance gone — the status indicator still reporting the failure and a reload the only exit, which is the one action that loses the text. The same holds for G-1's session notice.
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

---

## BLOCK H: Definition of Done

1. `npm run dev` on a **fresh clone** (clean folder, `npm install`, `.env.local` created from `.env.example`) boots with zero errors and serves `/sign-in`.
2. The assignment's verification checklist passes end-to-end in a browser: sign in as account A → create a note → reload (still there) → sign out → direct `/notes` URL redirects to `/sign-in` → sign in as account B → sees none of A's notes.
3. Every acceptance checkbox in Block B passes at both 1280 and 375; nothing overflows.
4. Zero console errors during the click-script: sign in → create → type 500 chars → add 2 tags → filter by tag → delete → sign out.
5. `grep -ri "localStorage\|sessionStorage" app/ components/ lib/` returns nothing; `grep -ri "service_role\|SERVICE_ROLE" .` returns nothing outside docs.
6. `grep -rn "getSession()" app/ lib/ proxy.ts` returns no access-decision usage (only the documented cookie-refresh helper if the current Supabase docs require it — annotate in `docs/` if so).
7. Supabase SQL Editor: `select user_id, count(*) from notes group by user_id;` shows two distinct `user_id` values after verification (screenshot saved to `docs/screenshots/`).
8. README documents: purpose, run steps, both env vars and where to find their values (Supabase dashboard → Settings → API), a screenshot of the local app, and the optional tasks with their branch/PR names.
