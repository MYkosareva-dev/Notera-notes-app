import { expect } from "@playwright/test";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";

import {
  bodyField,
  deleteFromCard,
  noteLink,
  saveEdit,
  test,
  titleField,
  uniqueTitle,
} from "./support/notes";

/**
 * The three end-to-end flows: create, edit-and-refresh, delete-and-refresh.
 *
 * One file, so they run in one worker in order (playwright.config.ts) — they share the
 * owner's real notes list, and a parallel delete assertion racing a parallel insert is a
 * flake with no bug behind it.
 *
 * Each spec creates the note it acts on through `newNote` rather than reaching for one
 * that happens to be in the account. Two reasons: a suite that depends on pre-existing
 * rows is one the owner can break by tidying her notes, and the delete spec would
 * otherwise destroy real data.
 *
 * Every spec ends on a REFRESH where the requirement asks for one, and that is the part
 * that matters: the editor keeps the user's text in local state (rule 9), so an assertion
 * made without reloading can pass on state that never reached Postgres.
 */
test.describe("notes, end to end", () => {
  test("a new note appears in the notes list", async ({ page, newNote }) => {
    // Lands in the editor of a genuinely new note — the create action redirects there.
    await newNote();

    const title = uniqueTitle("create");
    await saveEdit(page, titleField(page), title);

    await page.goto(ROUTES.notes);
    await expect(noteLink(page, title)).toBeVisible();
  });

  test("an edited body is still there after a refresh", async ({ page, newNote }) => {
    await newNote();

    // The title is how the card is addressed, so it is set first and separately from the
    // body edit that this spec is actually about.
    const title = uniqueTitle("edit");
    await saveEdit(page, titleField(page), title);

    // Opened from the list, not from the URL the create redirect left behind: "open a
    // note" is a click on a card, and that click is part of what is being tested.
    await page.goto(ROUTES.notes);
    await noteLink(page, title).click();
    await expect(titleField(page)).toHaveValue(title);

    const body = `Edited at ${Date.now()}. The refresh below is what makes this a test.`;
    await saveEdit(page, bodyField(page), body);

    await page.reload();
    await expect(bodyField(page)).toHaveValue(body);
  });

  test("a deleted note is gone from the list, and stays gone after a refresh", async ({
    page,
    newNote,
  }) => {
    await newNote();

    const title = uniqueTitle("delete");
    await saveEdit(page, titleField(page), title);

    await page.goto(ROUTES.notes);
    await expect(noteLink(page, title)).toBeVisible();

    await deleteFromCard(page, title);

    // The toast first: it is the app's own confirmation that the action returned `ok`.
    // Without it, a card that vanished because the list failed to load would read as a
    // successful delete.
    await expect(page.getByText(copy.notes.deleted)).toBeVisible();
    await expect(noteLink(page, title)).toHaveCount(0);

    // The refresh is the real assertion — the card disappearing is a client-side
    // revalidation, and only a fresh server render proves the row is gone.
    await page.reload();
    await expect(noteLink(page, title)).toHaveCount(0);
  });
});
