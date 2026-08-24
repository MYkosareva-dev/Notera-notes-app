"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { setThemePreference } from "@/app/actions";
import { callAction } from "@/lib/callAction";
import { copy } from "@/lib/copy";
import { THEME_PREFERENCES, themeAttribute } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";

/**
 * The three-state theme control (SPEC Block E, "Dark palette").
 *
 * THREE STATES, NOT TWO — the owner decision taken at the architect gate. A
 * two-state toggle has to answer "which side am I on?" on the server, and for a
 * visitor with no cookie the server cannot know: their OS preference is a fact
 * about their machine that never reaches the request. Such a toggle either guesses
 * (and shows the wrong icon until hydration corrects it) or renders nothing
 * decisive (and is briefly inert). `System` is a truthful third answer, so neither
 * compromise is needed: the page is right from the first byte because CSS resolves
 * it, and the control is right from the first byte because "follow the OS" is
 * exactly what is stored.
 *
 * NATIVE RADIOS, deliberately. A radio group in one `<fieldset>` gets exclusivity,
 * arrow-key navigation, wrap-around, one tab stop for the whole group and the right
 * screen-reader announcement ("Theme, System, 1 of 3") from the platform. The
 * hand-rolled alternative is `role="radiogroup"` plus a keydown handler — which is
 * the shape `MoreMenu` had to take because no element does menus, and there was no
 * reason to repeat that work where an element does exist.
 *
 * Presentational about placement: it takes a `className` and decides nothing about
 * where it sits (the same split `TagFilter` uses). `Header` needs no override;
 * `/sign-in`, which has no header, positions it in the corner itself.
 */

interface ThemeOption {
  value: ThemePreference;
  label: string;
  Icon: LucideIcon;
}

/**
 * Derived from `THEME_PREFERENCES` rather than re-listed, so a fourth preference
 * cannot be added to `lib/theme.ts` and silently miss the UI (rule 11). The `satisfies`
 * makes that a type error rather than a missing button.
 */
const OPTION_DETAIL = {
  system: { label: copy.theme.system, Icon: Monitor },
  light: { label: copy.theme.light, Icon: Sun },
  dark: { label: copy.theme.dark, Icon: Moon },
} satisfies Record<ThemePreference, Omit<ThemeOption, "value">>;

const OPTIONS: readonly ThemeOption[] = THEME_PREFERENCES.map((value) => ({
  value,
  ...OPTION_DETAIL[value],
}));

/**
 * The group's outer shell, shared with the placeholder below so the two cannot
 * drift apart in size — the whole point of the placeholder is that swapping one for
 * the other moves nothing (rule 11).
 */
const GROUP_SHELL =
  "flex items-center gap-0.5 rounded-control border border-border bg-surface p-0.5";

/** One option's box. `size-7` × 3 plus the gaps and padding is what fixes the width. */
const OPTION_BOX = "flex size-7 items-center justify-center rounded-[7px]";

/**
 * The header's stand-in while the theme is unknown.
 *
 * `app/notes/loading.tsx` renders `Header` inside a Suspense fallback, and a
 * fallback may not suspend — so that tree cannot await the cookie and cannot know
 * which of the three options is selected. Showing a guess would be showing
 * something false; showing nothing would let the header's contents jump sideways
 * when the real control arrives. An inert box of exactly the right size does
 * neither.
 *
 * `aria-hidden` because it is decoration with no state to report: the real control
 * announces itself when it replaces this one. Not a `<fieldset>` for the same
 * reason — an empty group in the accessibility tree is worse than no group.
 */
export function ThemeTogglePlaceholder() {
  return (
    <div aria-hidden="true" className={GROUP_SHELL}>
      {THEME_PREFERENCES.map((value) => (
        <span key={value} className={OPTION_BOX} />
      ))}
    </div>
  );
}

/**
 * Applies the choice to the live document.
 *
 * This is the ONLY DOM write in the feature, and it is what makes the click feel
 * instant. The attribute is server-rendered on `<html>`, and `<html>` is above
 * every React root — so React cannot re-render it, and waiting for the round-trip
 * would mean a visible pause between the click and the repaint. `revalidatePath`
 * would not help either: it re-renders the route, not the document element.
 *
 * Note what this is NOT: persistence. Nothing is stored here — the cookie is
 * written by the Server Action, and this line is undone by the next reload if that
 * write never lands (SPEC G-30).
 */
function applyTheme(preference: ThemePreference): void {
  const attribute = themeAttribute(preference);

  if (attribute === undefined) {
    // `system` is the ABSENCE of the attribute, matching what the server stamps —
    // which is what hands the decision back to `prefers-color-scheme` in CSS.
    delete document.documentElement.dataset.theme;
    return;
  }

  document.documentElement.dataset.theme = attribute;
}

