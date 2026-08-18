Source: https://github.com/supabase/supabase/blob/master/examples/auth/nextjs-full/app/login/actions.ts

# signInWithPassword and signOut

Fetched via Context7 from `/supabase/supabase` and `/supabase/ssr`.
Content below is pasted as returned. Annotations are ours.

> **ANNOTATION (applies to this whole file):** CLAUDE.md rules 1–5 override anything in
> these docs. Especially **rule 1**: Supabase Auth handles all sign-in and session
> handling — no custom password handling of any kind, no hashing, no comparison, no
> homemade tokens. The only password code in this project is the string handed to
> `signInWithPassword`.

---

## signIn & signUp Server Actions

Source: https://github.com/supabase/supabase/blob/master/examples/auth/nextjs-full/app/login/actions.ts

Next.js Server Actions for email/password sign in and sign up using createServerClient with the anon key (no service role). When email confirmation is enabled, signUp returns user without session; when disabled, it returns a valid session.

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect('/error')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signUp(data)

  if (error) {
    redirect('/error')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
```

> **ANNOTATION — `as string` is not allowed here.** The snippet says so itself ("in
> practice, you should validate your inputs"), and under `strict: true` with no `any`
> (and no unchecked casts) we must actually validate: `formData.get()` returns
> `FormDataEntryValue | null`. Narrow with a `typeof x === 'string'` check and return a
> copy-driven error, rather than casting. A Server Action is a public endpoint — the
> payload may be anything (rule 3b).

> **ANNOTATION — `redirect('/error')` loses the reason.** Rule 13 requires errors that
> matter to the user to be *shown in the browser*, and rule 10 requires every
> user-visible string to live in `lib/copy.ts`. So: return the failure to the login form
> and render the message from `copy`, rather than bouncing to a generic error route. Do
> **not** pass Supabase's raw `error.message` to the UI — it varies by provider config
> and can distinguish "wrong password" from "no such user", which is an account-
> enumeration leak. Map it to our own copy string.

> **ANNOTATION — `revalidatePath('/', 'layout')` then `redirect()` is the right order.**
> Both must be called *outside* any `try/catch`: `redirect()` works by throwing, so a
> surrounding `catch` swallows the navigation and turns it into a silent no-op.

> **ANNOTATION — sign-up:** whether `signUp` returns a session depends on the project's
> email-confirmation setting, as the description notes. Check SPEC.md for whether Notera
> has a sign-up flow this sprint before building one, and whether email confirmation is
> on — the two produce different post-submit copy. Follow SPEC.md; do not invent the
> flow.

> **ANNOTATION — no service-role key.** The description explicitly notes this example
> uses the anon key. That matches rule 4, which is absolute for this repo.

---

## signOut Server Action

Source: https://github.com/supabase/supabase/blob/master/examples/auth/nextjs-full/components/AuthButton.tsx

Inline 'use server' function that signs out the user and redirects to /login. Invoked via a form action in a Server Component.

```typescript
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function AuthButton() {
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  const signOut = async () => {
    'use server'

    const supabase = await createClient()
    await supabase.auth.signOut()
    return redirect('/login')
  }

  return claims ? (
    <div className="flex items-center gap-4">
      Hey, {claims.email}!
      <form action={signOut}>
        <button className="py-2 px-4 rounded-md no-underline bg-btn-background hover:bg-btn-background-hover">
          Logout
        </button>
      </form>
    </div>
  ) : (
    <Link
      href="/login"
      className="py-2 px-3 flex rounded-md no-underline bg-btn-background hover:bg-btn-background-hover"
    >
      Login
    </Link>
  )
}
```

> **ANNOTATION — the `signOut()` call and the `<form action={...}>` wiring are the parts
> to copy.** Sign-out must be a POST via a form action, not a `<Link>` or a GET route —
> a GET logout can be triggered by any third-party page or prefetch.

> **ANNOTATION — replace `getClaims()` with `getUser()`.** Rule 2: on the server the only
> valid check is `supabase.auth.getUser()`. See
> [supabase-getuser-vs-getsession.md](supabase-getuser-vs-getsession.md) for why we do
> not adopt `getClaims()` even though current docs recommend it.

> **ANNOTATION — `Hey, {claims.email}!` breaks two rules.** (a) The literal string must
> live in `lib/copy.ts` (rule 10). (b) Do not build the greeting from a hardcoded address
> or embed any address in code (rule 5) — the email here comes from the verified user
> record at runtime, which is fine, but the *surrounding copy* is not. Check SPEC.md for
> the actual header copy before writing any of it.

> **ANNOTATION — `revalidatePath` after sign-out.** This snippet omits it. Add
> `revalidatePath('/', 'layout')` before redirecting so cached Server Component output
> rendered for the signed-in user is dropped. Otherwise a back-navigation can show a
> stale notes list after logout — which for a private-per-user notes app is the bug that
> matters most.

---

## GoTrueAdminApi.signOut method signature (jwt + optional scope)

Source: https://github.com/supabase/supabase/blob/master/apps/docs/scripts/__snapshots__/build-reference-content.v2.json

Exact method signature extracted from @supabase/auth-js TypeDoc: takes a valid logged-in JWT string and an optional scope ('global' | 'local' | 'others'), returns Promise<{ data: null, error: AuthError | null }>.

```typescript
"@supabase/supabase-js.GoTrueAdminApi.signOut": {
  "name": "@supabase/supabase-js.GoTrueAdminApi.signOut",
  "params": [
    { "name": "jwt", "type": { "type": "intrinsic", "name": "string" }, "comment": { "shortText": "A valid, logged-in JWT." } },
    { "name": "scope", "type": { "type": "union", "subTypes": [{ "type": "literal", "value": "global" }, { "type": "literal", "value": "others" }, { "type": "literal", "value": "local" }] }, "isOptional": true, "comment": { "shortText": "The logout sope." } }
  ],
  "ret": { "type": { "type": "promise", "awaited": { "type": "object", "properties": [{ "name": "data", "type": { "type": "literal", "value": null } }, { "name": "error", "type": { "type": "union", "subTypes": [{ "type": "literal", "value": null }, { "type": "nameOnly", "name": "AuthError" }] } }] } } },
  "comment": { "shortText": "Removes a logged-in session." }
}
```

> **ANNOTATION — WRONG API, note the class name.** This is `GoTrueAdminApi.signOut`,
> reached via `supabase.auth.admin.*`, which **requires the service-role key**. Rule 4
> forbids that key from appearing anywhere in this repo, so `auth.admin` is entirely
> off-limits. The method we call is `supabase.auth.signOut()` — no `jwt` argument; it
> takes the session from the cookie.
>
> The `scope` option (`'global' | 'local' | 'others'`) *does* also exist on the
> non-admin `signOut({ scope })`. Default is `'global'` (ends the session on all of the
> user's devices), which is the safe default for a private notes app. Only pass
> `'local'` if SPEC.md asks for sign-out-this-device-only.

> **ANNOTATION — errors are returned, not thrown.** Both `signInWithPassword` and
> `signOut` return `{ data, error }`; supabase-js does not throw on auth failure. An
> ignored `error` is a silent auth bug. Always destructure and handle it (rule 13).

---

## Catching and Modifying Errors in JavaScript

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/edge-function-500-error-response.mdx

This example uses a `try/catch` block to handle an error, logging a custom message while still including the original error object.

```js
try {
  // induce reference error
  const a = unitialized_var // ReferenceError...
} catch (error) {
  console.error('custom error message...', error) // modifying the original error message
}
```

> **ANNOTATION:** `console.error` alone does not satisfy rule 13 — a terminal log is
> invisible to the user. Log for the developer *and* surface a copy string in the
> browser (`app/error.tsx`, or inline form state for a recoverable failure like a bad
> password). Never `console.error` an object that could contain a token or password.
