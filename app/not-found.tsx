import Link from "next/link";

import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <h1 className="text-base font-medium">{copy.notFound.page}</h1>
        <Link
          href="/notes"
          className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy.common.allNotes}
        </Link>
      </div>
    </main>
  );
}
