import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace layout — fence 2 of SPEC rule B3 / CLAUDE.md rule 3.
 *
 * This layout ISSUES THE REDIRECT for a request without a verified user. The check
 * is `getUser()`, which revalidates the token against the Auth server;
 * `getSession()` reads the cookie without validating it and is prohibited for
 * access decisions (rule 2).
 *
 * What it does NOT do is suppress the render. Measured on Next 16.3.1: a
 * `redirect()` here sets the status and the Location, but the sibling page
 * component still renders into the response's RSC payload. So this file cannot be
 * what keeps note rows off the wire — that is fence 1, `lib/notes.ts`, which calls
 * getUser() on every operation and refuses without a user. Layouts also
 * do not re-run on client-side navigation, which is the second reason fence 1 is
 * the authoritative one.
 *
 * This guard still earns its place: it is the server-side redirect for every route
 * in the segment, present whether or not proxy.ts runs — and the interceptor is
 * never trusted as the gate.
 *
 * `getUser()` is called here directly rather than through a cached wrapper: Next
 * already dedupes identical requests within one render pass, and wrapping it would
 * collapse two independent fences into one.
 */
export default async function NotesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.signIn);
  }

  // No wrapper element: `body` already sets min-h-dvh (app/layout.tsx).
  return <>{children}</>;
}
