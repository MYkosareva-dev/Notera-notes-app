import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for the browser — for client components that genuinely need
 * one. It has no caller yet; do not add one without a real need.
 *
 * `createBrowserClient` stores the session in cookies, which is the whole point
 * of @supabase/ssr and what lets the server verify it. Pass NO `storage` option:
 * plain supabase-js defaults to browser web storage (forbidden by rule 6) and the
 * hand-rolled `document.cookie` adapter in the 2023 blog snippet is obsolete (see
 * docs/supabase-ssr-nextjs-app-router.md).
 *
 * Named `createBrowserSupabase`, not `createClient` as in the Supabase docs, on
 * purpose: the server factory keeps the docs name and nearly all the call sites.
 * Two identically named exports across the server/browser boundary would let a
 * stray auto-import type-check clean — `await` on a non-thenable is legal TS —
 * and off-browser this client reads an empty cookie jar, so the mistake surfaces
 * as a spurious "signed out" redirect rather than an error.
 *
 * This client must never touch the `notes` table. All notes data access goes
 * through the server-only DAL `lib/notes.ts` (CLAUDE.md rule 3b), and access
 * decisions are made on the server with `getUser()` (rule 2) — never here.
 */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
