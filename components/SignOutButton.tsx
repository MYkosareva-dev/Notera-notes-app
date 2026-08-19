"use client";

import { useTransition } from "react";
import type { FormEvent } from "react";

import { signOut } from "@/app/notes/actions";
import { callAction } from "@/lib/callAction";
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
      // Through callAction, for the same reason as SignInForm: this action ALWAYS
      // redirects, so its promise always rejects with NEXT_REDIRECT. A bare `.catch`
      // here logged "the action never ran" on every successful sign-out — noise that
      // also made the log useless for the case it was added for.
      //
      // The result is deliberately ignored. SPEC Block E's actions table says a failed
      // sign-out shows the user nothing: offline the action cannot run, the session
      // stays live, and the user stays where they are. Decided at the Phase 4 gate; a
      // visible notice would change that row first — do not add one here on its own.
      // callAction still logs the real transport failure for the developer.
      await callAction(signOut);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-control border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-muted transition-colors hover:border-text/15 hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {copy.auth.signOut}
      </button>
    </form>
  );
}
