import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Workspace layout — fence 2 of SPEC rule B3 / CLAUDE.md rule 3.
 *
 * Nothing under /notes renders until the server has a verified user. The check is
 * `getUser()`, which revalidates the token against the Auth server; `getSession()`
 * reads the cookie without validating it and is prohibited for access decisions
 * (rule 2).
 *
 * This guard exists even though proxy.ts also redirects, because the interceptor
 * is not trusted as the gate — it can be bypassed and it is not what stops data
 * from moving. Conversely, this layout is not the last word either: layouts do not
 * re-run on client-side navigation, so Phase 4's `lib/notes.ts` calls getUser() on
 * every operation and stays the authoritative fence.
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
    redirect("/sign-in");
  }

  // No wrapper element: `body` already sets min-h-dvh (app/layout.tsx).
  return <>{children}</>;
}
