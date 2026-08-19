"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace Server Actions. Phase 3 adds sign-out only; createNote, updateNote
 * and deleteNote land in Phase 4 and will go through the `lib/notes.ts` DAL
 * rather than touching the notes table here (CLAUDE.md rule 3b).
 */

/** Returned only on failure; success redirects and never resolves to a value. */
export interface SignOutResult {
  error: string;
}

export async function signOut(): Promise<SignOutResult> {
  const supabase = await createClient();

  // Clears the session on the Auth server and deletes the cookies through the
  // same setAll the refresh path uses. supabase-js returns errors rather than
  // throwing, so an ignored `error` here would leave the user signed in while the
  // UI says otherwise (CLAUDE.md rule 13).
  //
  // Default scope is 'global' — the session ends on all of this user's devices,
  // the right default for a private notes app. SPEC asks for nothing narrower.
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[signOut] failed", { status: error.status, code: error.code });
    return { error: copy.errors.generic };
  }

  // Without this, a back-navigation can serve the signed-in user's cached notes
  // list to whoever is now at the keyboard — the worst bug this app could have.
  revalidatePath("/", "layout");
  redirect("/sign-in");
}
