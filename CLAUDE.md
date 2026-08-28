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
3b. **All notes data access goes through `lib/notes.ts`** (marked `server-only`), and
   **all chat-history access through `lib/chatMessages.ts`** — one door per table.
   No page, component or Server Action queries either table directly.
   Server Actions never accept or trust a user id from the client — the DAL
   derives it from `getUser()`. Remember: every Server Action is a publicly
   callable endpoint; treat each one as such.
3c. **`/chat` requires a signed-in user — its own three fences (SPEC US8).**
   (1) `lib/chat.ts` (marked `server-only`) calls `getUser()` before it validates a
   payload and before it calls a model — the authoritative gate, and here it is
   protecting the SPEND rather than data: the page itself renders an empty
   conversation and has nothing to leak, so what must not happen without a user is
   the paid request. (2) `app/chat/layout.tsx` checks `getUser()` and redirects — a
   SEPARATE file from the notes layout on purpose; a shared parent would protect
   future routes silently, and rule 3 counts fences per route. (3) `proxy.ts`, via
   `isProtectedPath` in `lib/routes.ts` — the same convenience redirect, never the
   gate. Adding a path to that predicate protects nothing by itself.
   No page, component or action calls `lib/openrouter/` directly: `lib/chat.ts` is
   the one door, the way `lib/notes.ts` is the one door to the `notes` table.
4. **A privileged Supabase key must never appear** in app code, in any
   `NEXT_PUBLIC_*` variable, or anywhere else in this repo. It has two names —
   `service_role` in the legacy dashboard panel, `sb_secret_…` in the current
   one — and the prohibition covers both spellings and any variable named after
   either. This project needs only the **low-privilege key**: the publishable
   key (`sb_publishable_…`), which is what `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   holds; the variable keeps its older name, the role is the same.
   `lib/supabase/env.ts` refuses a secret-prefixed value at boot, because every
   `NEXT_PUBLIC_*` value is inlined into the browser bundle — a privileged key
   there is an RLS bypass published to anyone who views source, and the app
   would boot and work perfectly while doing it. That guard compares a prefix,
   so it does not catch a legacy `service_role` JWT; `npm run check` is the
   second net and covers all four spellings.
5. **No hardcoded email addresses** anywhere in the code.

## Data rules
6. **Supabase is the only persistence layer.** No note data — and no session data —
   in `localStorage` or `sessionStorage`, under any circumstances.
   A non-secret DISPLAY PREFERENCE in a cookie is neither note data nor session
   data, and this rule does not reach it: it carries no identity, grants nothing,
   and a forged value can only repaint the page for whoever forged it. The theme
   preference (`lib/theme.ts`) is the one such value, and it is in a cookie rather
   than web storage for the reason web storage cannot serve — the server must know
   it before the first byte or the page paints in the wrong theme. The ban on web
   storage itself stays absolute, with no exception of any kind.
7. **Every notes query filters by the signed-in user's id** (`.eq('user_id', user.id)`).
   RLS is enabled as the second fence, but the explicit filter is still mandatory.
8. Schema changes go through `supabase/schema.sql` — keep the file in sync with
   what actually ran in the SQL Editor. A change to an already-provisioned database
   also gets its own migration file beside it (`phase7-amendments.sql`,
   `security-amendments.sql`, `chat-amendment.sql`), kept as the record of what ran.
   Where a migration is written but has NOT yet run, say so in a marker at the top of
   both files — `schema.sql` claims to describe a database that exists, and an un-run
   table in it is exactly the divergence rule 18 forbids.

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
- **Every model call goes through `lib/chat.ts`** (marked `server-only`), which calls
  `getUser()` first and refuses without a verified user. `lib/openrouter/server.ts` is
  the connection and has no opinion about who may use it; the gate is the other file.
  No page, component or Server Action may call `chat()` directly — the same chokepoint
  discipline as rule 3b, and here it is what keeps an anonymous POST from spending
  money.
- **A model call is METERED, so the rules that protect text do not transfer.** No
  debounce (rule 9 exists to stop per-keystroke writes; a message is one explicit
  submit) and no automatic retry (rule B8 retries a save three times because a note
  must not lose text — a failed send has lost nothing, and each attempt costs credit).
  A retry is a button the user presses. Do not add an auto-retry, a backoff ladder or
  a background refresh to this path without the owner saying so.
- **The transcript arrives from the client and is not trusted.** It is validated in
  `lib/chat.ts`: both caps from `LIMITS`, and a `role` of `user` or `assistant` only.
  A `role: "system"` turn must always be refused — accepting one would let a caller
  replace the app's own instructions to the model. The system prompt is built
  server-side, in that file, and never travels on the wire.
- **Chat history IS persisted, in `public.chat_messages`, and `lib/chatMessages.ts` is
  its only door** — the same rule 3b chokepoint `lib/notes.ts` is for `public.notes`.
  Two tables, two DALs, and `scripts/check.mjs` is driven by a list of both, so adding a
  third table means adding a line to `DALS` there. Forgetting to is a FAIL rather than a
  silent gap: `.from(` anything, in any file that is not a listed DAL, is already a
  finding.
- **The table is APPEND-ONLY, enforced by two ABSENT policies** (SELECT and INSERT
  exist; UPDATE and DELETE do not, so RLS denies them). Do not add an update or delete
  path — not in the DAL, not in a policy — without an owner amendment. "New chat"
  deletes nothing and must not start to.
- **Storage must never become an input to the prompt.** The transcript the model sees is
  the client's array, posted whole on every send; the database seeds `ChatPanel`'s state
  once on mount and is not read again. Do not "improve" this by having the action load
  the conversation from the table and build the prompt from it — that changes the
  in-conversation memory behaviour the owner explicitly ring-fenced, and it would make
  every send a read.
- **Write both rows of an exchange together, after the reply, and nothing on a failed
  send.** That ordering is what keeps Retry from storing a duplicate question. A write
  that fails is reported as `persisted: false` on the SUCCESS arm, never as a failed
  send: the reply has already been paid for.
- **Rule 6 still binds absolutely.** Supabase is the persistence layer; no chat data in
  web storage, ever.
