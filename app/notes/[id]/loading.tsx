import { NoteEditorSkeleton } from "@/components/Skeletons";

/** Loading state for the editor route (SPEC Block E: title bar + 8 text lines). */
export default function NoteLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      {/* A placeholder for the back link and the sticky status row above the sheet,
          so the card lands at the same height it will occupy once loaded. */}
      <div className="h-7" />
      <div className="mt-4 h-[3.25rem]" />
      <NoteEditorSkeleton />
    </main>
  );
}
