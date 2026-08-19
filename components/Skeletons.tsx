import { copy } from "@/lib/copy";

const CARD_SKELETON_COUNT = 6; // SPEC Block E: 6 skeleton cards on /notes
const EDITOR_LINE_COUNT = 8; // SPEC Block E: title bar + 8 text lines

/** One placeholder line. Rounded-full and tinted below the border colour, so a
    loading grid reads as paper waiting to be printed rather than as a wireframe. */
function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-border/80 ${className}`} />;
}

export function NoteCardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <Bar className="h-4 w-2/3" />
      <div className="mt-4 space-y-2.5">
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-5/6" />
      </div>
      {/* No tag chips: NoteCard renders no tags until Phase 6, and a skeleton that
          promises a row the loaded card does not have makes every list load end in a
          visible jump. The chips come back with the tags. */}
      <Bar className="mt-6 h-3 w-20" />
    </div>
  );
}

/** Loading state for the notes list (SPEC Block E: 1 column at 375, 3 at 1280). */
export function NotesGridSkeleton() {
  return (
    <div role="status" aria-label={copy.common.loading}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: CARD_SKELETON_COUNT }, (_, index) => (
          <NoteCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/**
 * Loading state for the note editor (SPEC Block E).
 *
 * It mirrors the loaded editor's shape — the same card, the same title zone above
 * the same hairline — so the skeleton hands over to the real thing without the
 * page rearranging itself underneath the reader.
 */
export function NoteEditorSkeleton() {
  return (
    <div
      role="status"
      aria-label={copy.common.loading}
      className="rounded-card border border-border bg-surface shadow-card"
    >
      <div className="px-5 pb-5 pt-5 sm:px-7 sm:pt-7">
        <Bar className="h-7 w-3/5" />
      </div>
      <div className="mx-5 border-t border-border sm:mx-7" />
      <div className="space-y-3.5 px-5 py-6 sm:px-7">
        {Array.from({ length: EDITOR_LINE_COUNT }, (_, index) => (
          <Bar
            key={index}
            className={index % 3 === 2 ? "h-3 w-4/6" : "h-3 w-full"}
          />
        ))}
      </div>
    </div>
  );
}
