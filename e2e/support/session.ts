/**
 * Where the browser session the e2e suite runs as is kept — and why the suite is not
 * allowed to create one itself.
 *
 * CLAUDE.md rule 20 is the constraint that shapes this whole directory: test-account
 * passwords are never given to the agent, never read from any file, and never typed by
 * the agent into any form. So no spec below signs in, and nothing here holds an address
 * or a password (which is also rule 5 — no email literal anywhere in the code).
 *
 * The obvious escapes are all closed, which is why what is left is what is left:
 *   - Minting a throwaway account from the suite needs public self-signup, and it is OFF
 *     at the Auth API (SPEC Block H check 9 re-verifies that on purpose).
 *   - Creating one server-side needs the privileged key, prohibited outright (rule 4).
 *   - A test-only sign-in route would be a real auth bypass shipped in app code to make
 *     a test convenient.
 *
 * What is left is Playwright's standard storageState pattern with the sign-in kept where
 * rule 20 puts it — with the owner. `npm run e2e:auth` opens a real browser on /sign-in
 * and waits; the OWNER types her own credentials; the resulting cookie jar is saved to
 * the path below and every spec reuses it. The agent never sees the password, and the
 * repo never holds one.
 *
 * That file is a LIVE Supabase session, so it is gitignored root-anchored (rule 12) and
 * must never be committed. It is not a rule 6 violation: rule 6 governs where the APP
 * persists notes and sessions, and nothing in the app can read this — it is a test
 * fixture on the owner's machine, the same category as a browser profile.
 *
 * Paths are relative to the repo root, which is where Playwright resolves them from.
 */
export const STORAGE_STATE = "e2e/.auth/session.json";

/** The dev server the suite drives. `playwright.config.ts` also boots it from here. */
export const BASE_URL = "http://localhost:3000";
