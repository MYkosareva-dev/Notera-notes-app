import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

const REFRESH_TOKEN_GRANT = "grant_type=refresh_token";

function requestedUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/**
 * The client's fetch, with exactly one call declined: the token-rotation POST.
 *
 * WHY THIS EXISTS — the bug it fixes was reproducible and invisible under the
 * default 1h token TTL. auth-js treats a session as expired 90s before its real
 * expiry (EXPIRY_MARGIN_MS), so any `getUser()` inside that window refreshes.
 * Refreshing rotates the refresh token: the old one is spent server-side and the
 * new pair must reach the browser. A Server Component cannot write cookies, so
 * the write throws and is swallowed below — the rotation is lost while remaining
 * spent. The browser keeps a dead refresh token, and the next request outside
 * Supabase's 10s reuse interval fails with "Already Used"; auth-js then deletes
 * the session and the user lands on /sign-in. With a 60s TTL (the BUILD_PHASES
 * probe) every single render hits this; with 3600s it needs an idle user sitting
 * in the last 90s of the hour, which is why normal testing never sees it.
 *
 * So: refreshing is the job of ONE context, `lib/supabase/proxy.ts`, which owns a
 * writable response and builds its own client with a plain fetch. Everything
 * reached through this factory — Server Components, the workspace layout, Server
 * Actions, the Phase 4 DAL — validates the token it was given and never rotates
 * it. Server Actions could persist a rotation, but they never need to: the proxy
 * runs first on every request, action POSTs included.
 *
 * The refusal is a 400 with a JSON body, NOT a thrown error. A thrown fetch
 * failure is an AuthRetryableFetchError, which auth-js retries with exponential
 * backoff for up to 30s (AUTO_REFRESH_TICK_DURATION_MS) — a stalled render, and
 * with a short TTL the access token expires mid-retry and the session dies
 * anyway. A 4xx is a non-retryable AuthApiError, answered at once: auth-js keeps
 * the still-valid session it already has (it only discards one whose access token
 * has genuinely expired) and `getUser()` validates that token against /auth/v1/user
 * as usual. The strings in the body are protocol payload for the SDK, never
 * rendered — user-visible copy still lives only in lib/copy.ts (rule 10).
 */
const fetchWithoutTokenRotation: typeof fetch = (input, init) => {
  if (!requestedUrl(input).includes(REFRESH_TOKEN_GRANT)) {
    return fetch(input, init);
  }

  return Promise.resolve(
    new Response(
      JSON.stringify({
        error: "invalid_grant",
        error_code: "refresh_not_permitted_in_this_context",
        msg: "Token refresh happens in lib/supabase/proxy.ts, the only server context that can put Set-Cookie on the response.",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
  );
};

/**
 * Supabase client for Server Components, Server Actions and the workspace
 * layout — anything that runs on the server inside a request.
 *
 * It reads and validates the session; it never refreshes it (see above).
 *
 * The session lives in COOKIES only, via getAll/setAll. No `storage` adapter is
 * passed: plain supabase-js defaults to browser web storage, which this project
 * forbids for session and note data alike (CLAUDE.md rule 6).
 *
 * A new client per render, never a module-level singleton — a shared client
 * would leak one request's identity into another's (see the annotation in
 * docs/supabase-getuser-vs-getsession.md about caching the user).
 *
 * Callers decide access with `supabase.auth.getUser()` and nothing else;
 * `getSession()` does not validate the token (CLAUDE.md rule 2).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: fetchWithoutTokenRotation },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        // `_headers` is the no-store set (Cache-Control / Expires / Pragma) that
        // must accompany a refreshed auth cookie so no cache can serve one user's
        // session to another. Deliberately unused here: this runtime has no
        // writable response headers, so forwarding them is the interceptor's job
        // (lib/supabase/proxy.ts). Supabase's own server snippet names it
        // `_headers` for the same reason.
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies, so a write that lands during
          // render throws here.
          //
          // What can still reach this catch is a session DELETION: auth-js drops a
          // session whose access token has really expired when a refresh fails.
          // Swallowing that is safe — the cookie stays in the browser and the next
          // request's proxy either refreshes it or redirects — and it is the only
          // remaining case, because this client cannot refresh at all (see
          // fetchWithoutTokenRotation). Earlier this catch also swallowed lost
          // token ROTATIONS, which is what broke session refresh past the TTL.
          //
          // It is NOT safe as a general rule. auth.signOut() clears cookies
          // through this same setAll, and nothing re-attempts a deletion — a
          // swallowed clear would leave a valid access token in the browser while
          // the user believes they are signed out. Server Actions CAN write
          // cookies, so this catch does not fire on the signOut path.
          //
          // Not a general error-handling pattern either: failures the user needs
          // to know about are shown in the browser (CLAUDE.md rule 13).
        }
      },
    },
  });
}
