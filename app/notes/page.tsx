import { redirect } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { ErrorCard } from "@/components/ErrorCard";
import { Header } from "@/components/Header";
import { NewNoteButton } from "@/components/NewNoteButton";
import { NoteCard } from "@/components/NoteCard";
import { SignOutButton } from "@/components/SignOutButton";
import { copy } from "@/lib/copy";
import { isNotesError, listNotes } from "@/lib/notes";
import { ROUTES } from "@/lib/routes";
import type { NoteView } from "@/lib/types";

/**
 * The notes list (SPEC Block E — /notes). A Server Component: the rows are fetched
 * during render, on the server, through the DAL.
 *
 * The fetch is what makes this page private. `app/notes/layout.tsx` issues the
 * redirect for a visitor without a session, but a layout `redirect()` does not stop
 * this component from rendering (measured on Next 16.3.1) — so what keeps note rows
 * off the wire is `listNotes()` refusing to run without a verified user, every time
 * (CLAUDE.md rule 3, fence 1). The redirect below is this page's own answer to that
 * refusal, not a second gate.
 *
 * No tag filter yet: `TagFilter` and the `?tag=` query are Phase 6 (SPEC US5).
 */
export default async function NotesPage() {
  let notes: NoteView[] | null = null;

  try {
    notes = await listNotes();
  } catch (error) {
    if (isNotesError(error) && error.failure === "sessionExpired") {
      // Thrown out of the catch, not swallowed by it: redirect() works by throwing.
      redirect(ROUTES.signIn);
    }
    // Anything else is a load failure, and the user sees it in the browser rather
    // than only in the terminal (CLAUDE.md rule 13). `notes` stays null.
  }

  return (
    <>
      <Header
        actions={
          <>
            <NewNoteButton />
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {notes === null ? (
          <ErrorCard title={copy.notes.loadError} />
        ) : notes.length === 0 ? (
          <EmptyState
            title={copy.notes.empty.title}
            description={copy.notes.empty.description}
            action={<NewNoteButton />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
