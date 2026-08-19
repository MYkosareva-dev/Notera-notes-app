"use client";

import { useTransition } from "react";
import type { FormEvent } from "react";

import { signOut } from "@/app/notes/actions";
import { copy } from "@/lib/copy";

/**
 * Sign-out control for the Header (SPEC Block E — /notes).
 *
 * A submit, never a link: invoking a Server Action is always a POST, so nothing a
 * third party can trigger — an `<img>` or a prefetch — can sign the user out.
 * A client component only for the pending state; the sign-out itself happens
 * entirely in the `signOut` Server Action, which always redirects to /sign-in and
 * therefore returns nothing for this component to handle.
 */
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      // Swallowed deliberately, and only for the transport case: SPEC Block E's
      // actions table says a failed sign-out shows the user nothing, because the
      // action redirects on every path it can reach. Offline it cannot reach any of
      // them — the session is still live and the user stays where they are. What this
      // catch buys is that the failure is logged rather than surfacing as an unhandled
      // rejection (and, in dev, as an error overlay). Raised at the Phase 4 gate and
      // decided there: silence covers the offline case as well, recorded in SPEC Block E's
      // actions table. A visible notice is a post-sprint candidate and would change that
      // row first — do not add one here on its own.
      await signOut().catch((error: unknown) => {
        console.error("[signOut] the action never ran", error);
      });
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {copy.auth.signOut}
      </button>
    </form>
  );
}
