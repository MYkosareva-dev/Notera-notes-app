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
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies, so a refresh that lands
          // during render throws here. Swallowing it is only safe because the
          // session-refresh helper (lib/supabase/middleware.ts) writes the
          // refreshed cookie on the next request. This is NOT a general
          // error-handling pattern — failures a user needs to know about are
          // shown in the browser (CLAUDE.md rule 13).
        }
      },
    },
  });
}
