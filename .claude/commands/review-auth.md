Review the diff of the current pull request (or, if no PR is given, the diff of the
current branch against main: `git diff main...HEAD`) against the common
authentication mistakes from the Sprint 2 authentication lesson.

For each item give a verdict — PASS or FAIL — and for every FAIL cite the file and line:

1. **Server-side check.** Is the signed-in check performed on the server before any
   protected page renders? Flag any place where access is decided only in the browser
   (client component state, a client-side redirect, or content hidden with CSS/JS).
2. **`getSession()` misuse.** Is `getSession()` used anywhere to decide access?
   That is a FAIL — on the server only `supabase.auth.getUser()` is acceptable.
3. **Hardcoded emails.** Any email address literal in the code?
4. **Service-role key exposure.** Any service-role key in a `NEXT_PUBLIC_*` variable,
   in client-reachable code, or referenced anywhere at all in this repo?
5. **Custom password handling.** Any hashing, password comparison, or homemade
   tokens instead of Supabase Auth?
6. **Web storage.** Does any note data or session data end up in `localStorage` or
   `sessionStorage` — directly, or via Supabase client configuration (a browser
   client created without the `@supabase/ssr` cookie adapter)?
7. **Ownership filter.** Any query on the `notes` table missing the explicit
   `.eq('user_id', ...)` filter for the signed-in user?
8. **Route coverage.** Do BOTH `proxy.ts` (Next's current name for `middleware.ts`)
   and `app/notes/layout.tsx` guard the workspace? Flag if either is missing or if
   a new workspace route escapes both.
9. **DAL bypass.** Does any page, component or Server Action query the `notes`
   table directly instead of going through `lib/notes.ts`? Does any Server Action
   accept a user id from the client instead of deriving it via `getUser()` inside
   the DAL?

10. **Dismissible notices.** For every persistent notice in the diff — a banner, an
    inline error, a save-failed state — what happens if the user dismisses it? Is the
    condition still true afterwards, and does the notice come back when the user next
    acts? A notice that can be dismissed while its cause persists leaves the user
    working in a state the app knows is broken and has stopped saying so.
    This question exists because the stranded-banner defect was the ABSENCE of a code
    path: nothing was wrong with any line that was written, so no test could fail on it
    and no reviewer looking only at the diff's logic would ask. The countermeasure has
    to be a question, not a test. Phase 4 probe 4 is its manual form: dismiss the
    banner, type one character, watch it return.

Finish with a verdict: **SAFE TO MERGE** or **DO NOT MERGE**, and if the latter,
a numbered fix list ordered by severity.
