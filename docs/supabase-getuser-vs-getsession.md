Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/_partials/auth_methods.mdx

# supabase.auth.getUser() vs getSession() — server-side usage

Fetched via Context7 from `/supabase/supabase` and `/supabase/ssr`.
Content below is pasted as returned. Annotations are ours.

> **ANNOTATION (applies to this whole file):** CLAUDE.md rules 1–5 override anything in
> these docs. In particular **rule 2**: the session is verified on the SERVER before any
> protected page loads, and *on the server the only valid check is
> `supabase.auth.getUser()`*. `getSession()` does not validate the token — using it for
> any access decision is prohibited in this project. That holds even where the official
> docs suggest an alternative.

---

## Summary of the methods > getSession

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/_partials/auth_methods.mdx

`getSession` when you need the raw session (the access token, refresh token, and expiry). For example to forward the access token to another service. The session is loaded directly from local storage and isn't re-validated against the Auth server, so the embedded user object shouldn't be trusted on its own when storage is shared with the client (cookies, request headers). To verify identity, validate the access token with `getClaims`, or call `getUser` for a fresh, server-confirmed user record.

> **ANNOTATION — this is the core reason for rule 2.** "Loaded directly from local
> storage and isn't re-validated against the Auth server" is the whole problem: in a
> cookie-based SSR app the storage *is* client-controlled, so `session.user` is
> unverified request input. Notera never forwards an access token anywhere, so there is
> **no legitimate use of `getSession()` in this codebase at all**. If you find yourself
> reaching for it, the answer is `getUser()`.

---

## Main App Component (src/App.jsx)

Source: https://github.com/supabase/supabase/blob/master/examples/user-management/react-user-management/README.md

