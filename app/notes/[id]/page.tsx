import Link from "next/link";

import { copy } from "@/lib/copy";

/**
 * Note editor. Phase 1 renders the narrow column and the back link only — the
 * route param is deliberately unread: fetching a note (through the
 * `lib/notes.ts` DAL), the local-state editor with its 300 ms debounce and the
 * delete flow all belong to Phase 4, which also mounts `NoteEditorSkeleton` as
 * this route's real loading fallback.
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
      <p className="mt-6 text-sm text-text-muted">
        {copy.placeholder.comingSoon}
      </p>
    </main>
  );
}
