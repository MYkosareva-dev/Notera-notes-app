import Link from "next/link";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";

/**
 * The tag filter (SPEC US5 step 3, Block E — /notes).
 *
 * A SERVER COMPONENT MADE OF LINKS, and every part of that sentence is the design:
 *
 * - **Links, not buttons.** Each chip is a URL — `/notes` for All tags,
 *   `/notes?tag=client` for a tag — so the filter lives in the address bar. It survives
 *   a reload, it can be bookmarked and shared, Back steps through filters, and the
 *   middle-click and open-in-new-tab a user expects from something that navigates all
 *   work. A button holding the filter in client state would lose every one of those,
 *   and reloading would silently drop the filter.
 * - **Server, not client.** There is no `"use client"` here and no state: following a
 *   chip is a navigation, so the page re-renders ON THE SERVER and `listNotes(tag)`
 *   issues a new query. That is US5's second acceptance box — the filtering happens in
 *   Postgres, not by hiding cards the browser already has. Nothing in this file could
 *   filter anything even if it wanted to; it never receives the notes.
 * - `Link` rather than a bare `<a>` so the navigation is a client-side RSC fetch — the
 *   same server round-trip, without discarding the page.
 *
 * ONE DOM TREE, TWO LAYOUTS. Below `md` this is a wrapping cloud above the grid; at
 * `md` and up the page places it as a right-hand column and the same list becomes a
 * vertical flow. Both are the same wrapping flex row — what changes is how wide it is
 * allowed to be, so the chips wrap after one item instead of after eight. Rendering the
 * list twice behind `hidden`/`md:block` would have been the obvious way and is the
 * wrong one: two copies of every link means a screen reader announcing the filter
 * twice, and two nav landmarks with the same name.
 *
 * The one breakpoint-aware class inside this file is `md:w-full` on the All tags item,
 * which makes it occupy its whole line so the tags start on the next one — the
 * "button on top, chips below" the sidebar needs, without a second container. Placement
 * (which side, how wide, what gap) is the PAGE's business and arrives as `className`;
 * this component decides nothing about where it sits.
 *
 * `active` is the tag currently in the query string, or null for All tags. Comparison
 * is EXACT, matching `listTags` and the case-sensitive `@>` behind it: if a user has
 * both `Client` and `client`, those are two chips selecting two different sets, and
 * only the one actually in the URL is lit.
 *
 * The whole thing renders nothing when the user has no tags — an "All tags" chip on its
 * own would be a control that filters nothing, beside a grid it never changes.
 */

/** Shared chip geometry; only the colours differ between the two states. */
const CHIP =
  "block max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CHIP_ACTIVE = "border-accent bg-accent text-white";
const CHIP_IDLE =
  "border-border bg-surface text-text-muted hover:border-text/15 hover:text-text";

interface TagFilterProps {
  tags: readonly string[];
  active: string | null;
  /** Placement only, owned by `/notes` — see the note above. */
  className?: string;
}

export function TagFilter({ tags, active, className }: TagFilterProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <nav aria-label={copy.notes.tags.filterLabel} className={className}>
      <ul className="flex flex-wrap gap-2">
        {/* `md:w-full` is what turns the cloud into a sidebar: a full-width item in a
            wrapping flex row consumes its line, so every tag below it starts fresh.
            `md:mb-1` widens that one seam a little, so the button reads as heading the
            list rather than as the first chip in it. */}
        <li className="min-w-0 md:mb-1 md:w-full">
          <Link
            href={ROUTES.notes}
            // The current filter is a state, not just a style: aria-current is what
            // tells a screen-reader user which of eighteen links they are standing on.
            aria-current={active === null ? "page" : undefined}
            className={`${CHIP} md:text-center ${active === null ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {copy.notes.tags.all}
          </Link>
        </li>
        {tags.map((tag) => (
          // `min-w-0` so a 24-character tag truncates inside a 224 px column instead of
          // widening it; the chip is a link, so the full text is still its accessible
          // name and its title on hover.
          <li key={tag} className="min-w-0">
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
