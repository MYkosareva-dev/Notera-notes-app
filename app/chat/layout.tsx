import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Chat layout — fence 2 for `/chat` (SPEC rule B3, extended to this segment by US8).
 *
 * Byte-for-byte the same guard as `app/notes/layout.tsx`, and a SEPARATE FILE rather
 * than a shared one. Two reasons, both about the fence being findable:
 *
 * - Hoisting the check into a layout above both segments would mean one file whose
 *   scope is "everything except `/sign-in`" — a route added later would inherit
 *   protection silently, which sounds like a feature until the first route that must
 *   be public inherits it too and the fix is to move the fence rather than to add one.
 * - Rule B3 counts fences PER ROUTE. A reviewer opening `/chat` should find its
 *   redirect in `app/chat/`, not by tracing a parent segment.
 *
 * What it does NOT do is suppress the render. Measured on Next 16.3.1 and recorded in
 * the notes layout: a `redirect()` here sets the status and the Location, but the
 * sibling page still renders into the RSC payload — and layouts do not re-run on a
 * client-side navigation. So this file is not what keeps the model call off an
 * anonymous request; that is fence 1, `lib/chat.ts`, which calls `getUser()` before
 * anything is spent. Here the stake is a page with an empty conversation on it, which
 * is why this guard can be the convenience one.
 */
export default async function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
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
