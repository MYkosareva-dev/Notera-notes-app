"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteNote } from "@/app/notes/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MoreMenu } from "@/components/MoreMenu";
import { useToast } from "@/components/Toast";
import { callAction } from "@/lib/callAction";
import { copy } from "@/lib/copy";
import { ROUTES, notePath } from "@/lib/routes";

/**
 * The per-card "⋮" menu (SPEC Block E — /notes).
 *
 * **Edit** goes where clicking the card goes. The card is a link and this is a named
 * duplicate of it on purpose: the whole-card link is convenient but silent, so the menu
 * spells the destination out.
 *
 * **Delete** reuses the flow the editor already has, deliberately and completely: the same
 * `ConfirmDialog` copy (US4), the same `deleteNote` Server Action, therefore the same DAL
 * and the same ownership filter. There is no second deletion path in this app — a card
 * cannot delete a note in a way the editor could not.
 *
 * After a successful delete the card disappears on its own: the action calls
 * `revalidatePath(ROUTES.notes)`, and this list IS that route, so the action's response
 * carries its fresh payload. Nothing here navigates, because the user is already where
 * they should end up.
 */
export function NoteCardMenu({
  noteId,
  className,
}: {
  noteId: string;
  className?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  function handleDelete() {
    startDeleting(async () => {
      const result = await callAction(() => deleteNote(noteId));

      if (result.ok) {
        setConfirmOpen(false);
        showToast(copy.notes.deleted);
        return;
      }

      setConfirmOpen(false);

      if (result.failure === "notFound") {
        // Already gone — someone deleted it in another tab (SPEC G-13). The user's
        // intent is satisfied either way; the list refresh below removes the card.
        showToast(copy.notes.gone, { variant: "danger" });
        router.refresh();
        return;
      }

      if (result.failure === "sessionExpired") {
        showToast(copy.notes.save.sessionExpired, {
          variant: "danger",
          duration: "persistent",
          key: "card-delete",
          action: {
            label: copy.notes.save.signIn,
            onClick: () => router.push(ROUTES.signIn),
          },
        });
        return;
      }

      showToast(copy.errors.generic, { variant: "danger", key: "card-delete" });
    });
  }

  return (
    <>
      <MoreMenu
        label={copy.notes.menu.label}
        className={className}
        items={[
          {
            label: copy.notes.menu.edit,
            onSelect: () => router.push(notePath(noteId)),
          },
          {
            label: copy.notes.delete.action,
            onSelect: () => setConfirmOpen(true),
            variant: "danger",
          },
        ]}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={copy.notes.delete.confirmTitle}
        confirmLabel={copy.notes.delete.confirm}
        cancelLabel={copy.notes.delete.cancel}
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
