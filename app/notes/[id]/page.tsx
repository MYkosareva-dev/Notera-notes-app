import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NoteEditor } from "@/components/NoteEditor";
import { copy } from "@/lib/copy";
import { getNote, isNotesError } from "@/lib/notes";
import { ROUTES } from "@/lib/routes";
import type { NoteView } from "@/lib/types";

/**
 * The note editor route (SPEC Block E — /notes/[id]).
 *
 * The note is fetched on the SERVER, through the DAL, which scopes the query to the
 * signed-in user. Everything interactive is handed to `<NoteEditor/>`, which holds
 * the text in local state (rule B2).
 *
 * Ownership is not checked here, and that is the design: `getNote()` filters by
 * `user_id` (rule 7) with RLS behind it, so another account's id and a nonexistent
 * id are the same answer — no row — and both land on `not-found.tsx` (SPEC G-14/G-15).
 * A comparison in this file would be a third, weaker copy of a rule the DAL already
 * enforces for every caller.
 */
export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let note: NoteView | null = null;
  try {
    note = await getNote(id);
  } catch (error) {
    if (isNotesError(error) && error.failure === "sessionExpired") {
      // Thrown out of the catch, not swallowed by it: redirect() works by throwing.
      redirect(ROUTES.signIn);
    }
    // Everything else leaves `note` null and lands on not-found below.
  }

  if (note === null) {
    // SPEC Block E: for this screen, a load failure, an unknown id and another
    // account's id are one outcome — the not-found screen, never a half-rendered
    // editor over no data.
    //
    // MEASURED, Next 16.3.1: this renders not-found.tsx with HTTP **200**, not 404,
    // because `app/notes/loading.tsx` puts a Suspense boundary above this page and
    // the shell is flushed — status committed — before the fetch resolves. Isolated
    // on a scratch route: identical page, 404 without a loading boundary anywhere
    // above it, 200 with one. It is inherent, not a quirk to work around: a skeleton
    // means "not fetched yet", a 404 means "fetched, absent", and a status cannot be
    // streamed. SPEC Block E asks for both the skeleton and this screen, and it is
    // the screen (not a status code) that every acceptance box names — so both stay,
    // and the trade-off is recorded in SPEC Block E rather than left to be
    // rediscovered.
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={ROUTES.notes}
        className="text-sm text-text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {copy.common.allNotes}
      </Link>
      <div className="mt-6">
        <NoteEditor note={note} />
      </div>
    </main>
  );
}
