import Link from "next/link";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";
import { TAG_CHIP_SHAPE } from "@/lib/tagChip";

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
 * The breakpoint-aware classes inside this file are `md:w-full` (plus `md:mb-1` and
 * `md:text-center`) on the All tags item, which make it occupy its whole line so the
 * tags start on the next one — the "button on top, chips below" the sidebar needs,
 * without a second container. Everything ELSE about placement — which side, how wide,
 * what gap — is the page's business and arrives as `className`.
 *
 * So the honest boundary is narrower than "decides nothing about where it sits": this
 * component owns the INTERNAL arrangement at each breakpoint and the page owns the
 * external one. A caller wanting the cloud arrangement at desktop width cannot get it
 * from `className` alone. One caller exists, `md` is where SPEC Block E puts the seam,
 * and an `orientation` prop for a second caller that does not exist would be
 * speculative — but the constraint is real and is written down here rather than
 * disclaimed (rule 18 covers docblocks too).
 *
 * `active` is the tag currently in the query string, or null for All tags. Comparison
 * is EXACT, matching `listTags` and the case-sensitive `@>` behind it: if a user has
 * both `Client` and `client`, those are two chips selecting two different sets, and
 * only the one actually in the URL is lit.
 *
 * The whole thing renders nothing when the user has no tags AND no filter is active —
 * an "All tags" chip on its own would be a control that filters nothing, beside a grid
 * it never changes. `active !== null` is the exception, and it is not a corner case:
 * open `/notes?tag=client`, remove that tag from the last note carrying it, and the
 * user is on a filtered view with an empty result whose ONLY way back is the All tags
 * button. Suppressing the row there left "No notes with this tag." — a card with no
 * action — above an empty grid, with the header's app name a plain `<h1>` and no route
 * home short of editing the URL or creating a throwaway note. Found at the Phase 6
 * full-review gate; both docblocks here already asserted the invariant this now keeps.
 */

/**
 * The filter's chip: the app-wide shape (lib/tagChip.ts) plus a border, this row's
 * padding, and a two-state palette. Deliberately NOT `TAG_CHIP` — these are links with
 * a selected state, so the idle form stays neutral; an accent-tinted idle chip beside
 * an accent-filled selected one reads as two selected states. SPEC Block E records
 * that split.
 */
const CHIP = `${TAG_CHIP_SHAPE} block border px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;
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
  if (tags.length === 0 && active === null) {
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
          // `min-w-0` so a 24-character tag truncates inside a 224 px column instead
          // of widening it. The full text stays reachable both ways: it is the link's
          // accessible name, and `title` puts it in a tooltip for a sighted mouse user
          // who would otherwise see a clipped word with no way to read the rest.
          <li key={tag} className="min-w-0">
            <Link
              title={tag}
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
