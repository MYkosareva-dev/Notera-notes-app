import Link from "next/link";

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

  return (
    <Link
      href={notePath(note.id)}
      className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <p
        className={`truncate text-sm font-medium ${
          hasTitle ? "" : "text-text-muted italic"
        }`}
      >
        {hasTitle ? note.title : copy.notes.untitled}
      </p>
      {note.content.trim().length > 0 ? (
        <p className="mt-2 line-clamp-2 text-sm text-text-muted wrap-break-word whitespace-pre-line">
          {note.content}
        </p>
      ) : null}
      <time
        dateTime={note.updated_at}
        className="mt-4 text-xs text-text-muted"
      >
        {relativeFrom(note.updated_at)}
      </time>
    </Link>
  );
}