This component uses the [`getUser()`](https://supabase.com/docs/reference/javascript/auth-getuser) method instead of `getSession()`. The `getUser()` method: - Performs a network request to the Supabase Auth server - Validates the current session on the server side - Returns the most up-to-date user information - Is more reliable than reading from local storage

> **ANNOTATION:** This is the behavior rule 2 depends on — a real round-trip to the Auth
> server that validates the token. The cost is one network call per check. Accept it:
> `lib/notes.ts` calls `getUser()` on **every** operation (rule 3, fence 1), and that is
> deliberate, not an optimization target. Do not "cache" the user in a module-level
> variable — module scope is shared across requests on the server and would leak one
> user's identity into another user's request.

---

## Server-side token verification: getClaims vs getUser

Source: https://github.com/supabase/supabase/blob/master/examples/auth/sveltekit-full/src/hooks.server.ts

SvelteKit hooks example showing best practice for server-side token verification. Use getClaims() for local JWT signature verification (no network round-trip) and getUser() only when the canonical server-validated user record is needed (e.g., after password changes).

```typescript
const authGuard: Handle = async ({ event, resolve }) => {
  /**
   * `getClaims` validates the JWT signature locally (against the project's
   * asymmetric signing keys) without an extra round-trip to the Auth server.
   * Use this for route protection. Use `getUser()` only when you need the
   * canonical server-validated user record (e.g., after password changes).
   */
  const { data: claimsData } = await event.locals.supabase.auth.getClaims()
  event.locals.claims = claimsData?.claims ?? null

  if (!event.locals.claims && event.url.pathname.startsWith('/private')) {
    redirect(303, '/auth')
  }

  if (event.locals.claims && event.url.pathname === '/auth') {
    redirect(303, '/private')
  }

  return resolve(event)
}
```

> **ANNOTATION — DO NOT ADOPT `getClaims()` IN THIS PROJECT.** This is genuinely current
> Supabase advice, and it is genuinely *not* what rule 2 permits. Note the difference
> from `getSession()`: `getClaims()` is a real cryptographic verification (local JWT
> signature check against the project's asymmetric signing keys), so it is *not* the
> unsafe pattern — it is a faster-but-different one. It still differs from `getUser()` in
> ways that matter here:
> - it verifies a **signature and expiry**, not current account state, so a user deleted
>   or banned seconds ago still passes until the token expires;
> - it depends on the project having asymmetric (ECC/RSA) signing keys enabled — on a
>   legacy HS256 shared-secret project it falls back to a network call anyway;
> - rule 2 names exactly one valid server-side check, and it is `getUser()`.
>
> **If `getClaims()` ever becomes desirable for this project, it is an owner decision**
> and it requires editing CLAUDE.md rule 2 first. Do not introduce it unilaterally.

---

## Summary of the methods > In summary

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/_partials/auth_methods.mdx

In summary: use `getClaims` to verify identity (typically for protecting pages and data), `getUser` when you need an up-to-date user record from the Auth server, and `getSession` when you need the access or refresh token directly, but don't rely on the user object it returns for authorization decisions.

> **ANNOTATION — mapping this three-way summary onto our rules:**
> | Doc says | Notera does |
> | --- | --- |
> | `getClaims` to protect pages/data | **`getUser()`** — rule 2 |
> | `getUser` for a fresh user record | `getUser()` — same call, used for both jobs |
> | `getSession` to get raw tokens | never; we forward no tokens |
>
> The last clause — "don't rely on the user object it returns for authorization
> decisions" — is the one line of this summary that maps to our rules unchanged.

---

## `getSession` for access token retrieval

Source: https://github.com/supabase/supabase/blob/master/packages/common/auth.tsx

Shows the recommended pattern: `getSession()` is used (not `getUser()`) to retrieve the access token, because it also refreshes the token if needed and is faster/lighter than `getUser()`. This illustrates the `getUser` vs `getSession` distinction in the context of session management.

```typescript
/**
 * Gets a current access token.
 *
 * Calls getSession, which will refresh the token if needed.
 */
export async function getAccessToken() {
  // ignore if server-side
  if (typeof window === 'undefined') return undefined

  const {
    data: { session },
    error,
  } = await gotrueClient.getSession()

  return session?.access_token
}
```

> **ANNOTATION — read the guard, not the headline.** Context7 labels this "the
> recommended pattern", which is misleading out of context. Look at line 2 of the body:
> `if (typeof window === 'undefined') return undefined` — this is **browser-only code**
> from Supabase's own internal dashboard, and it retrieves a *token to forward*, not an
> identity to authorize. It is not a server-side auth pattern and not a
> `getUser()`-is-too-slow argument. Notera has no equivalent need.
>
> (Note also that the returned snippet omits the `throw error` that the original file has
> after destructuring `error` — under `noUnusedLocals` (rule 11 / our tsconfig) copying it
> as printed would not even compile. Another reason not to copy doc snippets verbatim.)

---

## Initialize Supabase in Next.js Server Action

Source: https://github.com/supabase/ssr/blob/main/_autodocs/common-patterns.md

Utilize the next/headers cookie store to manage authentication state within server actions.

```typescript
// app/actions.ts
'use server'

import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getCurrentUser() {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(cookieStore.toString());
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

> **ANNOTATION:** Correct method (`getUser()`), but note `const cookieStore = cookies()`
> **without `await`** — on current Next.js `cookies()` is async and must be awaited (see
> the canonical server-client snippet in
> [supabase-ssr-nextjs-app-router.md](supabase-ssr-nextjs-app-router.md)). Also, no
> `setAll` is supplied here, so this client cannot write a refreshed cookie — fine for a
> read-only call that runs behind middleware refresh, but do not use this variant as our
> shared `createClient`.

---

## Protect Server Actions

Source: https://github.com/supabase/ssr/blob/main/_autodocs/common-patterns.md

Secures Next.js server actions by verifying the user session before executing sensitive operations.

```typescript
// app/actions.ts
'use server'

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function updateProfile(formData: FormData) {
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const email = formData.get('email') as string;
  const { data, error } = await supabase.auth.updateUser({ email });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
```

> **ANNOTATION — this is the pattern rule 3b is about.** Every Server Action is a
> publicly callable endpoint, so each one re-derives the user with `getUser()` and
> refuses to run without one. Two adaptations for Notera:
> 1. The check belongs in **`lib/notes.ts`** (marked `server-only`), not repeated inline
>    per action — the DAL is the authoritative gate and it derives `user.id` itself. A
>    Server Action must never accept a user id from the client (rule 3b).
> 2. The action derives `email` from `formData` but takes **`user.id` from `getUser()`**,
>    never from the payload. Same discipline for every notes mutation: the note id may
>    come from the client, the owner id never does — and the query still carries
>    `.eq('user_id', user.id)` (rule 7).
