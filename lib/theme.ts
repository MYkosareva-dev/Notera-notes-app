/**
 * The theme preference — shared by the server (root layout, the Server Action)
 * and the client (`ThemeToggle`), so it holds no `next/headers` import and is
 * NOT marked `server-only`.
 *
 * WHY A COOKIE, and why this is not a rule 6 violation. Rule 6 makes Supabase the
 * only persistence layer and bans both web-storage APIs outright, and SPEC Block H
 * check 5 greps the shipping tree for their names. A theme preference is
 * neither note data nor session data: it carries no identity, grants nothing, and
 * a forged value can only repaint the page for the person who forged it. It lives
 * in a cookie for the one reason web storage cannot serve — the SERVER must know
 * it before the first byte, or the page paints in the wrong theme and corrects
 * itself in front of the user. Web storage is unreadable during SSR by
 * construction, which is why the usual `next-themes` shape needs a blocking
 * inline script; that script is what this design exists to avoid.
 *
 * (Those two API names are spelled out nowhere in this file on purpose: check 5
 * greps app code for them, and its known-hits list is vendor docs and SPEC. A
 * comment is not a use — but an allowlist that grows to accommodate prose is one
 * that will eventually cover a real call.)
 *
 * No schema change, therefore no rule 8 obligation: nothing about this reaches
 * Postgres. That is also what lets the toggle work on `/sign-in`, where there is
 * no user to key a row to (SPEC G-29).
 */

/**
 * Absent cookie means `system`, so `system` is stored by DELETING the cookie
 * rather than by writing the word. One representation of "no explicit choice"
 * instead of two — the alternative silently makes `themeAttribute` a three-way
 * that has to agree with a two-way in CSS.
 */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/** Read in the root layout, written by the `setThemePreference` action. */
export const THEME_COOKIE = "notera-theme";

/** One year. A display preference that expires is a display preference that surprises. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The Server Action is a public POST endpoint like every other (SPEC rule B3b),
 * so its argument is narrowed at runtime rather than trusted because TypeScript
 * typed it. Also used on the read side: a cookie is client-writable, so the value
 * coming back out of one is exactly as untrusted as the value going in.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** A cookie value of any shape, narrowed to a preference. Anything else is `system`. */
export function readThemePreference(value: string | undefined): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

/**
 * What goes on `<html data-theme>`, or `undefined` to omit the attribute.
 *
 * `system` deliberately stamps NOTHING. With no attribute the CSS in
 * `app/globals.css` falls through to `prefers-color-scheme`, so a first-time
 * visitor gets their OS theme from the stylesheet alone — no script, no flash,
 * and nothing for the server to guess. That is the whole reason the control is
 * three-state (owner decision): a two-state toggle has no way to render "I don't
 * know yet" and must either guess the icon or paint it late.
 */
export function themeAttribute(preference: ThemePreference): "light" | "dark" | undefined {
  return preference === "system" ? undefined : preference;
}
