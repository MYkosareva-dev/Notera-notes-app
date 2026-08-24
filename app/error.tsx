"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { copy } from "@/lib/copy";

/**
 * Root segment error boundary (CLAUDE.md rule 13). The user sees a recoverable
 * screen in the browser — the terminal log is for the developer, never the only
 * signal. Note this is `error.tsx`, not Next's `global-error.tsx`: a throw in
 * the root layout itself is not caught here.
 */
export default function RootError({
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
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 text-center shadow-card">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger"
        >
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">
          {copy.errors.generic}
        </h1>
        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-on-accent shadow-card transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy.common.tryAgain}
        </button>
      </div>
    </main>
  );
}
