import { expect, test as base, type Locator, type Page } from "@playwright/test";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";

/**
 * Locators and flows the three specs share.
 *
 * EVERY USER-FACING STRING COMES FROM `lib/copy.ts` (CLAUDE.md rules 10 and 11). Not for
 * tidiness: a test that hardcodes "New note" keeps passing after the copy changes and
 * silently stops testing the button the user sees, and one that hardcodes "Saved" would
 * have to be found by hand the day that word moves. Nothing below types a literal the app
 * also types.
 *
 * The specs drive the OWNER'S REAL Supabase project as her real user — there is no test
 * database here, and no seeding path that does not need a privileged key (rule 4). Two
 * consequences are designed for: every note this suite makes is titled with an `E2E`
 * prefix and a timestamp so a stray one is obvious in her list, and the `newNote` fixture
 * deletes what it created however the test ended.
 */

/** Distinct per note and per run, and recognisable at a glance in a real notes list. */
export function uniqueTitle(label: string): string {
  return `E2E ${label} ${Date.now()}`;
}

/**
 * The editor's save indicator. Selected by its live region rather than by its text,
 * because the text IS what the assertions read; the only other `aria-live` in the app is
 * the toast viewport, which is a `div`.
 */
export function saveStatus(page: Page): Locator {
  return page.locator('p[aria-live="polite"]');
}

/** The editor's two fields. Both are borderless with no visible label, so `aria-label` is their name. */
export function titleField(page: Page): Locator {
  return page.getByLabel(copy.notes.editor.titleLabel);
}

export function bodyField(page: Page): Locator {
  return page.getByLabel(copy.notes.editor.contentLabel);
}

/**
 * One card in the list, addressed by the note's title. The card-wide target is a link
 * whose accessible name is the title (NoteCard), so this is also how a screen-reader user
 * finds it. `exact` matters — the timestamps make titles unique, but a prefix match would
 * couple two runs.
 */
export function noteLink(page: Page, title: string): Locator {
  return page.getByRole("link", { name: title, exact: true });
}

/**
 * Create a note the way the UI does and land in its editor. Returns the note's URL.
 *
 * `.first()` on the button: **New note** is in the header AND inside the empty state, so
 * on a fresh account there are two of them.
 */
export async function createNote(page: Page): Promise<string> {
  await page.goto(ROUTES.notes);
  await page.getByRole("button", { name: copy.notes.newNote }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith(`${ROUTES.notes}/`));
  await expect(titleField(page)).toBeVisible();
  return page.url();
}

/**
 * Put `text` in an editor field and do not return until the server has confirmed it.
 *
 * THIS IS THE LOAD-BEARING HELPER, and the network wait is why. Saving is debounced by
 * 300 ms (rule 9 / SPEC B2), so a spec that reloads straight after typing races its own
 * write and fails for a reason that is not a bug. Waiting for the visible "Saved" alone
 * cannot fix that either: `saveState` starts life as `"saved"` (NoteEditor), so the word
 * is already on screen before anything is typed and an assertion on it would pass
 * instantly, against the previous state.
 *
 * So: wait for the Server Action's POST — a Server Action posts to the URL it was invoked
 * from — and THEN assert the indicator. Both halves say something. The response proves the
 * write went out and came back; "Saved" proves the editor accepted it as confirmed, which
 * per SPEC G-10 it only ever does on an `ok` result.
 */
export async function saveEdit(page: Page, field: Locator, text: string): Promise<void> {
  const actionUrl = page.url();
  const savePosted = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url() === actionUrl,
    { timeout: 30_000 },
  );

  await field.fill(text);

  await savePosted;
  await expect(saveStatus(page)).toHaveText(copy.notes.editor.saved);
}

/** Confirm whichever delete dialog is currently open. `dialog[open]` is unambiguous even with one dialog per card in the DOM. */
async function confirmDelete(page: Page): Promise<void> {
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: copy.notes.delete.confirm, exact: true })
    .click();
}

/**
 * Delete a note from its card in the list: "⋮" → Delete → confirm.
 *
 * The list's own path rather than the editor's, because what the spec asserts afterwards
 * is about the list. `locator("..")` walks from the card-wide link to the card element
 * that holds it — the link is a direct child (NoteCard) — which scopes the "⋮" to the one
 * card among however many the owner's account already has.
 */
export async function deleteFromCard(page: Page, title: string): Promise<void> {
  const card = noteLink(page, title).locator("..");
  await card.getByRole("button", { name: copy.notes.menu.label }).click();
  await page
    .getByRole("menuitem", { name: copy.notes.delete.action, exact: true })
    .click();
  await confirmDelete(page);
}

/**
 * Teardown. Removes the note at `url` if it is still there, from its own editor.
 *
 * Tolerant on purpose: the delete spec's whole subject is removing the note, so by the
 * time this runs the route answers with the not-found screen. `.or()` waits for whichever
 * of the two screens arrives rather than asking `count()` a question the page has not
 * finished answering yet.
 */
async function removeNoteIfPresent(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(
    titleField(page).or(page.getByText(copy.notFound.note)),
  ).toBeVisible();

  if (!(await titleField(page).isVisible())) {
    return;
  }

  // `.first()`: the editor's toolbar Delete comes before the confirm dialog's in the DOM.
  await page
    .getByRole("button", { name: copy.notes.delete.action, exact: true })
    .first()
    .click();
  await confirmDelete(page);
  await page.waitForURL((current) => current.pathname === ROUTES.notes);
}

interface NotesFixtures {
  /**
   * Creates a note through the UI, leaves you in its editor, and deletes it after the
   * test — whether the test passed, failed, or deleted it already. Without this the
   * owner's real account collects a note per run.
   */
  newNote: () => Promise<string>;
}

export const test = base.extend<NotesFixtures>({
  newNote: async ({ page }, use) => {
    const created: string[] = [];

    await use(async () => {
      const url = await createNote(page);
      created.push(url);
      return url;
    });

    for (const url of created) {
      try {
        await removeNoteIfPresent(page, url);
      } catch (error) {
        // Warned, never thrown: a cleanup that failed must not turn a test that passed
        // red, but a leftover note in the owner's real list has to be visible somewhere.
        console.warn(
          `[e2e cleanup] left ${url} in place: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  },
});
