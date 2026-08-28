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

## Secrets

- Secrets live in `.env.local` only. It is gitignored and never committed.
- Server-side use only: any module reading a secret imports `server-only`.
  No secret is ever prefixed `NEXT_PUBLIC_`.
- **Never print a secret's value.** Do not `cat`, `grep`, `head`, `echo` or
  otherwise read the contents of `.env*` files, and never include a secret
  value in tool output, logs, error messages, commit messages or a summary
  to me — not even truncated or partially masked.
- To inspect secrets, read variable NAMES only:
  `grep -o '^[A-Z_]*' .env.local`
- Any recursive search over the repo excludes `.env*` explicitly:
  `grep -r --exclude='.env*' ...`

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
   trusted as the gate. It is also the ONLY place ON THE SERVER that may refresh a
   token: refreshing rotates the refresh token, and a rotation performed where
   cookies cannot be written (any Server Component) spends the browser's token and
   logs the user out. Clients from `lib/supabase/server.ts` validate, never refresh;
   a browser client may refresh, since a browser can persist the rotated cookies.
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

19. **WORKLOG.md is the owner's private file — never read it.** It is gitignored
    and off-limits to the agent regardless of what task is in progress. The same
    applies to any credential store: gitignore is not an access boundary, but
    this rule is.
20. **Never use the owner's credentials.** Test-account passwords are never
    given to the agent, never read from any file, and never typed by the agent
    into any form. Any verification that requires a real sign-in belongs to the
    owner. If a task seems to require credentials, stop and ask — the answer
    will be a redesign of the task, not the credentials.
21. **The `## Secrets` rules at the top of this file are absolute — and this is the
    incident that put them there.** That section states the mechanics (never read
    `.env*` contents; names only; `--exclude='.env*'` on every recursive search).
    This rule exists so the REASON survives, because the rule was broken by an agent
    that already knew it.

    On 2026-08-28, asked to confirm where `OPENROUTER_API_KEY` was read, the agent
    ran `grep -rn "OPENROUTER_API_KEY" .` — `node_modules`, `.next` and `.git`
    excluded, **`.env*` not** — and printed the live key in full. Note what did NOT
    prevent it: the task itself was a security audit, the agent had just written the
    scanner that documents this exact hazard, and two other greps in the same session
    were correctly scoped. **Care is not a control.** The exclusion goes on the
    command every time, including the throwaway one-off, including when the search
    term is a variable name and not a value — because a name search matches the
    assignment line, and the assignment line contains the secret.

    Two techniques that answer the usual questions without printing anything:
    - To prove a key WORKS, report a property, not the value — `npm run
      verify:openrouter` prints the key's length and never the key.
    - To prove a key is ABSENT from a build artifact, grep for the value and report
      only a COUNT of matching files, never a matching line.

    `scripts/check.mjs` already encodes the same rule and states its reasoning: it
    scans `.env.example` by name but deliberately excludes `.env.local` and every
    `.env*` glob, "because printing a finding out of a real secrets file would leak
    the secret."

    If a secret does reach the transcript, it is an incident and not a slip: say so
    plainly in the same reply, and escalate to **whoever controls the key**.

    **That is not always "rotate it", and in this project it is not.**
    `OPENROUTER_API_KEY` is **school-issued and centrally managed** — the owner cannot
    regenerate it, so telling her to rotate is advice she cannot act on. The correct
    remediation here is **report it to the key's owner for reissue**, which was done on
    2026-08-28; the key is capped at $15 with ~$0.00 spent, and the transcript never
    left the owner's machine. A future session must not keep repeating "rotate it".

    The general rule this is an instance of: **name the containment action the person
    in front of you can actually take.** Establish who controls a credential before
    prescribing a fix for it — for a managed or issued key that means reporting and
    requesting reissue, plus the spend cap and blast radius, not a rotation the owner
    has no authority to perform.

## AI model calls
- All model calls must happen server-side only. Never call the OpenRouter API from browser code.
- OPENROUTER_API_KEY lives in .env.local and must never be exposed to the browser (no NEXT_PUBLIC_ prefix, no passing it to client components).
