import { Header } from "@/components/Header";
import { SignOutButton } from "@/components/SignOutButton";
import { NotesGridSkeleton } from "@/components/Skeletons";

/**
 * Loading state for `/notes` (SPEC Block E: six skeleton cards). The header keeps
 * its place so the page does not jump when the rows arrive.
 *
 * **New note** is absent on purpose: it would be the one control on screen able to
 * act while the list it acts on is still unknown.
 */
export default function NotesLoading() {
  return (
    <>
      <Header actions={<SignOutButton />} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <NotesGridSkeleton />
      </main>
    </>
  );
}
