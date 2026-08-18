import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Session-refresh helper for the request interceptor.
 *
 * `updateSession` is not exported by @supabase/ssr — it is the name the docs give
 * to this helper, which holds the body of the interceptor so the entry file stays
 * a two-liner (docs/supabase-ssr-nextjs-app-router.md).
 *
 * What it is for: Server Components cannot write cookies, so something that runs
 * before rendering has to refresh the auth cookie. That is this. It is NOT the
 * access gate (CLAUDE.md rule 3, fence 3) — the authoritative gate is
 * `lib/notes.ts` calling `getUser()` on every operation, with
 * `app/notes/layout.tsx` as fence 2. An interceptor can be bypassed entirely by
 * invoking a Server Action directly, so no authorization decision may live here.
 *
 * Phase 3 wires the entry file (`proxy.ts` — Next 16's rename of
 * `middleware.ts`) and adds the cheap early redirects to this helper.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        // Supabase passes no-store headers alongside refreshed auth cookies; a
        // cached Set-Cookie would hand one user's session to another.
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // Nothing may run between createServerClient and getUser(): the call is what
  // triggers the token refresh, and therefore the setAll cookie write above.
  // Removing it, or delaying it, produces the random-logout bug the Supabase docs
  // warn about. The returned user is deliberately unused in this phase — the
  // refresh is the whole job here, and the access decision belongs to the DAL.
  // (`getUser()`, never `getSession()`: CLAUDE.md rule 2.)
  await supabase.auth.getUser();

  // Return this response object as-is. Building a fresh NextResponse here — or
  // dropping the cookies it carries — desynchronizes browser and server and ends
  // the session early.
  return supabaseResponse;
}
