import { EmptyState } from "@/components/EmptyState";
import { Header } from "@/components/Header";
import { SignOutButton } from "@/components/SignOutButton";
import { copy } from "@/lib/copy";

/**
 * Notes list. Phase 3 adds the Sign out control to the Header; the fetch, the
 * card grid, the tag filter, the New note action and the loading/error states
 * arrive in Phase 4. The signed-in check is not here — it is the layout's job
 * (app/notes/layout.tsx), so every route in this segment inherits it.
 */
export default function NotesPage() {
  return (
    <>
      <Header actions={<SignOutButton />} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <EmptyState
          title={copy.notes.empty.title}
          description={copy.notes.empty.description}
        />
      </main>
    </>
  );
}
