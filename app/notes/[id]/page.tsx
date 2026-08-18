import Link from "next/link";

import { NoteEditorSkeleton } from "@/components/Skeletons";
import { copy } from "@/lib/copy";

/**
 * Note editor. Phase 1 renders the narrow column, the back link and the SPEC
 * loading skeleton — the route param is deliberately unread: fetching a note
 * (through the `lib/notes.ts` DAL), the local-state editor with its 300 ms
 * debounce and the delete flow all belong to Phase 4.
 */
export default function NotePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href="/notes"
        className="text-sm text-text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {copy.common.allNotes}
      </Link>
      <div className="mt-6">
        <NoteEditorSkeleton />
      </div>
      <p className="mt-6 text-sm text-text-muted">
        {copy.placeholder.comingSoon}
      </p>
    </main>
  );
}
