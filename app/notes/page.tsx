import { EmptyState } from "@/components/EmptyState";
import { Header } from "@/components/Header";
import { copy } from "@/lib/copy";

/**
 * Notes list. Phase 1 renders the page shell and the SPEC empty state only —
 * no fetch, no Supabase, no New note action (those arrive in Phase 4, together
 * with the card grid, the tag filter and the loading/error states).
 */
export default function NotesPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <EmptyState
          title={copy.notes.empty.title}
          description={copy.notes.empty.description}
        />
      </main>
    </>
  );
}
