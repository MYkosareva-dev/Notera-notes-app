# BUILD_PHASES.md — Phased build plan with review gates

The build is divided into phases. Each phase is one feature branch and ends at a
**gate**: the agent stops, the owner reviews the diff with slash commands, opens
the pull request, merges, and only then starts the next phase — in a **fresh
Claude Code session** (Sprint 2 workflow habit).

## The gate ritual (same at the end of every phase)
1. Agent: commits, prints a summary of changed files, and **stops**.
2. Owner runs, in this order:
   - `/review-auth` — the project's own auth-mistake scan (in `.claude/commands/`)
   - `/full-review` — general code review (from `wshobson/commands`)
   - `/refactor-clean` — cleanup pass (from `wshobson/commands`), when the diff is large
3. Any FAIL or serious finding → agent fixes on the same branch → stop again → re-review.
4. Owner pushes the branch, opens the PR on GitHub with a short description,
   requests a **fresh-session diff review** for the auth-relevant phases (3 and 4),
   and notes its result in a PR comment.
5. Merge. Log everything noteworthy in `WORKLOG.md`. Next phase starts in a fresh session.

> Prerequisites once, before Phase 1, in this order:
> 1. Run the P0 persistence consultation (PHASE_PROMPTS.md) in the EMPTY repo —
>    before this file, SPEC.md or CLAUDE.md are committed, since they codify
>    P0's outcome.
> 2. Commit the documentation set (SPEC.md, CLAUDE.md, BUILD_PHASES.md,
>    .claude/commands/, .env.example).
> 3. Install the command packs: `npx skills add supabase/agent-skills`
>    (required by the rubric) and the `wshobson/commands` pack for
>    `/full-review` / `/refactor-clean`.

---

## Phase 1 — Scaffold  (branch `feat/scaffold`)
Build: Next.js App Router + TS strict (`noUnusedLocals`) + Tailwind; design tokens
and carried-over Notera components (Header, EmptyState, ConfirmDialog, Toast,
InlineRename, not-found pattern); `app/error.tsx`; `lib/copy.ts`; `lib/types.ts`
with `LIMITS`; root-anchored `.gitignore`; `.env.example`.
No Supabase code yet.
**Done when:** `npm run dev` renders a placeholder page at 1280 and 375 with zero
console errors.
**GATE.** (`/full-review` is the main check here; `/review-auth` will be mostly N/A.)

## Phase 2 — Supabase wiring  (branch `feat/supabase-setup`)
Build: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`
(renamed `lib/supabase/proxy.ts` in Phase 3 with the entry-file rename)
per the Context7-fetched docs in `docs/`; `supabase/schema.sql` checked in
(already executed in the SQL Editor by the owner); env vars read from `.env.local`.
No UI changes.
**Done when:** a temporary server-side smoke test (deleted before the gate) can
select from `notes` without error.
**GATE.**

## Phase 3 — Authentication  (branch `feat/auth`)  ← highest-weight phase
Carry-in from the Phase 1 gate: adopt `proxy.ts` (Next's current convention)
instead of `middleware.ts`, and update the four doc mentions in this same
branch (CLAUDE.md rule 3, SPEC.md B3 + Block A/F, review-auth item 8).
Build: `/sign-in` page + `SignInForm`; `signIn`/`signOut` Server Actions;
`proxy.ts` session refresh + redirects; protected `app/notes/layout.tsx`
with the authoritative `getUser()` check; sign-out button in Header.
**Done when:** SPEC US1 and US2 acceptance boxes pass manually, PLUS the
token-refresh probe (invisible to normal checks, since every US1/US2 step fits
inside the default 1h token TTL): in the dashboard set JWT expiry to 60s, sign
in, wait past the TTL, reload /notes with cache disabled — the document request
must show Set-Cookie + the no-store headers and render without bouncing to
/sign-in; then restore expiry to 3600.
**GATE — strict:** `/review-auth` must be all-PASS before the PR. Fresh-session
diff review required; note it in a PR comment.

## Phase 4 — Notes CRUD  (branch `feat/notes`)
Build: `/notes` list (Server Component fetch, `.eq('user_id', ...)`); NoteCard;
New note action; `/notes/[id]` editor with local state + 300 ms debounce +
5 s maxWait (SPEC B2); delete with ConfirmDialog; loading skeletons, empty,
error and not-found states per SPEC Block E.
**Done when:** SPEC US3, US4 and US6 boxes pass with the two dashboard test
accounts; the assignment's 4-step verification checklist passes.
**GATE — strict:** `/review-auth` all-PASS; fresh-session review; PR; merge.

## Phase 5 — Optional task 1: minimalist design  (branch `feat/design`)
Build: full visual pass per SPEC Block E tokens — restrained palette, spacing,
typography, hover states, tidy header. No logic changes allowed in this diff.
**Done when:** both test widths look clean; zero logic files touched.
**GATE.** (This PR is the rubric's "optional task via its own branch and PR.")

## Phase 6 — Optional task 2: tags  (branch `feat/tags`)
Build: TagEditor on the note page, TagFilter chips on the list, server-side
`.contains('tags', [tag])` filtering, caps and copy per SPEC (US5).
**Done when:** US5 boxes pass; filter demonstrably queries Supabase.
**GATE.** (Second optional task = bonus; must be described in REFLECTION.md Appendix B.)

## Phase 7 — Docs & verification  (branch `chore/docs`)
Build: README.md (purpose, run steps, env vars + where to find values, screenshot,
optional tasks + their PRs); REFLECTION.md written by the owner from WORKLOG.md
using REFLECTION_TEMPLATE.md; screenshots into `docs/screenshots/` (local app,
Authentication tab, Table Editor with user_id, the two-account SQL query).
Owner: fresh-clone test in a clean folder; full 4-step checklist there.
Also in Phase 7: reword Block H check 5 to exclude vendor skill docs
(.agents/skills/) and docs/; add a re-checkable probe "GET
{SUPABASE_URL}/auth/v1/settings returns disable_signup: true" (public
self-signup was found enabled at the Phase 2 gate and switched off in the
dashboard); decide the four carried schema-amendment items from the Phase 2
full-review (tagMax/notesPerUser DB fence, set_updated_at search_path,
id-existence oracle, schema idempotency note).
**Done when:** SPEC Block H — all 8 checks pass.
**GATE → final merge → rehearse the review-call demo (dashboard walk-through).**

---

## Rules that make the gates work
- One phase = one branch = one PR. No phase starts before the previous one merges.
- The agent NEVER merges, never opens PRs, never continues past a gate (CLAUDE.md 16b).
- Prompts touching Supabase APIs always reference `docs/` (Context7 material).
- Every gate's findings — even "nothing found" — go into `WORKLOG.md`.
