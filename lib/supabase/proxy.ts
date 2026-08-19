import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Session-refresh helper for the request interceptor (`proxy.ts` at the root —
 * Next 16's rename of `middleware.ts`).
 *
 * THE ONLY PLACE ON THE SERVER THAT MAY REFRESH A TOKEN. Refreshing rotates the
 * refresh token, so the new pair MUST reach the browser or the session dies on the
 * next request; this is the one server context that owns a writable response and
 * can guarantee that. Every client from lib/supabase/server.ts therefore declines
 * the rotation call — see fetchWithoutTokenRotation there for the failure it
 * prevents. Consequently this client keeps the platform `fetch`: do not pass a
 * fetch wrapper here, or nothing refreshes on the server at all.
 *
 * (A browser client refreshes too — createBrowserClient defaults
 * autoRefreshToken to true — and that is fine, because a browser CAN persist the
 * rotated cookies. lib/supabase/client.ts has no caller; see its docblock.)
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
 * The two redirects below are therefore convenience, not protection: they save a
 * render on the common case and keep the address bar honest. Deleting them must
 * leave the workspace just as private — that is the property the real fences own.
 */

const SIGN_IN_PATH = "/sign-in";
const WORKSPACE_PATH = "/notes";

/** True for `/notes` and everything under it, false for lookalikes (`/notesx`). */
function isWorkspacePath(pathname: string): boolean {
  return pathname === WORKSPACE_PATH || pathname.startsWith(`${WORKSPACE_PATH}/`);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Whatever Supabase asks us to send alongside a refreshed cookie — the
  // no-store set (Cache-Control / Expires / Pragma). Kept here as well as on
  // supabaseResponse so a redirect built below can carry them too: a cached
  // Set-Cookie would hand one user's session to another.
  const refreshHeaders: Record<string, string> = {};

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
        Object.entries(headers).forEach(([key, value]) => {
          refreshHeaders[key] = value;
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  // Nothing may run between createServerClient and getUser(): the call is what
  // triggers the token refresh, and therefore the setAll cookie write above.
  // Removing it, or delaying it, produces the random-logout bug the Supabase docs
  // warn about. (`getUser()`, never `getSession()`: CLAUDE.md rule 2. The user
  // object it returns is server-validated, which is why the cheap redirects below
  // are allowed to read it at all — but they are still not the gate.)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Documents and RSC navigations only. NextResponse.redirect answers 307, which
  // preserves the method and the body, so redirecting a POST re-sends it to the
  // target route — and every Server Action is a POST to the page it was called
  // from. A redirected action never returns its result to the client, so Phase 4's
  // autosave could not show SPEC G-1's "Your session expired." banner: the browser
  // would simply navigate away and the user would lose the text they had typed.
  // Non-GET traffic therefore falls through to be answered where it belongs — the
  // DAL refuses without a user and the action returns a structured error.
  const isNavigation = request.method === "GET";

  if (isNavigation && !user && isWorkspacePath(pathname)) {
    return redirectTo(SIGN_IN_PATH, request, supabaseResponse, refreshHeaders);
  }

  if (isNavigation && user && pathname === SIGN_IN_PATH) {
    return redirectTo(WORKSPACE_PATH, request, supabaseResponse, refreshHeaders);
  }

  // Return this response object as-is. Building a fresh NextResponse here — or
  // dropping the cookies it carries — desynchronizes browser and server and ends
  // the session early.
  return supabaseResponse;
}

/**
 * A redirect that keeps the refreshed session.
 *
 * The one hazard in this file: a redirect cannot be `supabaseResponse`, so the
 * cookies (and no-store headers) that the refresh just produced have to be copied
 * onto the new response by hand. Dropping them logs the user out at the very
 * moment their token was renewed. Only Supabase's own cookies and headers are
 * copied — never the whole header set of a `NextResponse.next()`, which carries
 * Next's internal routing headers.
 */
function redirectTo(
  pathname: string,
  request: NextRequest,
  refreshed: NextResponse,
  refreshHeaders: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const response = NextResponse.redirect(url);
  refreshed.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  Object.entries(refreshHeaders).forEach(([key, value]) =>
    response.headers.set(key, value),
  );
  return response;
}
