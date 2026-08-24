"use server";

import { cookies } from "next/headers";

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  isThemePreference,
} from "@/lib/theme";
import type { ActionResult } from "@/lib/types";

/**
 * Root-segment Server Actions — app-wide, not owned by a route group.
 *
 * There is exactly one, and it is here rather than in `app/notes/actions.ts`
 * because the theme toggle also renders on `/sign-in`: a public page must never
 * import from the protected segment (the same reason `signIn` has its own file).
 */

/**
 * Persists the theme preference. Nothing else — no DAL, no Supabase client, no
 * `getUser()`.
 *
 * THIS ENDPOINT IS ANONYMOUS-REACHABLE ON PURPOSE. Every Server Action is a public
 * POST (SPEC rule B3b), and this one has no user to check: `/sign-in` renders the
 * toggle before anyone has signed in, so requiring a session would make the
 * control dead exactly where it is first seen. What keeps that safe is that the
 * action grants nothing and reads nothing — the whole of its authority is "set one
 * cookie on the caller's own browser to one of three known words". So:
 *
 * - the argument is narrowed at runtime, never trusted (`unknown` in, and a bad
 *   value is refused rather than written), and
 * - it must never gain a branch that touches `notes`, `getUser()` or the DAL. The
 *   moment it does, it needs fence 1 like every other write, and it stops being a
 *   safe thing to leave open. Add a new action instead.
 *
 * No `revalidatePath`. The theme is not in any cached payload — it is one attribute
 * on `<html>`, which `ThemeToggle` has already flipped locally by the time this
 * resolves — so revalidating would discard the route cache and re-render the notes
 * grid to produce identical markup. It buys a round-trip and a stale-cache window,
 * not a correction. This is the deliberate exception to rule 14's pipeline: rule 14
 * describes the NOTE mutation path, and nothing here is note data.
 *
 * No debounce either (rule 9 / B2). A click is discrete; a debounce exists to
 * collapse keystrokes.
 */
export async function setThemePreference(preference: unknown): Promise<ActionResult> {
  if (!isThemePreference(preference)) {
    // A forged or stale payload. `invalid` rather than a throw: the caller treats
    // this like any other refusal, and an unhandled server throw would light up the
    // dev error overlay for a case the app handles (see lib/callAction.ts).
    return { ok: false, failure: "invalid" };
  }

  const store = await cookies();

  if (preference === DEFAULT_THEME_PREFERENCE) {
    // `system` is the ABSENCE of the cookie (see lib/theme.ts) — so choosing it
    // clears the choice rather than recording a third word. This is also the only
    // way back to "follow my OS" once a visitor has picked a side.
    //
    // `path` spelled out, not inherited. Next 16.3.1 defaults it to "/" on both set
    // and delete, so a bare delete works today — but if that default ever moved, a
    // pathless delete would silently fail to clear the cookie from a nested URL, and
    // the System option would stop working on exactly the routes that are not "/".
    // Pinning it costs one line.
    store.delete({ name: THEME_COOKIE, path: "/" });
    return { ok: true };
  }

  store.set(THEME_COOKIE, preference, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Nothing in the browser reads this: the server hands the current value to
    // `ThemeToggle` as a prop, so the cookie never needs to be visible to JS.
    httpOnly: true,
    // Local-only this sprint (SPEC Block A), so an unconditional `secure` would
    // simply stop the cookie from being stored over http://localhost. Gated rather
    // than deferred, because unlike the auth cookies this one has no reason to wait
    // for a deployment decision.
    secure: process.env.NODE_ENV === "production",
  });

  return { ok: true };
}
