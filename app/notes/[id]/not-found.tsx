import Link from "next/link";

import { copy } from "@/lib/copy";

export default function NoteNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 text-center">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold tracking-tight">
          {copy.notFound.note}
        </h1>
        <Link
          href="/notes"
          className="mt-6 inline-flex items-center rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-text/15 hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy.common.allNotes}
        </Link>
      </div>
    </main>
  );
}
