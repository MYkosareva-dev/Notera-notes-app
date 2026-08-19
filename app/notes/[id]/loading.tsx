import { NoteEditorSkeleton } from "@/components/Skeletons";

/** Loading state for the editor route (SPEC Block E: title bar + 8 text lines). */
export default function NoteLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mt-6">
        <NoteEditorSkeleton />
      </div>
    </main>
  );
}
