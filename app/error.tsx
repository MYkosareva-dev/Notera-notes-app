"use client";

import { useEffect } from "react";

import { copy } from "@/lib/copy";

/**
 * Global error boundary (CLAUDE.md rule 13). The user sees a recoverable screen
 * in the browser — the terminal log is for the developer, never the only signal.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <p className="text-base font-medium">{copy.errors.generic}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy.common.tryAgain}
        </button>
      </div>
    </main>
  );
}