export function ThemeToggle({
  preference,
  className = "",
}: {
  /** The stored preference, read from the cookie by the root layout. */
  preference: ThemePreference;
  className?: string;
}) {
  /**
   * Local state, seeded from the server prop — the same shape rule B2 uses for the
   * editor's fields, and for the same reason: the control must answer the click
   * without waiting for a server round-trip.
   *
   * Deliberately NOT re-synced from the prop afterwards. The only way the two can
   * disagree is a change made in ANOTHER TAB, and this app already takes that
   * position elsewhere: G-17 records last-write-wins for two tabs on one note. A
   * theme that quietly re-flipped on navigation would be a worse answer than a
   * theme that is stale until reload.
   */
  const [selected, setSelected] = useState<ThemePreference>(preference);

  /**
   * THE COOKIE WINS AT EVERY SERVER RENDER. Without this, the control and the page
   * can disagree inside one tab: after a failed write (G-30) the document carries the
   * new theme while the cookie still carries the old one, and `/notes` →
   * `/notes/[id]` → `/notes` unmounts and remounts this component — re-seeding
   * `selected` from the stale cookie while the `<html>` attribute survives, because
   * the server prop never changed and React has nothing to reconcile. The result was
   * a dark page whose control read "Light", in one tab, with no reload.
   *
   * So a changed prop re-applies to BOTH: state and document together. On an ordinary
   * mount it writes the value that is already there and nothing moves.
   *
   * This is not a rollback of the failure policy below — that policy is about the
   * moment of the click. It is the weaker and more defensible rule that whatever the
   * server last told us is what the page shows.
   */
  useEffect(() => {
    setSelected(preference);
    applyTheme(preference);
  }, [preference]);

  async function choose(next: ThemePreference) {
    // NO `next === selected` GUARD. A radio does not fire `change` when it is already
    // checked, so the guard could only ever be reached by a code path that does not
    // exist — and it made the one case that matters unreachable on purpose: after a
    // failed write, re-picking the same option is the obvious retry. (It is still not
    // available, because the browser fires no event; G-30 records that. The guard was
    // simply dead code claiming to be a decision.)
    setSelected(next);
    applyTheme(next);

    // Through callAction, never bare: an action call is a fetch, and a fetch on a
    // dead network REJECTS rather than returning a result (see lib/callAction.ts).
    // No `useTransition` around it either — nothing reads a pending flag here, the
    // control has already repainted, and `callAction` never rejects.
    const result = await callAction(() => setThemePreference(next));

    // NOTHING IS SHOWN ON FAILURE, and the local change is NOT rolled back. The
    // user asked for this theme and they have it for as long as this document
    // lives; all that failed is remembering it past a reload. Reverting the page
    // under them would turn a lost preference into a visible malfunction, and a
    // toast would spend rule B8's single-notice queue — the one the editor needs
    // for unsaved TEXT — on a colour scheme. Same position as the Sign out row in
    // Block E's actions table: logged for the developer, silent for the user.
    // Recorded as SPEC G-30; changing it means changing that row first.
    if (result.ok === false) {
      console.warn("[ThemeToggle] the preference was not persisted", result.failure);
    }
  }

  return (
    <fieldset
      // No `disabled` while the transition is pending. The control is already showing
      // the new state and the write is one cookie — blocking it would make a
      // double-click feel broken for no gain, and a queued second write simply wins.
      className={`${GROUP_SHELL} ${className}`}
    >
      {/* The group's accessible name. Visually hidden because the three icons sit in
          a header that already has two labelled controls, and a fourth visible word
          there buys nothing at 375 px. */}
      <legend className="sr-only">{copy.theme.label}</legend>

      {OPTIONS.map(({ value, label, Icon }) => {
        const isSelected = value === selected;

        return (
          <label
            key={value}
            // `title` for the pointer user, the sr-only span for everyone else — the
            // icons alone do not say "System" to anybody who has not seen this
            // pattern before.
            title={label}
            className={`${OPTION_BOX} cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
              isSelected
                ? "bg-accent-soft text-accent"
                : "text-text-muted hover:bg-bg hover:text-text"
            }`}
          >
            <input
              type="radio"
              // One name for the group, so the browser enforces exclusivity and
              // arrow keys move between exactly these three.
              name="theme"
              value={value}
              checked={isSelected}
              onChange={() => void choose(value)}
              // Hidden, not `hidden`: an `hidden` input is unfocusable, which would
              // cost the keyboard behaviour this element was chosen for. `sr-only`
              // keeps it in the tab order and in the accessibility tree; the focus
              // ring is drawn by the label via `has-[:focus-visible]`.
              className="sr-only"
            />
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
