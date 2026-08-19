import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Server Components, Server Actions and the workspace
 * layout — anything that runs on the server inside a request.
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
          // Server Components cannot write cookies, so a write that lands
          // during render throws here. Swallowing it is safe for a token REFRESH
          // only: the session-refresh helper behind proxy.ts re-writes the cookie
          // on the next request.
          //
          // It is NOT safe as a general rule. auth.signOut() clears cookies
          // through this same setAll, and nothing re-attempts a deletion — a
          // swallowed clear would leave a valid access token in the browser while
          // the user believes they are signed out. Server Actions CAN write
          // cookies, so this catch does not fire on that path; Phase 3's signOut()
          // must confirm the cookie is gone rather than trust this comment.
          //
          // Not a general error-handling pattern either: failures the user needs
          // to know about are shown in the browser (CLAUDE.md rule 13).
        }
      },
    },
  });
}
