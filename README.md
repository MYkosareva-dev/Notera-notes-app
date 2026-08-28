# Notera Notes

A private, per-user notes app. A signed-in user creates, edits, tags and deletes their
own notes; every account sees only its own rows, and the session is verified on the
server before a protected page renders. Unauthenticated visitors can reach nothing but
the sign-in page.

![Notes workspace](docs/screenshots/notes.png)

Runs locally only — this sprint has no build or deploy target.

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 16 (**App Router only** — there is no `pages/` directory) |
| Language | TypeScript, `strict: true`, `noUnusedLocals: true`, no `any` |
| Styling | Tailwind CSS v4 |
| Backend | Supabase — Postgres for the notes, Supabase Auth for sign-in |
| Supabase clients | `@supabase/supabase-js` + `@supabase/ssr` (the session lives in cookies, never in web storage) |
| Icons / font | `lucide-react`, Inter via `next/font/google` |
| Runtime | Node ≥ 20.9 |

Reads happen in Server Components, writes in Server Actions — there are no custom API
routes. All notes access goes through one `server-only` module, `lib/notes.ts`, which
calls `supabase.auth.getUser()` itself and refuses to run without a user.

## Run it locally

1. **Install**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free tier
   is enough).

3. **Create `.env.local`** from the template and fill in three values — the two Supabase
   ones below, then `OPENROUTER_API_KEY` in step 3b:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Where it lives in the Supabase dashboard |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project → **Settings → Data API** → "Project URL" |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project → **Settings → API Keys** → the **Publishable key** (starts `sb_publishable_`) |

   The variable is named `ANON_KEY` for continuity with the rest of the sprint's
   docs; **"publishable key" is the current name for the same low-privilege role**
   that the `anon` key used to fill, and Supabase's own migration guide pairs them
   directly. On a project created before the new panel there is no "API Keys" tab —
   use the **anon public** key under **Legacy API keys** instead. Either one works
   here; both are safe in a browser.

   The app needs nothing else. **The secret key is never used** — not in
   `.env.local`, not in any `NEXT_PUBLIC_*` variable, not anywhere in this repo.
   That is the key on the tab beside the publishable one, the replacement for the
   old service-role key. Because every `NEXT_PUBLIC_*` value is inlined textually
   into the browser bundle, pasting it into either variable above would publish a
   row-level-security bypass to anyone who views source, and the app would boot and
   work perfectly while doing so. [`lib/supabase/env.ts`](lib/supabase/env.ts)
   therefore **refuses a secret key at boot** rather than trusting the instruction
   in this table — it checks the prefix, so it catches the current key format and
   not a legacy JWT (the file records that gap).

3b. **Add the OpenRouter key.** Create one at
   [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) and put it in
   `.env.local` as `OPENROUTER_API_KEY`.

   | Variable | Where it comes from |
   | --- | --- |
   | `OPENROUTER_API_KEY` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) → **Create key** |

   **Note what this variable is missing, and do not add it.** It has no
   `NEXT_PUBLIC_` prefix, and it is the only one of the three that must not. The two
   above are public on purpose and hold low-privilege values; this one is a secret
   that spends real credit. Because every `NEXT_PUBLIC_*` value is inlined textually
   into the browser bundle, a key pasted under such a name is a working, billable
   credential published to anyone who views source — and, exactly as with the
   Supabase case above, the app would boot and answer correctly the whole time.

   Three fences hold that, weakest to strongest:

   - [`lib/openrouter/env.ts`](lib/openrouter/env.ts) **refuses at boot** any
     `NEXT_PUBLIC_*` variable named for this key *or* holding a value shaped like one
     — the second test matters, because a key pasted under a name that says nothing
     is the case a name check alone misses.
   - **Both** modules in [`lib/openrouter/`](lib/openrouter/) — `env.ts` and
     `server.ts` — import `server-only`, so **`npm run build` fails** if a Client
     Component ever imports either one. This is the strongest of the three because it
     is not a text scan: it is the compiler refusing to produce a bundle. The fence is
     on `env.ts` too, and deliberately: with it only on `server.ts`, a Client
     Component could import `env.ts` directly and the build would have succeeded.
   - `npm run check` scans every code file the repo ships for both spellings — the
     public-prefixed name, and a raw key literal pasted into a component.

   Then prove it works:

   ```bash
   npm run verify:openrouter
   ```

   Seven checks — three local, then four over the network: no `NEXT_PUBLIC_`
   OpenRouter variable exists, the key is set, `DEFAULT_MODEL` is readable from
   source, the key is valid, that model is still a routable id, its providers are up,
   and a real completion comes back. It costs a fraction of a cent (one ~32-token
   reply) and **never prints the key** — it reports the key's length and nothing more.

   The connection is deliberately **unwired**: nothing in the app calls a model yet.
   `lib/openrouter/server.ts` exports `DEFAULT_MODEL` and one `chat()` function, and
   that is the whole of it. See the 2026-08-28 amendment in [`SPEC.md`](SPEC.md) (M15)
   for why, and for what a future feature would owe.

