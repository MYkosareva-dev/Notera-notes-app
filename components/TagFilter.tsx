import Link from "next/link";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";

/**
 * The tag chip row above the notes grid (SPEC US5 step 3, Block E — /notes).
 *
 * A SERVER COMPONENT MADE OF LINKS, and every part of that sentence is the design:
 *
 * - **Links, not buttons.** Each chip is a URL — `/notes` for All, `/notes?tag=client`
 *   for a tag — so the filter lives in the address bar. It survives a reload, it can
 *   be bookmarked and shared, Back steps through filters, and the middle-click and
 *   open-in-new-tab a user expects from something that navigates all work. A button
 *   holding the filter in client state would lose every one of those, and reloading
 *   would silently drop the filter.
 * - **Server, not client.** There is no `"use client"` here and no state: following a
 *   chip is a navigation, so the page re-renders ON THE SERVER and `listNotes(tag)`
 *   issues a new query. That is US5's second acceptance box — the filtering happens in
 *   Postgres, not by hiding cards the browser already has. Nothing in this file could
 *   filter anything even if it wanted to; it never receives the notes.
 * - `Link` rather than a bare `<a>` so the navigation is a client-side RSC fetch — the
 *   same server round-trip, without discarding the page.
 *
 * `active` is the tag currently in the query string, or null for All. Comparison is
 * EXACT, matching `listTags` and the case-sensitive `@>` behind it: if a user has both
 * `Client` and `client`, those are two chips selecting two different sets, and only the
 * one actually in the URL is lit.
 *
 * The whole row renders nothing when the user has no tags — an "All" chip on its own
 * would be a control that filters nothing, above a grid it never changes.
 */

/** Shared chip geometry; only the colours differ between the two states. */
const CHIP =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CHIP_ACTIVE = "border-accent bg-accent text-white";
const CHIP_IDLE =
  "border-border bg-surface text-text-muted hover:border-text/15 hover:text-text";

interface TagFilterProps {
  tags: readonly string[];
  active: string | null;
}

export function TagFilter({ tags, active }: TagFilterProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <nav aria-label={copy.notes.tags.filterLabel} className="mb-6">
      {/* Scrolls sideways rather than stacking into four rows of chips at 375, and the
          negative gutters let that scroll run edge to edge instead of clipping inside
          the page padding. Nothing overflows the viewport (SPEC Block E). */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        <li className="shrink-0">
          <Link
            href={ROUTES.notes}
            // The current filter is a state, not just a style: aria-current is what
            // tells a screen-reader user which of eleven links they are standing on.
            aria-current={active === null ? "page" : undefined}
            className={`${CHIP} ${active === null ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {copy.notes.tags.all}
          </Link>
        </li>
        {tags.map((tag) => (
          <li key={tag} className="shrink-0">
            <Link
              // An object href, so Next encodes the value: a tag containing `&`, `#` or
              // a space must not be able to add a second query parameter.
              href={{ pathname: ROUTES.notes, query: { tag } }}
              aria-current={active === tag ? "page" : undefined}
              className={`${CHIP} ${active === tag ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {tag}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
