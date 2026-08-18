import Link from "next/link";

import { copy } from "@/lib/copy";

export default function NoteNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 text-center">
      <p className="text-base font-medium">{copy.notFound.note}</p>
      <Link
        href="/notes"
        className="mt-4 text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {copy.common.allNotes}
      </Link>
    </main>
  );
}
