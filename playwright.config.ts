import { defineConfig } from "@playwright/test";

import { BASE_URL, STORAGE_STATE } from "./e2e/support/session";
import { ROUTES } from "./lib/routes";

/**
 * End-to-end test configuration (Playwright).
 *
 * THREE PROJECTS, and the split is the whole design:
 *
 *   capture  — run by hand, once, via `npm run e2e:auth`. Opens a real headed browser on
 *              /sign-in and waits for the OWNER to sign in, then saves the cookie jar.
 *              Never part of a normal run; see e2e/support/session.ts for why the suite
 *              may not sign itself in (CLAUDE.md rule 20).
 *   setup    — runs before every suite run: proves the saved session still works and
 *              re-saves it, so a rotated refresh token does not stale the file.
 *   app      — the specs, running as that session. NAMED FOR THE APP, not for one of
 *              its screens: `testMatch` is every `*.spec.ts`, so a spec for any route
 *              joins this project by existing. It was called `notes` while notes were
 *              the only screen with specs, and renamed the moment a second one arrived
 *              — a project name that describes one member of a growing set is how a
 *              later member ends up excluded, or worse, silently included under a name
 *              that says it is not.
 *
 * `npm run e2e` names only `app`; `setup` comes along as its declared dependency, and
 * `capture` deliberately does not.
 *
 * SERIAL ON PURPOSE — `workers: 1`, `fullyParallel: false`. These specs drive the owner's
 * real Supabase project as one real user: parallel workers would share one notes list and
 * one `LIMITS.notesPerUser` budget, and a delete assertion racing another worker's insert
 * is a flake with no bug behind it. Every spec still scopes its assertions to a title only
 * it creates, so the serial mode is belt to that braces rather than the only thing holding
 * the suite together.
 *
 * NO `retries`. A retry here would re-run a test that mutates real rows, and a green
 * second attempt would hide exactly the timing bug this suite exists to catch.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Generous, because these run against `next dev`: the first navigation to a route pays
  // for its compile, which no assertion timeout should be asked to absorb.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    // 1280 is the desktop width SPEC Block E is written against.
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "capture",
      testMatch: /capture-session\.setup\.ts/,
      // Headed from the config rather than from a `--headed` flag: this project is
      // useless headless — a human has to see the form to fill it in — and a run that
      // silently waited ten minutes on an invisible browser would look like a hang.
      use: { headless: false, storageState: undefined },
      timeout: 10 * 60 * 1000,
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "app",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: STORAGE_STATE },
    },
  ],
  webServer: {
    command: "npm run dev",
    // /sign-in rather than `/`: it is the one route that answers 200 with no session and
    // no redirect, so "the server is up" cannot be confused with "the server redirected".
    url: `${BASE_URL}${ROUTES.signIn}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
