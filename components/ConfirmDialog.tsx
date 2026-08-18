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
      className="fixed inset-0 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center bg-transparent p-4 backdrop:bg-text/40"
    >
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-5 shadow-card">
        <p id={titleId} className="text-base font-medium">
          {title}
        </p>
        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-text-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
