Source: https://github.com/supabase/supabase/blob/master/examples/prompts/nextjs-supabase-auth.md

# @supabase/ssr with Next.js App Router — server client, browser client, middleware session refresh

Fetched via Context7 from `/supabase/supabase` and `/supabase/ssr`.
Content below is pasted as returned. Annotations are ours.

> **ANNOTATION (applies to this whole file):** CLAUDE.md rules 1–5 override anything
> in these docs. Where an example below conflicts with a rule, the rule wins and the
> conflict is called out inline.

---

## Install Supabase SSR package

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/getting-started/tutorials/with-nextjs.mdx

Install the @supabase/ssr package to enable cookie-based session management in Next.js.

```bash
npm install @supabase/ssr
```

---

## Correct Server Client Implementation

Source: https://github.com/supabase/supabase/blob/master/examples/prompts/nextjs-supabase-auth.md

Example of how to correctly implement the Supabase server client using `@supabase/ssr` and `next/headers` for cookie management.

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        }
      }
    }
  )
}
```

> **ANNOTATION:** This is the shape we want for our server client — the session lives
> in **cookies only**, via `getAll`/`setAll`. Do not swap in a custom `storage` adapter
> (see the browser section below) and never put session or note data in
> `localStorage`/`sessionStorage` (CLAUDE.md rule 6).

> **ANNOTATION — key name:** the snippet uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
> (Supabase's newer name for the public key). This project uses the **anon key** under
> whatever name is already declared in `.env.example` — keep those two in sync and do
> not introduce a second name. The **service-role key must never appear anywhere in
> this repo**, and never behind a `NEXT_PUBLIC_*` variable (CLAUDE.md rule 4). The anon
> key is the only key this project needs.

> **ANNOTATION — the empty `catch`:** swallowing the write is correct *only* because
> middleware refreshes the cookie on the next request. It is not an error-handling
> pattern to copy elsewhere; failures that matter to the user must surface in the
> browser (CLAUDE.md rule 13, `app/error.tsx`).

> **ANNOTATION — CORRECTION, measured at the Phase 3 gate.** "The next request will
> refresh it" is not enough, and this snippet as printed has a real failure mode. A
> refresh **rotates** the refresh token: the old one is spent on the Auth server the
> moment the call returns. auth-js considers a session expired `EXPIRY_MARGIN_MS`
> (90s) before its real expiry, so a Server Component's `getUser()` inside that
> window refreshes too — and its cookie write lands in exactly this `catch`. The
> rotated pair is discarded while remaining spent, so the browser keeps a dead
> refresh token; the next request outside the project's refresh-token reuse interval
> (10s by default) gets `refresh_token_already_used`, auth-js deletes the session,
> and the user is bounced to the sign-in page. Reproduced with the installed
> libraries against a mock Auth server: with an access-token TTL below the 90s
> margin it fails on the second reload, every time.
>
> Do not reach for `autoRefreshToken: false` — it is already set. `@supabase/ssr`'s
> `createServerClient` passes it (`createServerClient.js:34`), and it only disables the
> background ticker: `__loadSession` still refreshes on demand whenever the session is
> inside the 90s margin (`GoTrueClient.js:2526-2554`). The config knob that looks like
> the answer is a no-op for this path, which is why the intervention has to be at the
> fetch layer.
>
> Fix in this project: token refresh happens in ONE context on the server — the proxy,
> which owns a writable response — and every client built by `lib/supabase/server.ts` declines
> the `grant_type=refresh_token` call with a non-retryable 4xx, so it validates the
> token it was handed and never rotates it. (Decline with a *response*, not a thrown
> error: a thrown fetch failure is retryable and auth-js re-attempts with backoff for
> up to 30s.) With the default 1h TTL the buggy version looks fine, which is why the
> project keeps the 60s-TTL probe in BUILD_PHASES Phase 3.

---

## Initialize Browser Client

Source: https://github.com/supabase/ssr/blob/main/_autodocs/README.md

Create a Supabase client for browser environments using the createBrowserClient function.

```typescript
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);

