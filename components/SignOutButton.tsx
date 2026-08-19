"use client";

import { useTransition } from "react";
import type { FormEvent } from "react";

import { signOut } from "@/app/notes/actions";
import { useToast } from "@/components/Toast";
import { copy } from "@/lib/copy";

/**
 * Sign-out control for the Header (SPEC Block E — /notes).
 *
 * A form submit, never a link: a GET sign-out can be triggered by any third-party
 * page or a prefetch. A client component because the failure case is a toast
 * (SPEC Block E actions table); the sign-out itself happens entirely in the
 * `signOut` Server Action.
 */
export function SignOutButton() {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await signOut();
      // Reached on failure only: success redirects to /sign-in, so the call
      // navigates instead of resolving with a value — hence the optional chain.
      if (result?.error) {
        showToast(result.error, "danger");
      }
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
