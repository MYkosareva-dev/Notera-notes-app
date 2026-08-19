"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { MoreHorizontal } from "lucide-react";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  variant?: "default" | "danger";
}

interface MoreMenuProps {
  /** Accessible name for the icon-only trigger. From lib/copy.ts (rule 10). */
  label: string;
  items: readonly MoreMenuItem[];
  /** Positioning and reveal rules belong to the caller, not to this component. */
  className?: string;
}

/**
 * An icon-only "⋯" trigger with a small menu under it.
 *
 * NEW in Phase 4, despite the phase brief describing it as carried over from Notera:
 * there was no `MoreMenu` in this repo, in any commit on any branch, or in SPEC's
 * component table (BUILD_PHASES mentions a Notera `InlineRename`, which was never ported
 * either). So none of the behaviour below is inherited — it is written here and verified
 * here, which is the part that matters for a review.
 *
 * Presentational and reusable: it knows a label and a list of items, never what they do.
 * The menu-button pattern it implements, deliberately and minimally:
 * - `aria-haspopup="menu"` + `aria-expanded` + `aria-controls` on the trigger, `role="menu"`
 *   on the list and `role="menuitem"` on each entry, so it is announced as a menu.
 * - Opening moves focus to the first item; Escape closes and returns focus to the trigger,
 *   because a keyboard user who dismisses a menu must not be dropped at the top of the page.
 * - Arrow keys move between items and wrap.
 * - An outside `pointerdown` closes it WITHOUT returning focus: the user has already chosen
 *   where they are going, and yanking the caret back would fight them.
 */
export function MoreMenu({ label, items, className }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && root.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    // pointerdown, not click: the menu should be gone before the click lands on
    // whatever is underneath, so that click does what the user expected it to do.
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      itemRefs.current[0]?.focus();
    }
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRefocus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const buttons = itemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    if (buttons.length === 0) {
      return;
    }
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div
      ref={root}
      className={className}
      onKeyDown={handleKeyDown}
      // Belt for callers whose card is itself clickable: nothing that happens in here
      // should reach an ancestor and navigate. (NoteCard also keeps its link out of the
      // ancestor chain, so this is the second fence rather than the only one.)
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>

      {!open ? null : (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-9 z-20 min-w-36 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-card"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                // Close first: an item that opens a dialog would otherwise leave the
                // menu sitting behind it.
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none ${
                item.variant === "danger" ? "text-danger" : "text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
