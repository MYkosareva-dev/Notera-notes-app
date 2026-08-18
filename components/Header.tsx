import type { ReactNode } from "react";

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
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="text-base font-semibold tracking-tight">
          {copy.app.name}
        </span>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
