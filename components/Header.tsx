import type { ReactNode } from "react";
import { NotebookPen } from "lucide-react";

import { ThemeToggle, ThemeTogglePlaceholder } from "@/components/ThemeToggle";
import { copy } from "@/lib/copy";
import type { ThemePreference } from "@/lib/theme";

interface HeaderProps {
  /**
   * Right-hand slot. Presentational on purpose: the New note and Sign out
   * controls are passed in by the pages that own them (Phases 3 and 4), so this
   * component never holds data or auth logic of its own.
   */
  actions?: ReactNode;
  /**
   * The stored theme preference, from `getThemePreference()`.
   *
   * OPTIONAL, AND THE OMITTED CASE IS NOT AN OVERSIGHT. Reading the cookie needs an
   * `await`, and `app/notes/loading.tsx` renders this header inside a Suspense
   * FALLBACK — a fallback may not suspend, so nothing in that tree can await
   * anything. The skeleton therefore passes no preference and gets an inert
   * placeholder of the same size (see `ThemeTogglePlaceholder`), which is the same
   * bargain the rest of that file already makes: the header holds its place so the
   * page does not jump, and a control that cannot yet be correct is not pretended
   * into existence.
   *
   * This is also why the header does NOT read the cookie itself. An async `Header`
   * type-checks and renders fine on `/notes`, and breaks the skeleton — the kind of
   * failure that only shows up on a slow connection.
   */
  theme?: ThemePreference;
}

export function Header({ actions, theme }: HeaderProps) {
  return (
    // Sticky, and very slightly translucent: the grid scrolls *under* the bar
    // instead of disappearing behind a hard edge, which is what keeps a fixed
    // header from reading as a toolbar bolted onto the page.
    //
    // NOT `backdrop-blur`. A backdrop filter makes this element a backdrop root, so
    // the strip behind it is re-read and re-blurred on every scroll frame — paid
    // over the whole length of the notes grid. At 95% opacity there is almost
    // nothing left to blur, so the cost bought a difference in 5% of the ground.
    <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/95">
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
        {/* The toggle is rendered by the header itself rather than passed through
            `actions`, because it belongs on every screen that has a header —
            including the loading skeleton — while `actions` is the slot for the
            controls each PAGE owns. It sits left of them so the page's own
            controls keep the corner. */}
        <div className="flex flex-wrap items-center gap-2">
          {theme === undefined ? (
            <ThemeTogglePlaceholder />
          ) : (
            <ThemeToggle preference={theme} />
          )}
          {actions}
        </div>
      </div>
    </header>
  );
}
