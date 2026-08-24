"use client";

import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** True while the confirmed action is in flight (Phase 4). */
  busy?: boolean;
}

/**
 * DISPLAY IS PART OF THE OPEN/CLOSED CONTRACT — never give this element an
 * unconditional display utility.
 *
 * A `<dialog>` is hidden by the UA rule `dialog:not([open]) { display: none }`, and
 * ANY author `display` declaration overrides it, because author styles beat the UA
 * stylesheet regardless of specificity. A bare `flex` in this list therefore painted
 * the dialog while it was CLOSED — not as a modal (`showModal()` had never run, so
 * there was no backdrop and no inertness) but as a `fixed inset-0` box lying across
 * the page. Measured in Chrome on a freshly created note: `open` false,
 * `display: flex`, 1264×805, `activeElement` DIALOG. The dialog covered the editor,
 * swallowed the click meant for the title input, and Cancel looked broken because
 * flipping `open` changed nothing visible.
 *
 * Both states are therefore spelled out here rather than half-inherited from the UA:
 * `hidden` when closed, `open:flex` when open — the variant's `[open]` selector wins
 * on specificity. The two halves must always move together.
 */
const DIALOG_CLASS =
  "hidden open:flex fixed inset-0 m-0 h-full max-h-none w-full max-w-none items-center justify-center bg-transparent p-4 backdrop:bg-scrim backdrop:backdrop-blur-[2px]";

/**
 * Destructive-action confirmation. Presentational only: every string and both
 * handlers are supplied by the caller, so this file has no idea what it is
 * confirming.
 *
 * Built on the native <dialog> element with showModal(), which is what actually
 * makes it modal — focus is trapped inside, the rest of the page goes inert, and
 * focus returns to the trigger on close. Escape arrives as the `cancel` event.
 * A hand-rolled overlay div would claim aria-modal without delivering any of it.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Keep `open` the single source of truth: let the parent close it.
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onCancel();
        }
      }}
      className={DIALOG_CLASS}
    >
      <div className="animate-rise w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-pop">
        <p id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </p>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-text/15 hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-control bg-danger px-4 py-2 text-sm font-medium text-on-accent shadow-card transition-colors hover:bg-danger-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
