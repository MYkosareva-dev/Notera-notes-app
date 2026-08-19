import { NoteEditorSkeleton } from "@/components/Skeletons";

/** Loading state for the editor route (SPEC Block E: title bar + 8 text lines). */
export default function NoteLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      {/* Placeholders for the two things NoteEditor renders above the sheet, so it
          lands at the height it will occupy once loaded. Both mirror a real element
          and must move with it:
            h-7           the back link in page.tsx — py-1 + a text-sm line box.
            mt-4          that link's margin, from page.tsx.
            h-[3.3125rem] the sticky status row — py-2.5 around a 32 px Delete
                          button, plus its 1 px border-b. 53 px.
            mb-4          the status row's own bottom margin.
          The mb-4 and the border's 1 px were missing until the Phase 5 review: the
          sheet sat 17 px high and dropped on handover, which is the jump this
          placeholder exists to prevent. */}
      <div className="h-7" />
      <div className="mt-4 mb-4 h-[3.3125rem]" />
      <NoteEditorSkeleton />
    </main>
  );
}