// Use like any Supabase client
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
});
```

> **ANNOTATION:** Two corrections for this project.
> 1. **Never hardcode the URL, the key, or an email address.** Read URL and key from
>    `process.env.NEXT_PUBLIC_*`; hardcoded email addresses are banned outright
>    (CLAUDE.md rule 5), including in examples and placeholders.
> 2. `createBrowserClient` already stores the session in cookies — that is the point of
>    `@supabase/ssr`. Use it only where a client component genuinely needs a Supabase
>    client. **All notes data access goes through `lib/notes.ts` on the server**
>    (CLAUDE.md rule 3b), so a browser client must never touch the `notes` table.

---

## Configuring Supabase for Client-side (Browser)

Source: https://github.com/supabase/supabase/blob/master/apps/www/_blog/2023-11-01-supabase-is-now-compatible-with-nextjs-14.mdx

Configures supabase-js to use cookies for session storage when running client-side in the browser, allowing access to user sessions secured with Row Level Security.

```tsx
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storage: {
      getItem: async (key: string) => {
        return parse(document.cookie[key])
      },
      setItem: async (key: string, value: string) => {
        document.cookie = serialize(key, value)
      },
    },
    removeItem: async (key: string) => {
      document.cookie = serialize(key, '', {
        maxAge: 0,
      })
    },
  },
})
```

> **ANNOTATION — DO NOT COPY THIS.** This is a 2023 blog post showing the *manual*,
> pre-`@supabase/ssr` workaround: hand-rolled cookie serialization through
> `document.cookie`. `createBrowserClient` from `@supabase/ssr` replaces all of it.
> A hand-written `storage` adapter is exactly how session data ends up in the wrong
> place — note that the *default* `supabase-js` `storage` is `localStorage`, which
> rule 6 forbids. Use `createBrowserClient` and pass no `storage` option at all.

---

## Correct Supabase Auth Proxy Middleware

Source: https://github.com/supabase/supabase/blob/master/examples/prompts/nextjs-supabase-auth.md

This code snippet demonstrates the correct implementation of a Next.js middleware proxy for Supabase authentication, including `createServerClient` setup, secure cookie handling using `getAll` and `setAll`, user session verification, and redirection logic. It also includes the `config` object for matcher paths.

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
```

> **ANNOTATION — the exported name: SETTLED, this project uses `proxy.ts`.** Next.js
> renamed `middleware.ts` to `proxy.ts`, and the installed Next 16.3.1 reads it:
> `PROXY_FILENAME = 'proxy'` in `next/dist/lib/constants.js`, and the build accepts a
> named `proxy` export or a default export (`next/dist/build/analysis/get-page-static-info.js`),
> with `config.matcher` still honoured. The rename was taken at the Phase 1 gate and
> applied in Phase 3 together with every doc mention — CLAUDE.md rule 3, SPEC.md B3 +
> Block A/F + Block H check 6, and `.claude/commands/review-auth.md` item 8 — per rule 18.
> Do not re-introduce `middleware.ts`; if a future Next version moves the slot again,
> update the same list in the same change.

> **ANNOTATION — two escapes lost in transit.** The matcher above originally arrived
> from Context7 with a single backslash before the extension dot (`.*\.` became
> `.*.`), and `favicon.ico` has an unescaped dot in the upstream snippet too. In a TS
> string a single backslash collapses, so the pattern matches ANY character there and
> silently skips paths like `/notes/axsvg`. Restored above. Our own `proxy.ts` writes
> those dots as `[.]` instead, which cannot be mis-escaped by a later edit.

