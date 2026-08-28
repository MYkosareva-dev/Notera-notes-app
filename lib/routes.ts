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
  /**
   * The chat screen (SPEC US8). A SIBLING of `/notes`, not a child of it, and that
   * placement is deliberate: nesting it under `/notes` would put it inside
   * `app/notes/layout.tsx` and make it look protected by that layout, when what
   * actually protects it is its own layout plus `lib/chat.ts`. A separate segment
   * forces both fences to be written out where a reviewer can find them.
   */
  chat: "/chat",
} as const;

/** The editor route for one note. The id comes from the DAL, never from a raw client value. */
export function notePath(id: string): string {
  return `${ROUTES.notes}/${id}`;
}

/** True for a path and everything under it, false for lookalikes (`/notesx`). */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Every path that requires a signed-in user — the set `proxy.ts` takes its cheap
 * early redirect on.
 *
 * It answers for `/chat` as well as `/notes` since SPEC US8, and the rename from
 * `isWorkspacePath` came with that: "workspace" named the notes segment, and a
 * predicate that silently kept the old name while growing a second member is how
 * one of these two routes eventually gets left out. What it does NOT do is become
 * the gate — the redirect it feeds is convenience only (rule B3, fence 3), and each
 * segment owns its own real fences. Adding a path here protects nothing by itself.
 */
export function isProtectedPath(pathname: string): boolean {
  return isUnder(pathname, ROUTES.notes) || isUnder(pathname, ROUTES.chat);
}
