"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

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
      className="rounded-card border border-border bg-surface px-6 py-8 text-center shadow-card"
    >
      <p className="text-base font-medium">{title}</p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
        className="mt-5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {copy.common.tryAgain}
      </button>
    </div>
  );
}
