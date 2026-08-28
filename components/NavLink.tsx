import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface NavLinkProps {
  href: string;
  label: string;
  /** Rendered before the label and always `aria-hidden` — the label is the name. */
  icon: LucideIcon;
}

/**
 * A header link between the app's two screens (SPEC US8 added the second one).
 *
 * A LINK AND NOT A FORM, which is the one thing worth stating: `SignOutButton` and
 * `NewNoteButton` are submits because invoking a Server Action is a POST and nothing a
 * third party can trigger may fire one. Navigation has no such hazard — it is a GET —
 * so making these submits too would only break middle-click, Ctrl-click and the
 * address the browser shows on hover.
 *
 * It exists as a component because the neutral-button style was already written out
 * twice (`SignOutButton`, and the editor's back link) and US8 needed it twice more.
 * Rule 11 — and the Phase 5 gate parked "duplicated card blocks" as styling debt, so
 * this is not the place to add two more copies of a class string. Presentational only:
 * no state, no data, no auth logic.
 */
export function NavLink({ href, label, icon: Icon }: NavLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-muted transition-colors hover:border-text/15 hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
