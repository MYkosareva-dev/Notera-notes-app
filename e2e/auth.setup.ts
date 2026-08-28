import { existsSync } from "node:fs";

import { expect, test as setup } from "@playwright/test";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";
import { STORAGE_STATE } from "./support/session";

/**
 * Runs before every suite run, as the `notes` project's declared dependency.
 *
 * It does two things, and the second is not optional. It proves the saved session is
 * still signed in — so a suite that is merely unauthenticated fails HERE, once, with an
 * actionable message, instead of three specs failing on a sign-in screen they cannot
 * read. And it RE-SAVES the cookie jar: Supabase rotates the refresh token on every
 * refresh, so the first run after the access token's TTL spends the token in the saved
 * file. Without this write-back the file is good for exactly one post-expiry run and
 * then reports a signed-out session that is in fact fine.
 *
 * It runs in its own context rather than the `page` fixture, because the project-level
 * storageState belongs to the specs, and this one has to write the file back.
 */
setup("the saved session is still signed in", async ({ browser }) => {
  if (!existsSync(STORAGE_STATE)) {
    throw new Error(
      [
        `No saved session at ${STORAGE_STATE}.`,
        "",
        "This suite cannot sign itself in: test-account passwords are never given to the",
        "agent and never typed by it (CLAUDE.md rule 20), and public self-signup is off",
        "at the Auth API, so there is no throwaway account to mint either.",
        "",
        "Run `npm run e2e:auth`, sign in yourself in the window it opens, and re-run.",
      ].join("\n"),
    );
  }

  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  await page.goto(ROUTES.notes);

  // The URL alone is not proof — assert the workspace actually rendered. A layout
  // redirect on this project does NOT stop the page rendering (measured on Next 16.3.1),
  // so "did we get bounced to /sign-in" and "is there a workspace here" are two
  // different questions and this checks both.
  await expect(page).toHaveURL((url) => url.pathname === ROUTES.notes);
  await expect(
    page.getByRole("button", { name: copy.notes.newNote }).first(),
  ).toBeVisible();

  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});
