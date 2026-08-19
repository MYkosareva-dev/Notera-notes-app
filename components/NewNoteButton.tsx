"use client";

import { useTransition } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { createNote } from "@/app/notes/actions";
import { useToast } from "@/components/Toast";
import { callAction } from "@/lib/callAction";
import { copy } from "@/lib/copy";

/**
 * The **New note** control (SPEC Block E — /notes actions table). Appears in the
 * header and inside the empty state.
 *
 * A form submit rather than a link or a bare onClick, for the same reason as
 * SignOutButton: invoking a Server Action is a POST, so nothing a third party can
 * trigger — a prefetch, an `<img>` — can create a note. The client part is only the
 * pending state and the failure toast; the insert and the redirect to the new note
 * both happen inside the action.
 *
 * On success this component never gets a result: the action redirects, so the call
 * navigates instead of resolving with a value.
 */
export function NewNoteButton() {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      // callAction: offline, the action never runs and the call rejects rather than
      // returning a result, which would leave the click with no visible outcome at
      // all (SPEC Block E promises a toast on failure).
      const result = await callAction(createNote);

      if (result?.ok === false) {
        // Two distinct reasons, two messages. The cap message is derived from
        // LIMITS (rule 10); everything else is the Block E failure copy.
        showToast(
          result.failure === "limitReached"
            ? copy.limits.tooManyNotes
            : copy.notes.createError,
          { variant: "danger", key: "create-note" },
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Plus aria-hidden="true" className="size-4" />
        )}
        {copy.notes.newNote}
      </button>
    </form>
  );
}
