import { copy } from "@/lib/copy";

const CARD_SKELETON_COUNT = 6; // SPEC Block E: 6 skeleton cards on /notes
const EDITOR_LINE_COUNT = 8; // SPEC Block E: title bar + 8 text lines

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

export function NoteCardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      <Bar className="h-4 w-2/3" />
      <div className="mt-3 space-y-2">
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-5/6" />
      </div>
      <div className="mt-4 flex gap-2">
        <Bar className="h-5 w-16" />
        <Bar className="h-5 w-12" />
      </div>
    </div>
  );
}

/** Loading state for the notes list (SPEC Block E: 1 column at 375, 3 at 1280). */
export function NotesGridSkeleton() {
  return (
    <div role="status" aria-label={copy.common.loading}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: CARD_SKELETON_COUNT }, (_, index) => (
          <NoteCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/** Loading state for the note editor (SPEC Block E). */
export function NoteEditorSkeleton() {
  return (
    <div role="status" aria-label={copy.common.loading}>
      <Bar className="h-8 w-3/4" />
      <div className="mt-6 space-y-3">
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
