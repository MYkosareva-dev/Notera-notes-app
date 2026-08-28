import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { test as capture } from "@playwright/test";

import { ROUTES } from "@/lib/routes";
import { STORAGE_STATE } from "./support/session";

/**
 * `npm run e2e:auth` — the one-time, owner-operated sign-in that seeds the suite's
 * session. Not part of `npm run e2e`; the `capture` project is never a dependency of
 * anything (playwright.config.ts).
 *
 * THE OWNER TYPES THE CREDENTIALS. That is the entire point of this file existing
 * instead of a `signIn()` helper: CLAUDE.md rule 20 puts any real sign-in with her, so
 * this opens a headed browser, prints what to do, and waits. It reads no env var and no
 * file for an address or a password — there is deliberately nowhere to put one, because
 * a hook that COULD read a password is a hook that ends up holding one.
 *
 * Re-run it whenever `setup` reports the saved session is no longer signed in.
 */
capture("the owner signs in, and the session is saved for the suite", async ({
  page,
  context,
}) => {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  await page.goto(ROUTES.signIn);

  // console, not the reporter: this is an instruction to a human who is watching this
  // terminal while a browser window waits for them.
  console.log(
    [
      "",
      "  A browser window is open on the sign-in screen.",
      "  Sign in there yourself — this suite never types credentials (CLAUDE.md rule 20).",
      "  It continues on its own once the workspace loads. Ten minutes, then it gives up.",
      "",
    ].join("\n"),
  );

  await page.waitForURL((url) => url.pathname === ROUTES.notes, {
    // Inside the project's 10 min test timeout, so the wait is what times out rather
    // than the test — that difference is the whole error message the owner reads.
    timeout: 9 * 60 * 1000,
  });

  await context.storageState({ path: STORAGE_STATE });

  console.log(`\n  Session saved to ${STORAGE_STATE}. \`npm run e2e\` can run now.\n`);
});
