# CLAUDE.md — Notera Notes

## What this is
A private, per-user notes app: each signed-in user sees only their own notes.
**`SPEC.md` is the single source of truth** for behavior, copy, limits and edge cases.
When in doubt, follow SPEC.md — do not invent.

## Stack
- Next.js, **App Router only** (never create a `pages/` directory)
- TypeScript `strict: true`, `noUnusedLocals: true`, no `any`
- Tailwind CSS
- Supabase: Postgres + Supabase Auth via `@supabase/supabase-js` + `@supabase/ssr` (cookie sessions)
- `lucide-react` icons, Inter via `next/font/google`
- No other dependencies without explicit owner approval first.

## Run
```bash
npm install
npm run dev     # http://localhost:3000
```
Local only this sprint. Env vars come from `.env.local` (see `.env.example`).

## Authentication rules
1. **Supabase Auth handles all sign-in and session handling.** No custom password
   handling of any kind: no hashing, no comparison, no homemade tokens.
2. **The session is verified on the SERVER before any protected page loads.**
   On the server the only valid check is `supabase.auth.getUser()`.
   `getSession()` does not validate the token — using it for any access decision
   is prohibited.
3. **Workspace routes require a signed-in user — three fences.**
   (1) The data-access layer `lib/notes.ts` calls `getUser()` on every operation
   and refuses to run without a user — this is the authoritative gate.
   (2) The server layout `app/notes/layout.tsx` checks `getUser()` and redirects.
   (3) `proxy.ts` (Next's current name for `middleware.ts`) only refreshes the
   session cookie and does a cheap early redirect — the interceptor is NEVER
   trusted as the gate.
3b. **All notes data access goes through `lib/notes.ts`** (marked `server-only`).
   No page, component or Server Action queries the `notes` table directly.
   Server Actions never accept or trust a user id from the client — the DAL
   derives it from `getUser()`. Remember: every Server Action is a publicly
   callable endpoint; treat each one as such.
4. **The service-role key must never appear** in app code, in any `NEXT_PUBLIC_*`
   variable, or anywhere else in this repo. This project needs only the anon key.
5. **No hardcoded email addresses** anywhere in the code.

## Data rules
6. **Supabase is the only persistence layer.** No note data — and no session data —
   in `localStorage` or `sessionStorage`, under any circumstances.
7. **Every notes query filters by the signed-in user's id** (`.eq('user_id', user.id)`).
   RLS is enabled as the second fence, but the explicit filter is still mandatory.
8. Schema changes go through `supabase/schema.sql` — keep the file in sync with
   what actually ran in the SQL Editor.

## Code rules
9. **Editor inputs hold local state** and push changes via a ~300 ms debounced
   Server Action (`maxWait` 5 s). Never bind an input directly to a server round-trip —
   per-keystroke writes to shared state caused input lag in the previous project.
10. **Every user-visible string lives in `lib/copy.ts`.** Numbers inside copy are
    derived from `LIMITS` (`toLocaleString("en-US")`), never typed out.
11. **Import constants, never redeclare them.** `noUnusedLocals` stays on.
12. **`.gitignore` patterns for project folders must be root-anchored** (`/data/`,
    not `data/`) — an unanchored pattern once silently ignored `app/api/data/`
    and broke the app on a fresh clone.
13. `app/error.tsx` (error boundary) must exist. Errors that matter to the user
    are shown in the browser, not only logged to the terminal.
14. One mutation pipeline: local state → debounced Server Action → Supabase →
    `revalidatePath`. No component writes to Supabase directly.

## Workflow rules
15. **Before writing any code that touches Supabase APIs, read `docs/` first.**
    It contains current official documentation fetched via Context7, each file
    with its source URL and inline annotations. Trust the annotations over
    training-data memory — Supabase auth patterns change often.
16. Work happens on feature branches (`feat/*`), merged via pull requests.
    Before proposing a merge, run `/review-auth` on the diff and report the result.
16b. **The build is phased — see `BUILD_PHASES.md`. Stop at every phase gate.**
    When a phase's checklist is done: commit, summarize what changed, and STOP.
    Do not start the next phase, do not merge, do not open a PR yourself.
    The owner then runs her review slash commands (`/review-auth`, `/full-review`,
    `/refactor-clean`) on the diff, opens the pull request, and decides when the
    next phase starts. If a review produces fix requests, apply them on the same
    branch and stop again.
17. Do not build anything on the OUT list in SPEC.md Block B. It is a prohibition,
    not a backlog.
18. `README.md` and this file must never promise behavior the code does not have.
    If code and docs diverge, fix one of them in the same change.
