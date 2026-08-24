import "server-only";

import { cookies } from "next/headers";

import { THEME_COOKIE, readThemePreference } from "./theme";
import type { ThemePreference } from "./theme";

/**
 * The server half of the theme, split off `lib/theme.ts` for one reason: this file
 * imports `next/headers`, and `lib/theme.ts` is imported by `ThemeToggle`, which is
 * a client component. Keeping the `cookies()` call here is what lets the shared
 * half stay shared — the same split, and the same reasoning, as
 * `lib/supabase/{client,server}.ts`.
 *
 * `server-only` makes an accidental client import a BUILD error rather than a
 * confusing runtime one. (Next aliases the package, so nothing needs installing —
 * but a typo in the specifier is silently inert, which is why the build is the
 * check that this line works at all.)
 */

/**
 * The stored preference for this request, or `system` when there is no cookie.
 *
 * CALLED IN THREE PLACES — `app/layout.tsx` (to stamp `<html data-theme>`),
 * `app/notes/page.tsx` and `app/sign-in/page.tsx` (each to render the control in the
 * right state). That is not three reads: `cookies()` resolves once per request and
 * Next serves the same store to every caller, so the extra calls cost nothing.
 *
 * NOTE WHICH FILE IS NOT ON THAT LIST — `components/Header.tsx`. The header takes the
 * preference as a PROP instead, because `app/notes/loading.tsx` renders it inside a
 * Suspense fallback and a fallback may not suspend; an async `Header` type-checks,
 * renders fine on `/notes`, and breaks the skeleton. The prop is threaded from the
 * page for that reason and no other. (An earlier version of this docblock argued the
 * opposite and described `Header` as a caller — it never was.)
 *
 * What it DOES cost: this is read in the ROOT layout, so EVERY route renders
 * dynamically — `next build` prints `ƒ` for all five entries. `/notes` and
 * `/notes/[id]` already did (auth reads cookies on every request); `/`, `/sign-in`
 * and `/_not-found` are the ones this changes. Accepted at the architect gate for
 * `/sign-in` specifically — a sign-in page whose theme is wrong on arrival is the
 * worse trade — and the other two carry no data worth caching.
 *
 * NOT an access decision, and not adjacent to one. It reads one cookie by name and
 * never touches the Supabase client, so nothing here interacts with rules 2 and 3 —
 * no `getUser()`, no `getSession()`, and no token refresh (rule 3's refresh fence
 * lives in `proxy.ts` and is untouched by this file).
 */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  return readThemePreference(store.get(THEME_COOKIE)?.value);
}
