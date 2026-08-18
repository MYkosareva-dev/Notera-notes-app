import type { ReactNode } from "react";

/**
 * Workspace layout.
 *
 * PHASE 3 ADDS THE GUARD HERE: this file becomes fence 2 of SPEC rule B3 — a
 * server-side `supabase.auth.getUser()` check that redirects to /sign-in before
 * anything renders. It does not exist yet, and nothing under /notes reads or
 * renders user data yet either, so there is nothing to leak in this phase.
 * The authoritative fence stays `lib/notes.ts` (Phase 2/4), never this layout
 * and never middleware.
 */
export default function NotesLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
