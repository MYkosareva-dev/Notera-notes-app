import { expect, type Locator, type Page } from "@playwright/test";

import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";

/**
 * Locators and flows for the chat specs.
 *
 * EVERY USER-FACING STRING COMES FROM `lib/copy.ts`, for the reason `support/notes.ts`
 * gives: a test that hardcodes a label keeps passing after the copy changes and silently
 * stops testing what the user sees. Nothing here types a literal the app also types.
 *
 * TWO THINGS ARE DIFFERENT FROM THE NOTES HELPERS, and both shape what the specs can do.
 *
 * **1. There is no cleanup, because the table will not allow one.** `chat_messages` has
 * SELECT and INSERT policies and no UPDATE or DELETE policy, so RLS refuses a delete
 * outright — that is the append-only design (SPEC Block C), not an oversight. So unlike
 * `newNote`, nothing here can undo what a spec writes: every run that sends a message
 * leaves a conversation in the owner's real account permanently. Two things follow.
 * Every message this suite sends carries an `E2E` marker and a timestamp, so a stray row
 * is obvious in the SQL Editor. And the only way to remove them is a privileged delete
 * there, which is the owner's to run and deliberately not something the suite can do:
 *
 *     delete from public.chat_messages where content like 'E2E %';
 *
 * **2. Exactly one spec may call a model.** A send spends real credit, so the marker
 * doubles as a cost control: the prompt asks for a one-word answer, which keeps the
 * completion — the expensive half — at a few tokens.
 */

/** Distinct per run, recognisable in the owner's real data, and cheap to answer. */
export function pingMessage(label: string): string {
  return `E2E ${label} ${Date.now()}: reply with one short word.`;
}

/**
 * The transcript. A live region with an accessible name (`ChatPanel`), which is also how
 * a screen-reader user finds it — so addressing it by role here tests the same handle.
 *
 * It only exists once there is something to show: on an empty conversation `ChatPanel`
 * renders the empty state instead, so a spec that expects this on a fresh screen is
 * asserting the wrong thing.
 */
export function transcript(page: Page): Locator {
  return page.getByRole("log", { name: copy.chat.logLabel });
}

/**
 * The turns, in document order.
 *
 * CAUTION, and it is the reason no spec counts these while a send is in flight: the
 * pending "Thinking…" row is an `<li>` in this same list. During a send the count is
 * therefore identical to the count after the reply lands — user turn plus one more —
 * so a count alone cannot tell "waiting" from "answered". `sendAndAwaitReply` settles
 * that by asserting the pending row is GONE before it reads anything.
 */
export function turns(page: Page): Locator {
  return transcript(page).locator("li");
}

/**
 * The `You` / `Assistant` label above each bubble — the first child of every turn.
 *
 * These are what the order assertions read, and reading the LABELS rather than the
 * bubble text is deliberate: the model phrases its reply differently on every run, so
 * anything that asserted on meaning would flake for no reason. Who spoke, and in what
 * order, is structural and stable.
 */
export function turnLabels(page: Page): Locator {
  return transcript(page).locator("li > span");
}

/** The bubbles themselves, for the one thing worth asserting about content: non-empty. */
export function turnBubbles(page: Page): Locator {
  return transcript(page).locator("li > div");
}

/** The composer. Borderless with no visible label, so `aria-label` is its name. */
export function composer(page: Page): Locator {
  return page.getByLabel(copy.chat.inputLabel);
}

/** Icon-only, so its accessible name is the `sr-only` text rather than a visible label. */
export function sendButton(page: Page): Locator {
  return page.getByRole("button", { name: copy.chat.send });
}

export function newChatButton(page: Page): Locator {
  return page.getByRole("button", { name: copy.chat.newChat });
}

/** The pending row's text. Present only between submit and reply. */
export function thinkingRow(page: Page): Locator {
  return page.getByText(copy.chat.thinking);
}

