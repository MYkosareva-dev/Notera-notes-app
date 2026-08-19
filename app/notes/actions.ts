"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Workspace Server Actions. Phase 3 adds sign-out only; createNote, updateNote
 * and deleteNote land in Phase 4 and will go through the `lib/notes.ts` DAL
 * rather than touching the notes table here (CLAUDE.md rule 3b).
 */

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
  revalidatePath("/", "layout");
  redirect("/sign-in");
}
