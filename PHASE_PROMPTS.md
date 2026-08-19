# PHASE_PROMPTS.md — Ready-to-paste prompts for Claude Code

One prompt per phase. Rules of use:
- Order matters: **P0 runs in the empty repo, before SPEC.md/CLAUDE.md are
  committed** (they record P0's outcome). Then docs go in, then P0b, then P1–P7.
- Start every phase in a **fresh Claude Code session**, from the repo root.
- Paste the prompt as-is. Text in `[square brackets]` is the only thing you edit.
- After the agent stops at a gate: run `/review-auth`, then `/full-review`
  (and `/refactor-clean` on big diffs), push, open the PR, merge. Log findings
  in WORKLOG.md. Only then move to the next prompt.
- P0 and the fresh-review prompts are not build phases — see their notes.

---

## P0 — Persistence consultation (run BEFORE any build; feeds REFLECTION §1)

This is assignment requirement 3: consult the agent on persistence, evaluate its
recommendation, record the outcome. The requirement says "BEFORE settling on a
persistence approach" — so run this in the repo BEFORE SPEC.md and CLAUDE.md are
added: those files record the decision this consultation produces, and an agent
that can read them will just echo them back instead of reasoning. The prompt
therefore carries its own short brief instead of referencing SPEC.md.

Sequence: init the empty repo → run P0 → decide → only then commit SPEC.md,
CLAUDE.md and the rest of the docs (they codify the outcome). Save the full
exchange — your prompt and the agent's answer — into WORKLOG.md verbatim.

```
Before we build anything, I need a persistence recommendation for this project.
There is no spec yet — this consultation comes first, and its outcome will be
codified in the spec afterwards.

The brief: a private, per-user notes app. Stack: Next.js (App Router only),
TypeScript strict, Tailwind. Sign-in via Supabase Auth with email/password;
the signed-in check must be verifiable ON THE SERVER before any protected page
renders. Each user must see only their own notes. Full CRUD, surviving page
reloads. Runs locally with npm run dev. localStorage and sessionStorage are
ruled out as persistence layers under any circumstances — do not propose them.

My previous project (a single-user kanban app) used a JSON file on disk behind
a Next.js route handler, chosen deliberately so that a real database could
later replace the route-handler internals without touching the client.

The database itself is fixed by the assignment: notes must be persisted in
Supabase Postgres. So this consultation is NOT about which database to use —
it is about the ACCESS PATTERN: which layer of the app talks to Supabase, and
how, given that sessions must be verifiable on the server.

Question: given this stack and the multi-user, per-account-scoping requirement,
what persistence access pattern do you recommend? Compare at least: (a) Supabase
Postgres accessed directly from Server Components / Server Actions, (b) Supabase
Postgres behind my own /api route handlers like the previous project, (c) any
other serious option. For each: trade-offs, failure modes, and what it means
for server-side session checks and per-user row scoping. End with one
recommendation and its two biggest costs.

Do not write any code yet. This is a consultation only.
```

Expected outcome: it will most likely recommend (a), which matches what the
prepared SPEC.md codifies — commit the docs as-is and note the agreement in
WORKLOG.md. If it argues for something else and the argument holds, this is a
decision point: bring the answer back to the planning conversation, we evaluate
it together, and the spec gets amended BEFORE it is committed. Either way the
reasoning goes into WORKLOG.md — a real disagreement here is excellent
REFLECTION material.

---

## P0b — Fetch Supabase docs via Context7 (once, before Phase 2)

```
Use Context7 to fetch the current official Supabase documentation for:
1. Setting up @supabase/ssr with Next.js App Router (server client, browser
   client, middleware session refresh).
2. supabase.auth.getUser() vs getSession() — server-side usage.
3. signInWithPassword and signOut.
4. Querying Postgres with filters (.eq, .contains) from server code.

Save each topic as a separate file under docs/, starting with "Source: <url>"
on the first line, content pasted, not summarized. Then add inline annotations
(blockquotes marked "ANNOTATION:") at any point where the general docs could
mislead this project — e.g. wherever an example uses getSession() for an access
decision, or stores the session anywhere other than cookies. Our rules:
CLAUDE.md rules 1–5 override anything in the docs.

Do not modify any other files. Stop when docs/ is written and list the files.
```

---

## P1 — Scaffold (branch `feat/scaffold`)

```
Read CLAUDE.md, SPEC.md and BUILD_PHASES.md in full before doing anything.

We are starting Phase 1 from BUILD_PHASES.md. Create branch feat/scaffold from
main and build ONLY the Phase 1 scope:

- Next.js (App Router) + TypeScript strict with noUnusedLocals + Tailwind,
  per SPEC Block A. No pages/ directory.
- The repository layout from SPEC Block A, with placeholder pages where real
  screens come later.
- Design tokens from SPEC Block E as CSS variables; Inter via next/font/google.
- Components carried over conceptually from the layout list: Header, EmptyState,
  ConfirmDialog, Toast, Skeletons — presentational only, no data logic.
  [If you have the Notera repo locally: "Port them from ../notera/components/,
  adapting imports" — otherwise delete this bracket and let it build them fresh.]
- app/error.tsx error boundary and app/not-found.tsx per SPEC.
- lib/types.ts with the Note interface and LIMITS exactly as in SPEC Block C.
- lib/copy.ts holding every user-visible string used so far; numbers in copy
  derived from LIMITS per CLAUDE.md rule 10.
- Root-anchored .gitignore and the committed .env.example.

Do NOT install or configure anything Supabase-related in this phase. Do not
build sign-in, notes pages logic, or anything on the SPEC Block B OUT list.

When done: verify npm run dev renders the placeholder at 1280px and 375px with
zero console errors, commit with a descriptive message, print a summary of every
file you created, and STOP per CLAUDE.md rule 16b. Do not start Phase 2.
```

## P2 — Supabase wiring (branch `feat/supabase-setup`)

```
Read CLAUDE.md, SPEC.md, BUILD_PHASES.md, and every file in docs/ in full.
The docs/ files are current official Supabase documentation fetched via
Context7 — follow them and their ANNOTATION blocks over your training memory.

We are starting Phase 2. Create branch feat/supabase-setup from main and build
ONLY the Phase 2 scope:

- lib/supabase/server.ts — server client via @supabase/ssr (cookie-based),
  for Server Components and Server Actions.
- lib/supabase/client.ts — browser client via @supabase/ssr, used only where a
  client component genuinely needs it.
- lib/supabase/middleware.ts — the session-refresh helper per docs/.
- Install @supabase/supabase-js and @supabase/ssr. No other new dependencies.
- Check supabase/schema.sql into the repo containing exactly the SQL from
  SPEC Block C (I have already executed it in the Supabase SQL Editor).
- Env vars only from process.env.NEXT_PUBLIC_SUPABASE_URL and
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY. The service-role key must not be
  referenced anywhere (CLAUDE.md rule 4).

Write a temporary server-side smoke check that selects from notes and logs the
row count, prove it runs, then DELETE it before committing.

No UI changes, no auth flows yet. When done: commit, print the file summary,
and STOP per CLAUDE.md rule 16b.
```

## P3 — Authentication (branch `feat/auth`) — highest-weight phase

Before pasting: replace the two [account emails] below with the real test-account
emails from the Supabase dashboard (passwords are NOT given to the agent — you
verify sign-in yourself in the browser).

```
Decision from the Phase 1 gate, binding for this branch: adopt proxy.ts (the
current Next convention) instead of middleware.ts — rename the root entry file
accordingly and keep lib/supabase/middleware.ts's helper wired to it (rename
that file too if cleaner). In this SAME branch update the four docs, per
CLAUDE.md rule 18: CLAUDE.md rule 3, SPEC.md rule B3, SPEC.md Block A layout +
Block F flow wording, and .claude/commands/review-auth.md item 8 — every
middleware.ts mention becomes proxy.ts. The role is unchanged: cookie refresh +
cheap early redirect, NEVER the gate.

Read CLAUDE.md, SPEC.md (Blocks A, B/US1-US2, F), BUILD_PHASES.md, and docs/.

We are starting Phase 3. Create branch feat/auth from main and build ONLY:

- /sign-in page: Server Component page + SignInForm client component, fields
  and states exactly per SPEC Block E, copy from lib/copy.ts.
- Server Actions signIn and signOut in app/notes/actions.ts (or a shared
  actions file if cleaner) using supabase.auth.signInWithPassword / signOut.
- proxy.ts (per the gate decision above): session refresh via the
  lib/supabase helper; redirect unauthenticated /notes* requests to /sign-in
  and signed-in /sign-in visits to /notes.
- app/notes/layout.tsx: the AUTHORITATIVE server-side guard — call
  supabase.auth.getUser(); on null, redirect("/sign-in"). This must exist even
  though middleware also redirects (CLAUDE.md rule 3).
- Sign out button in the Header, wired to the signOut action.

Hard constraints, all from CLAUDE.md rules 1–5: no getSession() for any access
decision; no custom password handling; no hardcoded emails; no service-role
key; session only in cookies.

Test accounts already exist in the Supabase dashboard: [account-a email] and
[account-b email]. Verify US1 and US2 acceptance boxes from SPEC Block B
manually and tell me the result of each box.

When done: commit, print the summary and the US1/US2 checklist results, and
STOP per CLAUDE.md rule 16b. I will run /review-auth and /full-review before
anything merges, plus a fresh-session diff review.
```

## P4 — Notes CRUD (branch `feat/notes`)

```
Read CLAUDE.md, SPEC.md (Blocks B/US3-US4-US6, C, E, F, G), BUILD_PHASES.md, docs/.

We are starting Phase 4. Create branch feat/notes from main and build ONLY:

- FIRST: lib/notes.ts — the server-only data-access layer (CLAUDE.md rules 3/3b).
  Import "server-only". Functions: listNotes(tag?), getNote(id), createNote(),
  updateNote(id, patch), deleteNote(id). EVERY function starts by calling
  supabase.auth.getUser() and throws/redirects when there is no user, then
  applies the explicit .eq('user_id', user.id) filter (CLAUDE.md rule 7) —
  RLS exists but the filter is still mandatory. No other file may query the
  notes table.
- /notes list page: Server Component calling listNotes(), ordered by
  created_at desc.
- NoteCard grid per SPEC Block E, including loading skeletons, the empty state,
  and the error state with exact copy.
- "New note" via Server Action calling createNote(), redirect to /notes/[id].
  Server Actions never accept a user id from the client.
- /notes/[id] editor: server-fetches the note (ownership-filtered; missing or
  foreign id → notFound()), then NoteEditor holds title and content in LOCAL
  state and pushes changes through a 300 ms debounced Server Action with a 5 s
  maxWait, flushing pending changes on unmount (SPEC rules B1/B2, CLAUDE.md
  rule 9). Never bind inputs directly to server round-trips.
- Save feedback per SPEC rule B8 (retry ×3 with backoff, toast, banner).
- Delete with ConfirmDialog per US4, then redirect and toast.
- All copy from lib/copy.ts; limits enforced per the SPEC Block F validation
  table with LIMITS-derived messages.

No tags UI in this phase (that is Phase 6). Nothing from the OUT list.

Verify US3, US4 and US6 acceptance boxes with the two test accounts and report
each. Also run through the assignment checklist: create note → reload → still
there; sign out → /notes redirects; account B sees none of account A's notes.

When done: commit, print the summary and checklist results, and STOP per
CLAUDE.md rule 16b.
```

## P5 — Optional task 1: minimalist design (branch `feat/design`)

```
Read CLAUDE.md and SPEC.md Block E. We are starting Phase 5. Create branch
feat/design from main.

Give the app a clean, modern, minimalist look built on the existing tokens:
restrained palette from the CSS variables, generous spacing, clear typographic
hierarchy (Inter), simple hover states on cards and buttons, a tidy header.
The feel: calm, paper-like, closer to Bear or Linear than to a colorful
dashboard. Improve visual polish of every existing screen and state (including
skeleton, empty, error, sign-in).

Owner priorities for this pass, in order:
1. Save-status visibility. The "Saving… / Saved" indicator and every
   save-failure notice (the retry toast and the persistent banner with Retry
   now) must be noticeable without hunting: move the status near the content
   being edited (e.g. top of the editor column or sticky), not buried in the
   footer, and make failure states visually loud (color, weight) while success
   stays quiet. Autosave itself stays exactly as built — styling and placement
   only, no logic changes.
2. The editor must read as an editor, not a bare page: a visible note area
   (subtle card/backdrop under title + content), clear placeholders, a
   distinct title zone.
3. Everything else from the general brief above.

Hard constraint: this diff may touch ONLY styling — class names, tokens, layout
markup. Zero changes to logic, actions, queries, copy strings, or auth files.
If a visual fix seems to require a logic change, list it for me instead of
doing it.

Verify both test widths (1280 / 375) with nothing overflowing. When done:
commit, summarize, STOP per CLAUDE.md rule 16b.
```

## P6 — Optional task 2: tags (branch `feat/tags`)

```
Read CLAUDE.md, SPEC.md (US5, Block C, Block F validation table), docs/.

We are starting Phase 6. Create branch feat/tags from main and build ONLY:

- TagEditor on /notes/[id]: chips row; Enter commits a tag; × removes; trims
  input; rejects empty, duplicate (case-insensitive), over-24-chars, and the
  11th tag with the exact LIMITS-derived copy from lib/copy.ts. Tags save
  through the same debounced pipeline as title/content.
- Tag chips on NoteCard.
- TagFilter on /notes: an "All" chip plus one chip per distinct tag across the
  user's notes. Clicking a chip re-fetches FROM SUPABASE using
  .contains('tags', [tag]) combined with the user_id filter — the filtering
  must demonstrably happen in the database, not in the browser. Use a URL
  search param (?tag=...) so the filter survives reload.
- Empty-filter state: "No notes with this tag."

Verify all US5 acceptance boxes and report each. When done: commit, summarize,
STOP per CLAUDE.md rule 16b.
```

## P7 — Docs & verification (branch `chore/docs`)

```
Read CLAUDE.md, SPEC.md Block H, BUILD_PHASES.md Phase 7, and REQUIREMENTS
context: this project is graded on README completeness.

We are starting Phase 7. Create branch chore/docs from main and produce:

- README.md covering, in this order: what the app does (2–3 sentences); stack;
  how to run locally step by step, including creating .env.local from
  .env.example and exactly where in the Supabase dashboard each value lives
  (Settings → API); how test accounts are created (dashboard → Authentication);
  a screenshot placeholder ![Notes workspace](docs/screenshots/notes.png) that
  I will replace; the optional tasks delivered — minimalist design via
  feat/design PR #[n], tags via feat/tags PR #[n]; a short "Known limits"
  section (one tab at a time / last-write-wins, notes cap, no sign-up flow —
  accounts are dashboard-created by design).
- Verify README against the actual code: every claim must be true (CLAUDE.md
  rule 18). List any claim you could not verify instead of writing it.
- Do NOT write REFLECTION.md — I write that myself from my worklog.

Then run the SPEC Block H greps (checks 5 and 6) and report their output
verbatim. When done: commit, summarize, STOP per CLAUDE.md rule 16b.
```

---

## FR — Fresh-session diff review (run after P3 and P4, in a NEW session)

Open a brand-new Claude Code session (no prior context) on the feature branch:

```
You have no prior context on this project — that is deliberate. Read CLAUDE.md
and SPEC.md, then review the diff of this branch against main
(git diff main...HEAD) as a skeptical senior reviewer.

Focus: (1) any signed-in check that trusts the browser instead of the server;
(2) getSession() used for access decisions; (3) hardcoded emails; (4) service-
role key anywhere; (5) custom password handling; (6) note or session data in
localStorage/sessionStorage; (7) any notes query missing the user_id filter;
(8) anything where the code contradicts SPEC.md or CLAUDE.md.

Report findings ordered by severity with file:line, then a verdict:
SAFE TO MERGE or DO NOT MERGE. Do not fix anything — report only.
```

Paste the verdict as a comment on the PR ("Fresh-session review: …") — the
rubric explicitly checks that this is noted.
