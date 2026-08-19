"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { MoreVertical } from "lucide-react";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  variant?: "default" | "danger";
}

interface MoreMenuProps {
  /** Accessible name for the icon-only trigger. From lib/copy.ts (rule 10). */
  label: string;
  items: readonly MoreMenuItem[];
  /**
   * Placement in the caller's layout, and any reveal rules (hover, focus-within). The
   * containing block is NOT the caller's business: this component establishes its own,
   * because the dropdown is positioned against it.
   */
  className?: string;
}

/**
 * An icon-only "⋮" trigger with a small menu under it.
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
 * - Focus leaving the menu closes it, for the same reason and by the same rule: Tab from
 *   the last item used to walk out of the card while the menu stayed painted (the
 *   `has-[[aria-expanded=true]]` reveal keeps it on screen), so the keyboard user left a
 *   menu open behind them with no way to tell. Added in Phase 5 as an owner-approved
 *   exception to that phase's styling-only constraint, since it needs a handler.
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

  /**
   * Closes when focus lands on a control outside the menu — the other half of the
   * outside-pointerdown rule, for the keyboard.
   *
   * `relatedTarget` is where focus is GOING, and null covers several unrelated cases
   * at once: focus moved to `document.body` or to something non-focusable, a
   * programmatic `.blur()` ran, or focus left the document (window blur, devtools).
   * None of them is the user choosing another control, so all of them leave the menu
   * open — an outside CLICK is already handled by the pointerdown listener above, so
   * nothing is stranded by declining to guess here.
   */
  function handleFocusOut(event: ReactFocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next === null || root.current?.contains(next)) {
      return;
    }
    setOpen(false);
  }

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
      // `relative` is owned here, not passed in: the menu below is absolutely positioned
      // against this element, so a caller who forgot the class would silently anchor the
      // dropdown to some ancestor instead.
      //
      // `relative` and NOTHING ELSE that layers. A z-index here would make this element
      // a stacking context and trap the dropdown's own z-index inside it — which is
      // exactly how an open card menu ended up painted behind the sticky header. Callers
      // must not pass a `z-*` class in `className` for the same reason.
      className={`relative ${className ?? ""}`}
      onKeyDown={handleKeyDown}
      // `onBlur` in React is the delegated `focusout`, so it fires for every
      // descendant — which is what makes one handler on the root enough.
      onBlur={handleFocusOut}
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
        className="flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-bg hover:text-text aria-expanded:bg-bg aria-expanded:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <MoreVertical aria-hidden="true" className="size-4" />
      </button>

      {!open ? null : (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          /* z-40 places an open menu above the sticky Header (z-30) and below the
             toast viewport (z-50). It only reaches those because the root above
             creates no stacking context. */
          className="animate-rise absolute right-0 top-9 z-40 min-w-40 overflow-hidden rounded-card border border-border bg-surface p-1 shadow-pop"
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
              className={`flex w-full items-center rounded-control px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none ${
                item.variant === "danger"
                  ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft"
                  : "text-text hover:bg-bg focus-visible:bg-bg"
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
