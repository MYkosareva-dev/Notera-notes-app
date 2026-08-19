import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * The request interceptor. `proxy.ts` is Next 16's name for what used to be
 * `middleware.ts` — same slot, same one-function contract, and it always runs on
 * the Node.js runtime. The name was adopted at the Phase 1 gate; CLAUDE.md rule 3,
 * SPEC rule B3 and .claude/commands/review-auth.md item 8 were updated with it.
 *
 * Its whole job is fence 3 of rule B3: refresh the auth cookie (Server Components
 * cannot write cookies) and take the cheap early redirects. It is NEVER the gate —
 * a Server Action can be invoked without ever passing through here. The
 * authoritative fences are `lib/notes.ts` (Phase 4) and `app/notes/layout.tsx`.
 *
 * The body lives in lib/supabase/proxy.ts so this file stays a two-liner.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Everything except static assets — the auth cookie has to be refreshed on
  // document and RSC requests alike, and skipping assets keeps the Auth
  // round-trip off requests that carry no session decision.
  matcher: [
    // The literal dot is written `[.]`, not an escape. A backslash escape has to
    // survive TWO layers here — the TS string literal and then the regex — and a
    // single backslash silently collapses to "." (any character), which is how
    // paths like /notes/axsvg were excluded from this interceptor by accident.
    // A character class cannot be mis-escaped, so it stays correct under edits.
    "/((?!_next/static|_next/image|favicon[.]ico|.*[.](?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