4. **Create the table.** Open **SQL Editor** in the dashboard, paste
   [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates `public.notes`,
   enables row-level security with one owner-only policy per verb — each restricted to
   the `authenticated` role — takes back the DML grants Supabase hands `anon` on every
   new public table, adds the index the list ordering walks plus a GIN index for the tag
   filter, and installs the invoker-rights trigger that touches `updated_at`.

   That one file is all you run. The two migration files beside it,
   [`phase7-amendments.sql`](supabase/phase7-amendments.sql) and
   [`security-amendments.sql`](supabase/security-amendments.sql), are the record of what
   brought an already-provisioned database to this shape, and each ends with the queries
   that verify it — including `select relrowsecurity from pg_class where oid =
   'public.notes'::regclass;`, which is the only one of them that can tell an **enforced**
   fence from a decorative one. Policies keep existing on a table whose row-level security
   has been switched off; they just stop being applied.

5. **Create the test accounts.** There is no sign-up screen — by design (the assignment
   asks for dashboard-created accounts). In the dashboard go to
   **Authentication → Users → Add user → Create new user**, enter an email and a
   password, and repeat for a second account so you can prove the two cannot see each
   other's notes. Leave **"Auto confirm user?"** checked — it is on by default, and the
   dialog sends no confirmation email, so an unconfirmed account would have no way to
   confirm itself and could not sign in.

   While you are there, turn **off** public self-signup under **Authentication →
   Sign In / Providers**. The app never calls `signUp`, but the Auth API accepts one
   until that setting is off. You can check it from the terminal without opening the
   dashboard:

   ```bash
   curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
     "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" \
     | grep -o '"disable_signup":[a-z]*'
   # want: "disable_signup":true
   ```

6. **Start the dev server**

   ```bash
   npm run dev     # http://localhost:3000
   ```

   `/` redirects to `/notes`; signed out, `/notes` redirects to `/sign-in`.

Other scripts: **`npm run check`** — dependency-free static checks over the code,
enforcing the rules a type-checker cannot see: no web storage, no privileged key under
any of its names (the legacy service-role one and the current secret one, since the
new-format name shares no substring with the old), no `getSession()` call site, every
notes table access inside the DAL and every one of its query chains carrying a literal
`.eq("user_id", user.id)`, no privilege-escalating SQL object in `supabase/`, plus a few
outright prohibitions. It prints its own count and fails loudly if it scanned nothing. Honest
scope: it reads text, so it cannot tell whether that `user.id` came from `getUser()`, and
nothing here re-verifies the live database. Also `npm run typecheck` (`tsc --noEmit`),
`npm run build`, `npm start`.

![Sign-in page](docs/screenshots/sign-in.png)

## How it works

- **Three fences on every workspace route.** `lib/notes.ts` calls `getUser()` on every
  operation and refuses to run without a user — that is the authoritative gate. The
  server layout `app/notes/layout.tsx` checks `getUser()` and redirects. `proxy.ts`
  (Next's current name for `middleware.ts`) refreshes the session cookie and does a
  cheap early redirect, and is never trusted as the gate.
- **`getUser()`, never `getSession()`.** `getSession()` reads the cookie without
  validating the token, so it is not used for any access decision anywhere in the app.
- **Every notes query filters by `user_id`** in addition to RLS, which is the second
  fence rather than the only one.
- **Editing is debounced, not per-keystroke.** Inputs hold local state and push through
  one Server Action after 300 ms of quiet, with a 5 s maximum wait, then
  `revalidatePath`. Nothing writes to Supabase from a component.
- **Dark mode is a token swap.** Every colour is a `@theme` variable, so the dark theme
  redefines those variables and no component carries a `dark:` utility. The preference is
  a cookie, read in the root layout and stamped on `<html data-theme>` — so the first
  byte already carries the right theme and there is no flash and no blocking script in
  `<head>`. The control has three states, and **System** is the default: with no
  attribute stamped, `prefers-color-scheme` in CSS decides. It works on `/sign-in`,
  before any account exists, which is also why the preference is not a database column.
- **Limits** all come from `LIMITS` in `lib/types.ts` — 200 characters per title,
  50,000 per note, 24 per tag, 10 tags per note, 1,000 notes per account. Three of them
  have a matching `check` constraint in the database (title length, content length, tag
  count). The per-tag length and the notes-per-account cap are enforced in the DAL
  only — a database fence for those two was considered and **declined**, because both
  would need a trigger on a table that autosaves while you type. It is recorded in
  SPEC Block C as an accepted limitation, with what guards them instead.

## Supabase guidance in this repo

The official Supabase Agent Skills are installed (`npx skills add supabase/agent-skills`)
and pinned in [`skills-lock.json`](skills-lock.json) — `supabase` and
`supabase-postgres-best-practices`, under `.agents/skills/`. Alongside them,
[`docs/`](docs/) holds the Supabase documentation this project was built against, fetched
via Context7, each file carrying its source URL and inline annotations. Both exist for
the same reason: Supabase's auth patterns change often enough that training-data memory
is the wrong authority for them.

## Verification

Per-account scoping, evidenced in the Supabase dashboard. All three captures are in
[`docs/screenshots/`](docs/screenshots/).

**Both accounts exist and were created by hand** — Authentication → Users. The app has
no sign-up screen, so this is the only way an account gets made here.

![Supabase Authentication → Users, showing the two test accounts](docs/screenshots/auth-users.png)

**Every row carries its owner** — Table Editor → `public.notes`. The `user_id` column
holds one of two uuids, and the table reports its 4 RLS policies (one per verb).

![Supabase Table Editor on public.notes, with the user_id column populated](docs/screenshots/table-user-id.png)

**The two accounts' rows are separate** — SQL Editor:

```sql
select user_id, count(*) as notes, min(created_at) as first_note
from public.notes
group by user_id
order by notes desc;
```

Two rows come back: 7 notes for one `user_id`, 2 for the other, and no row without an
owner (`user_id` is `not null` and defaults to `auth.uid()`).

![The query result: two distinct user_id values, 7 and 2 notes](docs/screenshots/sql-scoping.png)

The browser checklist that goes with them: sign in as A → create a note → reload (still
there) → sign out → hit `/notes` directly (redirected to `/sign-in`) → sign in as B →
none of A's notes are visible.

## Project write-up

[`REFLECTION.md`](REFLECTION.md) is the developer's own account of the build, written
by hand: the persistent-storage consultation that preceded any code, an authentication
issue caught and fixed, a prompt the agent took further than intended, and two
appendices — a data-model walkthrough and the second optional task.

## Optional tasks delivered

| Task | Branch | PR |
| --- | --- | --- |
| Minimalist visual design | `feat/design` | [#5](../../pull/5) |
| Tags with per-tag filtering, filtered in Postgres via `tags @> ARRAY[…]` and kept in the URL as `?tag=` | `feat/tags` | [#6](../../pull/6) |

## Known limits

- **One tab at a time.** Two tabs editing the same note are last-write-wins; there is no
  realtime sync or conflict resolution (SPEC edge case G-C1).
- **1,000 notes per account.** The cap is enforced on write; past it, "New note" reports
  the limit instead of creating a row.
- **No sign-up, no password reset, no email flows.** Accounts are created in the
  Supabase dashboard, deliberately.
- **Local only.** No deployment target this sprint, and the auth cookies keep the
  `@supabase/ssr` defaults — `secure` and `httpOnly` are decisions to revisit before any
  deploy (recorded in SPEC Block A).
- **Filtering is one tag at a time.** There is no multi-tag intersection and no search.
- **The theme control is not on the note screen.** It is on `/sign-in` and in the
  workspace header. Choosing a theme is a rare action and both of those screens are on
  the way to a note, so the editor keeps a sticky row that is only about the text being
  typed. Change theme from the list, not from inside a note — a recorded decision, not
  an omission.
- **A theme change made offline is not remembered.** It applies at once and holds until
  you reload; the cookie write is what fails, and nothing is shown (SPEC G-30).
- **Two of the five caps are app-enforced only.** A row written by hand in the SQL
  Editor can carry a tag longer than 24 characters, or push an account past 1,000
  notes; nothing written through the app can. A deliberate trade — see SPEC Block C.
