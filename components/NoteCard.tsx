import Link from "next/link";

import { NoteCardMenu } from "@/components/NoteCardMenu";
import { copy } from "@/lib/copy";
import { notePath } from "@/lib/routes";
import type { NoteView } from "@/lib/types";

/**
 * One card in the `/notes` grid (SPEC Block E): title or "Untitled", a two-line
 * content preview, and the note's last-updated time.
 *
 * A Server Component, and staying one matters for the timestamp: the relative time
 * below is computed once on the server and never re-rendered in the browser, so
 * there is no clock-skew hydration mismatch to reconcile (SPEC G-28 — every
 * timestamp comes from Postgres `now()`, never from the visitor's clock).
 *
 * Tag chips are the one part of the Block E card spec deliberately absent: tags are
 * Phase 6, and this phase ships no tag UI. The rows already carry them.
 *
 * THE LINK IS NOT THE WRAPPER. It is a transparent overlay covering the card, with the
 * "⋮" menu sitting above it. That is what keeps the menu working: interactive content
 * cannot legally nest inside an `<a>`, and a button inside a link gets activated by the
 * link on Enter, so no amount of `stopPropagation` would have made a nested trigger
 * behave. As siblings there is nothing to stop — the click never reaches the link at all.
 * The overlay carries the note's title as its accessible name, which reads better than a
 * link whose text is the whole card. The cost is that the preview text is not selectable;
 * accepted for a card whose whole surface is a target.
 *
 * Both strings render as JSX text nodes, so a note titled
 * `<script>alert(1)</script>` shows up as that text (SPEC G-19). Nothing here uses
 * dangerouslySetInnerHTML, which is prohibited project-wide.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

// Locale-generated, not typed copy: this is the same class of formatter as the
// toLocaleString("en-US") that lib/copy.ts uses for numbers (rule 10). "en-US"
// is pinned to match — the app's copy is English.
const relativeTime = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function relativeFrom(isoDate: string): string {
  const elapsedSeconds = (Date.now() - new Date(isoDate).getTime()) / 1000;
  const ago = Math.max(0, Math.round(elapsedSeconds));

  if (ago < MINUTE) {
    return relativeTime.format(-ago, "second");
  }
  if (ago < HOUR) {
    return relativeTime.format(-Math.round(ago / MINUTE), "minute");
  }
  if (ago < DAY) {
    return relativeTime.format(-Math.round(ago / HOUR), "hour");
  }
  if (ago < WEEK) {
    return relativeTime.format(-Math.round(ago / DAY), "day");
  }
  if (ago < MONTH) {
    return relativeTime.format(-Math.round(ago / WEEK), "week");
  }
  if (ago < YEAR) {
    return relativeTime.format(-Math.round(ago / MONTH), "month");
  }
  return relativeTime.format(-Math.round(ago / YEAR), "year");
}

export function NoteCard({ note }: { note: NoteView }) {
  const hasTitle = note.title.trim().length > 0;
  const name = hasTitle ? note.title : copy.notes.untitled;

  return (
    <div className="group relative flex min-w-0 flex-col rounded-card border border-border bg-surface p-5 shadow-card transition-[box-shadow,border-color] duration-200 hover:border-text/15 hover:shadow-card-hover">
      {/* The whole-card target. Focus styling lives here, so the ring traces the card. */}
      <Link
        href={notePath(note.id)}
        aria-label={name}
        className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <p
          className={`min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tracking-tight ${
            hasTitle ? "" : "font-medium text-text-muted italic"
          }`}
        >
          {name}
        </p>
        {/*
          Revealed on hover, always visible where the input has no hover to reveal it
          with. The resting `opacity-0` is gated on `can-hover` — a MEDIA QUERY on the
          pointer, not on the viewport width (globals.css). It used to be `sm:`, which
          left the trigger invisible-but-tappable in the corner of every card on any
          touch screen wider than 640 px: a tap there opened a menu the user could not
          see. `group-focus-within` keeps it reachable by keyboard, and
          `has-[[aria-expanded=true]]` keeps an OPEN menu on screen after the pointer
          leaves the card — otherwise moving the mouse to the menu's own items would
          fade the thing you are aiming at.
        */}
        {/*
          NO `z-10` HERE, deliberately. It used to be, and it was what put an open menu
          BEHIND the sticky header: `relative` + a z-index makes the menu's root a
          stacking context, which traps the dropdown's own z-index inside it — so the
          dropdown could never rise above anything the root could not. It does not need
          one: MoreMenu's root is `relative`, the card-wide link is `absolute`, both are
          positioned at `z-auto`, and the root comes LATER in the DOM, so it already
          paints (and hit-tests) above the link. See MoreMenu for the other half.
        */}
        <NoteCardMenu
          noteId={note.id}
          className="-mr-1.5 -mt-1.5 shrink-0 transition-opacity can-hover:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100"
        />
      </div>

      {note.content.trim().length > 0 ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-muted wrap-break-word whitespace-pre-line">
          {note.content}
        </p>
      ) : null}
      {/* `mt-auto` rather than a fixed margin: grid items stretch to the tallest
          card in the row, so the timestamps line up along the bottom edge instead
          of floating at three different heights. */}
      <time dateTime={note.updated_at} className="mt-auto pt-5 text-xs text-text-muted">
        {relativeFrom(note.updated_at)}
      </time>
    </div>
  );
}