> **ANNOTATION — this is NOT our access gate.** The docs present this redirect as route
> protection. In this project **middleware is never trusted as the gate** (rule 3): it
> refreshes the session cookie and may do a *cheap early redirect*, nothing more. The
> authoritative gate is `lib/notes.ts` calling `getUser()` on every operation;
> `app/notes/layout.tsx` is the second fence. Do not move an authorization decision
> into middleware just because the doc does — middleware can be bypassed by direct
> Server Action invocation, and every Server Action is a public endpoint (rule 3b).

> **ANNOTATION — keep the `getUser()` call anyway.** Even though we don't trust the
> redirect, this call is what triggers the token refresh and therefore the `setAll`
> cookie write. Removing it — or running code between `createServerClient` and it —
> causes the random-logout bug the inline comments warn about.

> **ANNOTATION — return `supabaseResponse` intact.** The four-step comment is
> load-bearing. Dropping the refreshed cookies desynchronizes browser and server and
> ends the user's session early.

---

## Configure proxy.ts for Next.js Middleware

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/how-to-migrate-from-supabase-auth-helpers-to-ssr-package-5NRunM.mdx

Updates the proxy middleware to handle session refreshing using the SSR package's updateSession utility.

```typescript
// proxy.ts

import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

> **ANNOTATION:** `updateSession` is **not** exported by `@supabase/ssr` — it is a
> helper *you* write, holding the middleware body from the previous snippet. Same
> naming caveat as above: our file is `middleware.ts` exporting `middleware`.

---

## Initialize Server Client in Next.js Middleware (@supabase/ssr autodocs variant)

Source: https://github.com/supabase/ssr/blob/main/_autodocs/README.md

Configure the server client within Next.js middleware to handle cookie management and session refreshing.

```typescript
import { createServerClient, parseCookieHeader } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.cookies.toString());
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    },
  );

  // Refresh session before route handlers
  await supabase.auth.getClaims();

  return response;
}
```

> **ANNOTATION — three divergences from the snippet we should actually follow.**
> 1. It refreshes with `getClaims()`. Rule 2 says the only valid server-side check is
>    `supabase.auth.getUser()`. Use `getUser()` — see
>    [supabase-getuser-vs-getsession.md](supabase-getuser-vs-getsession.md).
> 2. It creates `response` **once**, before the client. The `nextjs-supabase-auth.md`
>    version re-creates it inside `setAll` with `NextResponse.next({ request })` so
>    refreshed cookies reach *both* the incoming request and the outgoing response.
>    Prefer the `nextjs-supabase-auth.md` version — it is the one Supabase maintains as
>    the canonical Next.js pattern.
> 3. `parseCookieHeader(request.cookies.toString())` is the framework-agnostic path. In
>    Next.js, `request.cookies.getAll()` is direct and skips a parse round-trip.

---

## Implement Protected Routes in Next.js Middleware

Source: https://github.com/supabase/ssr/blob/main/_autodocs/common-patterns.md

Uses middleware to intercept requests and verify user sessions against a list of protected paths. Redirects unauthenticated users to the login page.

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_ROUTES = ['/dashboard', '/profile', '/settings'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.cookies.toString());
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    },
  );

  // Refresh session
  const { data } = await supabase.auth.getSession();

  // Check if route is protected
  if (PROTECTED_ROUTES.some(route => request.nextUrl.pathname.startsWith(route))) {
    if (!data.session?.user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}
```

> **ANNOTATION — PROHIBITED PATTERN, two ways over.** This snippet is the exact thing
> rules 2 and 3 forbid:
> 1. It makes an **access decision from `getSession()`** (`data.session?.user`). That
>    user object comes straight out of the cookie and is not revalidated — it is
>    attacker-controlled input. Rule 2: on the server, the only valid check is
>    `supabase.auth.getUser()`.
> 2. It treats **middleware as the gate**. Rule 3: middleware refreshes the cookie and
>    may redirect early; the gate is `lib/notes.ts` (+ `app/notes/layout.tsx`).
>
> Nothing in this snippet should be copied into the project.
