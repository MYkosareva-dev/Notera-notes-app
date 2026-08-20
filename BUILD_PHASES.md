# BUILD_PHASES.md — Phased build plan with review gates

The build is divided into phases. Each phase is one feature branch and ends at a
**gate**: the agent stops, the owner reviews the diff with slash commands, opens
the pull request, merges, and only then starts the next phase — in a **fresh
Claude Code session** (Sprint 2 workflow habit).

## The gate ritual (same at the end of every phase)
0. Agent: `npm run check && npm run typecheck && npm run build` — all three clean
   before the commit. The build is not optional: a mistyped `server-only` import is
   silently inert without it. `npm run check` leads because it is the only guard on
   rules 3b and 7 — a dropped ownership filter typechecks and builds perfectly.
   It needs no network and no `.env.local`, so it can never be the reason a gate stalls.
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
Four probes found defects a green HTTP suite structurally could not see, so they
are recorded as recipes rather than drivers — prose never flakes and needs no
credentials in the repo. Each is a browser check, by hand or by driving real
Chrome over CDP:
1. **Offline save.** Open a note, cut the network (DevTools offline, or CDP
   `Network.emulateNetworkConditions` — which needs `Network.enable` called first
   on that session, or the switch is silently ignored and the "offline" requests
   simply succeed), then type. Expect ONE notice, four attempts on the B8 ladder,
   then a suspended state whose **Retry now** owns the next move: there is no
   auto-resume when the network returns, by decision.
2. **Dialog closed on arrival.** Load `/notes/[id]` and read
   `getComputedStyle(document.querySelector("dialog")).display` — it must be
   `"none"`. The Phase 4 bug was a display utility beating the UA's closed-state
   rule, so the confirm dialog painted across the editor with its Delete armed and
   ate the click meant for the title field. `npm run check` guards the fix's one
   line; only this probe sees the screen.
3. **No red on a successful sign-in.** Sign in with correct credentials and watch
   every frame, including the redirect: no error copy may appear at any point. The
   defect here is a flash, so a single end-state assertion misses it.
4. **A dismissed notice comes back.** Dismiss a persistent banner, then type one
   character — the banner must return. The original defect was the ABSENCE of that
   code path, which no test can fail on until someone specifies it; hence
   `review-auth` question 10.
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
Also in Phase 7, all landed on `chore/docs`: Block H check 5 is rescoped to **every
code file this repo ships** — app code plus `scripts/`, `proxy.ts`, `next.config.ts`,
`postcss.config.mjs`, `.env.example` and `supabase/` — excluding the paths that only
ever discuss the key in prose (`.agents/skills/`, `.claude/`, `docs/`, `node_modules/`,
`.next/`, `SPEC.md`) and `WORKLOG.md`, which is excluded for the stronger reason that
rule 19 makes it off-limits: running the old check printed two of its lines. Block H
holds the authoritative wording and the enumerated prose hits — do not paraphrase the
scope here, because that is precisely what drifted once already inside this phase.
The self-signup probe is now **Block H check 9**: `GET
{SUPABASE_URL}/auth/v1/settings` with the anon key as `apikey` must report
`"disable_signup": true`. Re-checkable on purpose, because dashboard state can
regress with no code change — and it WAS enabled at the Phase 2 gate before being
switched off there. Verified `true` at the Phase 7 gate.
Of the four carried schema-amendment items, two are in
`supabase/phase7-amendments.sql` (`set_updated_at`'s pinned `search_path`; the
drop of the superseded `notes_user_created_idx`) together with a third,
owner-requested change: the four RLS policies rewritten to `(select auth.uid())`
per the linter's `auth_rls_initplan` advisory. The **tagMax/notesPerUser DB fence
is DECLINED** — both need a trigger on a table that autosaves while the user
types, which is disproportionate here; SPEC Block C records it as an accepted,
documented limitation with what guards those caps instead. The id-existence
oracle and the schema idempotency note stay parked: neither changes behaviour,
neither is needed for Block H.
The three verification items deferred at the Phase 4 gate land here too:
`npm run check` (`scripts/check.mjs`, no dependencies, hardened at the Phase 7
/full-review against a mutation set that had defeated five of its checks), the four
probe recipes written into Phase 4 above, and question 10 in `review-auth`.
**Done when:** SPEC Block H — all 9 checks pass (check 9 is the self-signup probe added in this phase).
**GATE → final merge → rehearse the review-call demo (dashboard walk-through).**

---

## Rules that make the gates work
- One phase = one branch = one PR. No phase starts before the previous one merges.
- The agent NEVER merges, never opens PRs, never continues past a gate (CLAUDE.md 16b).
- Prompts touching Supabase APIs always reference `docs/` (Context7 material).
- Every gate's findings — even "nothing found" — go into `WORKLOG.md`.
