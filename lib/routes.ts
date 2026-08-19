// The app's routes, in one place (CLAUDE.md rule 11 — import constants, never
// redeclare them). SPEC Block A's route table is the source of truth for the set.
//
// Deferred from the Phase 3 review to Phase 4 on purpose: with `/notes/[id]` links,
// the editor's revalidation targets and the delete redirect, the same three paths
// now appear in eight files, and `notePath` gives the one interpolation a name.
//
// NOT marked `server-only`: client components link with these too (NoteCard, the
// editor's back link). There is nothing secret in a path.

export const ROUTES = {
  home: "/",
  signIn: "/sign-in",
  notes: "/notes",
} as const;

/** The editor route for one note. The id comes from the DAL, never from a raw client value. */
export function notePath(id: string): string {
  return `${ROUTES.notes}/${id}`;
}

/** True for `/notes` and everything under it, false for lookalikes (`/notesx`). */
export function isWorkspacePath(pathname: string): boolean {
  return pathname === ROUTES.notes || pathname.startsWith(`${ROUTES.notes}/`);
}
