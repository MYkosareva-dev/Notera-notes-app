"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { copy } from "@/lib/copy";

/**
 * The full-width inline error card with a **Try again** button (SPEC Block E — the
 * /notes error state).
 *
 * "Try again" is `router.refresh()`: it re-runs the Server Component that failed, so
 * the retry is a real re-fetch through the DAL and not a client-side reset of
 * something that was never loaded. A client component only for that button —
 * the failure itself is detected on the server.
 *
 * Presentational otherwise: the caller passes the message, so this file has no idea
 * what failed to load.
 */
export function ErrorCard({ title }: { title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className="rounded-card border border-danger/25 bg-surface px-6 py-12 text-center shadow-card"
    >
      {/* The only decoration on this screen, and it is the state itself: a failure
          the user has to notice before the retry button means anything. */}
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger"
      >
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
        className="mt-6 rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-text/15 hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {copy.common.tryAgain}
      </button>
    </div>
  );
}
