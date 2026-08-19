import type { ReactNode } from "react";
import { NotebookPen } from "lucide-react";

import { copy } from "@/lib/copy";

interface HeaderProps {
  /**
   * Right-hand slot. Presentational on purpose: the New note and Sign out
   * controls are passed in by the pages that own them (Phases 3 and 4), so this
   * component never holds data or auth logic of its own.
   */
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
  return (
    // Sticky, and translucent rather than opaque: the grid scrolls *under* the
    // bar instead of disappearing behind a hard edge, which is what keeps a
    // fixed header from reading as a toolbar bolted onto the page.
    <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Decorative only — the app name beside it is the accessible text. */}
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"
          >
            <NotebookPen className="size-4" />
          </span>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {copy.app.name}
          </h1>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