/**
 * Open `/chat` on an EMPTY conversation, whatever was there before.
 *
 * Necessary rather than tidy: `/chat` resumes the user's newest conversation, and this
 * account has real ones in it — from the owner's own browser pass and from every previous
 * suite run, none of which can be deleted. A spec that asserted "four turns" against a
 * resumed conversation would be asserting against unbounded history.
 *
 * **New chat** is pressed only when there is a transcript to leave, because on an empty
 * conversation the button does not exist — `ChatPanel` renders its whole toolbar inside
 * the populated branch. So the two cases are "something was resumed" and "nothing was",
 * and both end in the same state. Asserting the empty state at the end is what makes this
 * a precondition rather than a hope.
 */
export async function startFreshConversation(page: Page): Promise<void> {
  await page.goto(ROUTES.chat);

  // The composer is the cheapest proof the page mounted: it is present in both the empty
  // and the populated branch, whereas the transcript and the empty state are exclusive.
  await expect(composer(page)).toBeVisible();

  // Wait for WHICHEVER branch rendered before deciding — the `.or()` pattern the notes
  // helpers use for the same reason: asking `count()` a question the page has not finished
  // answering is how this races on a slow first compile.
  await expect(page.getByText(copy.chat.empty.title).or(transcript(page))).toBeVisible();

  // Presence, not enabled-ness. On an empty conversation the button does not exist at all
  // (it is inside `ChatPanel`'s populated branch), and `isEnabled()` on a locator that
  // matches nothing throws rather than returning false — which would have made this
  // helper fail on a brand-new account with no conversation to resume.
  if (await transcript(page).isVisible()) {
    await newChatButton(page).click();
  }

  await expect(page.getByText(copy.chat.empty.title)).toBeVisible();
  await expect(turns(page)).toHaveCount(0);
}

/**
 * Send one message and do not return until the assistant's turn is on screen.
 *
 * WAITS FOR THE ACTION'S POST, not for text — the lesson `saveEdit` already paid for in
 * the notes suite. Here the trap is a different shape but the same class: "Thinking…"
 * appears and then leaves, so polling for it races the reply, and the turn count is the
 * same during the wait as after it (see `turns`). The POST is the one event that means
 * "the server answered".
 *
 * A Server Action posts to the URL it was invoked from, so the response is matched on
 * this page's own URL. The timeout is generous because a real model call is seconds, not
 * milliseconds, and the connection's own ceiling is 30 s (`TIMEOUT_MS`).
 *
 * `viaKeyboard` picks which affordance sends: Enter, or the button. Both are real paths
 * a user takes and the specs use one of each, so neither goes untested.
 */
export async function sendAndAwaitReply(
  page: Page,
  text: string,
  { viaKeyboard }: { viaKeyboard: boolean },
): Promise<void> {
  const actionUrl = page.url();
  const before = await turns(page).count();

  const posted = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url() === actionUrl,
    { timeout: 60_000 },
  );

  await composer(page).fill(text);
  if (viaKeyboard) {
    await composer(page).press("Enter");
  } else {
    await sendButton(page).click();
  }

  // The user's turn is appended before the call goes out (rule B2's promise about typed
  // text, applied to a transcript), so it is on screen already and worth asserting here:
  // if it were not, the reply assertion below would be measuring the wrong list.
  await expect(turns(page)).toHaveCount(before + 2); // user turn + the pending row

  await posted;

  // The pending row must be GONE before anything is counted or read — see `turns`.
  await expect(thinkingRow(page)).toHaveCount(0);
  await expect(turns(page)).toHaveCount(before + 2); // user turn + the assistant's

  // Structural only: the last turn is the assistant's and it said something. What it
  // said is not this suite's business.
  await expect(turnLabels(page).last()).toHaveText(copy.chat.assistant);
  await expect(turnBubbles(page).last()).not.toBeEmpty();

  // The composer clears on submit, and a spec that sends twice depends on it.
  await expect(composer(page)).toHaveValue("");
}

/** The expected label sequence for `n` completed exchanges: You, Assistant, You, … */
export function expectedLabels(exchanges: number): string[] {
  return Array.from({ length: exchanges }, () => [copy.chat.you, copy.chat.assistant]).flat();
}
