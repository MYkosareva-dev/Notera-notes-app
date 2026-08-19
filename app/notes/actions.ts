"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as notes from "@/lib/notes";
import { ROUTES, notePath } from "@/lib/routes";
import type { ActionResult, NoteFailure, NotePatch } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace Server Actions — the only write path in the app (SPEC rule B1).
 *
 * Two rules shape every function below:
 *
 * 1. **No table access here.** Every one of them calls `lib/notes.ts`, imported as
 *    `notes.*` so a reviewer can see at a glance that nothing queries Postgres
 *    directly (CLAUDE.md rule 3b). The DAL derives the owner from `getUser()`, so
 *    none of these actions has a user-id parameter to be tricked with — the id of a
 *    note may come from the client, its owner never does.
 * 2. **Every export here is a public POST endpoint.** Not "a function the editor
 *    calls": anyone can invoke it with any payload, so arguments are narrowed at
 *    runtime rather than trusted because TypeScript typed them.
 *
 * Failures come back as a discriminated `ActionResult` instead of a message,
 * because the three save failures SPEC rule B8 and edge case G-1 describe need
 * three different behaviours from the editor. The copy for each stays in the
 * client (lib/copy.ts, rule 10); only the reason travels.
 */

/** Anything unexpected is reported as retryable — never as a lost edit (rule B8). */
function failureOf(error: unknown, operation: string): NoteFailure {
  if (notes.isNotesError(error)) {
    return error.failure;
  }
  // Name and message only. An error object from this layer can carry a request payload,
  // and a payload here is the user's note text.
  console.error(
    `[notes/${operation}] unexpected failure`,
    error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error },
  );
  return "unavailable";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function createNote(): Promise<ActionResult> {
  let id: string;

  try {
    id = await notes.createNote();
  } catch (error) {
    return { ok: false, failure: failureOf(error, "createNote") };
  }

  // Outside the try: redirect() works by throwing, so a catch would swallow the
  // navigation and report a failed create for a note that exists.
  revalidatePath(ROUTES.notes);
  redirect(notePath(id));
}

/**
 * The editor's autosave target (SPEC rule B2). Called on a 300 ms debounce with a
 * 5 s maxWait, and once more on unmount if anything is still pending — so it must
 * stay cheap and must never throw at the client: `NoteEditor` keeps the user's text
 * in local state and decides what to do from the failure it gets back.
 */
export async function saveNote(id: string, patch: NotePatch): Promise<ActionResult> {
  if (!isNonEmptyString(id)) {
    return { ok: false, failure: "notFound" };
  }

  // Narrowed, not cast: `patch` is whatever the POST body contained.
  const changes: NotePatch = {};
  if (typeof patch?.title === "string") {
    changes.title = patch.title;
  }
  if (typeof patch?.content === "string") {
    changes.content = patch.content;
  }

  try {
    await notes.updateNote(id, changes);
  } catch (error) {
    return { ok: false, failure: failureOf(error, "saveNote") };
  }

  // The LIST only. Revalidating this note's own route as well would force a server
  // re-render of /notes/[id] on every autosave — an extra getUser() plus a getNote(),
  // whose payload the editor discards, because its text is local state after mount
  // (rule B2). Rule B1 asks for revalidatePath, not for revalidating a route that
  // displays nothing the write changed.
  revalidatePath(ROUTES.notes);
  return { ok: true };
}

/**
 * Delete (SPEC US4). Returns instead of redirecting: the caller has to show the
 * "Note deleted." toast, and a Server Action that redirects never returns its
 * result to the client — the toast would be a guess made before the row was gone.
 * The navigation happens client-side once this resolves; it is a courtesy, not a
 * guard, and the workspace stays protected by the three fences either way.
 */
export async function deleteNote(id: string): Promise<ActionResult> {
  if (!isNonEmptyString(id)) {
    return { ok: false, failure: "notFound" };
  }

  try {
    await notes.deleteNote(id);
  } catch (error) {
    return { ok: false, failure: failureOf(error, "deleteNote") };
  }

  // The list loses a card. The note's own route is deliberately not revalidated: there
  // is no row behind it any more, so re-rendering it would only produce the not-found
  // screen for a client that is already leaving.
  revalidatePath(ROUTES.notes);
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();

  // Clears the session on the Auth server and deletes the cookies through the
  // same setAll the refresh path uses. supabase-js returns errors rather than
  // throwing, so the error is destructured and logged (CLAUDE.md rule 13 —
  // developer-visible), even though the user's path does not branch on it.
  //
  // Default scope is 'global' — the session ends on all of this user's devices,
  // the right default for a private notes app. SPEC asks for nothing narrower.
  const { error } = await supabase.auth.signOut();

  // Logged, never returned to the caller, and the redirect happens either way.
  // Reason: by the time signOut() reports an error the LOCAL session is already
  // gone on every path — auth-js either removed it itself before returning the
  // error (GoTrueClient `_signOut`, non-401/403/404 API errors) or the failed
  // refresh that produced the error removed it first. Returning the error would
  // leave the user looking at the workspace, with the cached signed-in render
  // still valid, while they are in fact signed out. Fail closed: revalidate and
  // send them to /sign-in, which is the truthful state.
  if (error) {
    console.error("[signOut] failed", { status: error.status, code: error.code });
  }

  // Without this, a back-navigation can serve the signed-in user's cached notes
  // list to whoever is now at the keyboard — the worst bug this app could have.
  revalidatePath(ROUTES.home, "layout");
  redirect(ROUTES.signIn);
}
