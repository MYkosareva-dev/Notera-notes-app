import { expect, test } from "@playwright/test";

import { copy } from "@/lib/copy";
import { LIMITS } from "@/lib/types";

import {
  composer,
  expectedLabels,
  newChatButton,
  pingMessage,
  sendAndAwaitReply,
  sendButton,
  startFreshConversation,
  transcript,
  turnLabels,
  turns,
} from "./support/chat";

/**
 * The chat page, end to end (SPEC US8).
 *
 * EXACTLY ONE SPEC CALLS A MODEL, and it is the last one. A send spends real credit
 * against the project's $15 cap, so the three properties that can be proved without one —
 * the empty state, the message cap, and that a blocked message is not sent — are proved
 * without one. The last spec is where a real reply is unavoidable, because "did the
 * assistant answer and does the answer survive a reload" cannot be faked.
 *
 * ASSERTIONS ARE STRUCTURAL, NEVER SEMANTIC. The model phrases its reply differently on
 * every run, so a test that read meaning would flake for a reason that is not a bug. What
 * these check is shape: a turn appeared, it is the assistant's, it is non-empty, the
 * labels alternate in the right order, and the same turns are there after a reload. The
 * owner verified the SEMANTIC behaviour by hand during the Block H 5d(b) browser pass —
 * that a pronoun follow-up resolves against the earlier turns — which is where a judgement
 * about meaning belongs.
 *
 * NOTHING HERE CLEANS UP, and it cannot: `chat_messages` has no DELETE policy, so RLS
 * refuses one (SPEC Block C, and the append-only design is the point). Every run of the
 * last spec therefore leaves one conversation in the owner's real account. Each message
 * carries an `E2E` marker so a stray row is obvious, and `support/chat.ts` records the
 * privileged delete that removes them if she ever wants to.
 *
 * Every spec starts from a FRESH conversation rather than whatever `/chat` resumes. The
 * account has real conversations in it that no test can remove, so a spec asserting on
 * turn counts against a resumed one would be asserting against unbounded history.
 */
test.describe("chat, end to end", () => {
  test("a fresh conversation shows the empty state and an idle composer", async ({
    page,
  }) => {
    await startFreshConversation(page);

    // The description is the one thing a user cannot infer from an empty screen: that the
    // conversation resumes when they come back. It was the opposite sentence before
    // persistence landed, so asserting it is also a guard against that copy regressing.
    await expect(page.getByText(copy.chat.empty.description)).toBeVisible();

    // The keyboard affordance is written on screen because Shift+Enter is not guessable.
    await expect(page.getByText(copy.chat.hint)).toBeVisible();

    // Send is disabled on an empty draft.
    await expect(sendButton(page)).toBeDisabled();

    // New chat is ABSENT, not disabled — and the distinction is worth pinning, because
    // `ChatPanel` reads as though it were the other way. Its toolbar (New chat included)
    // lives inside the branch that renders a populated transcript, so on an empty
    // conversation the whole row is gone; the `disabled` state it also carries can only
    // ever be reached while a send is in flight. The behaviour is right — there is nothing
    // to leave, so there is no control — and this assertion is what stops a later "tidy-up"
    // from moving the button out of that branch without noticing it changed the empty
    // screen. (The comment beside `canStartNew` claims "disabled rather than hidden"; it
    // describes an intent the placement does not deliver. Flagged for its own commit — a
    // test branch is not where app comments get fixed.)
    await expect(newChatButton(page)).toHaveCount(0);

    // No transcript at all on an empty conversation — not an empty one.
    await expect(transcript(page)).toHaveCount(0);
  });

  test("a message past the cap is refused with the LIMITS-derived notice, and nothing is sent", async ({
    page,
  }) => {
    await startFreshConversation(page);

    // One character over. The number comes from LIMITS so this spec cannot drift from the
    // cap it is testing (rule 11), and the copy is derived from the same constant — which
    // is the other half of what Block F asks for.
    await composer(page).fill("x".repeat(LIMITS.chatMessageMax + 1));

    await expect(page.getByText(copy.limits.chatMessageTooLong)).toBeVisible();

    // The keystroke is REJECTED rather than truncated (`handleDraftChange`), so the
    // controlled value never takes the over-long string. Asserting the field is empty is
    // what distinguishes "blocked" from "silently trimmed to 2,000" — the latter is what
    // `maxLength` would have done, and the app deliberately does not use it.
    await expect(composer(page)).toHaveValue("");

    // And therefore nothing could have been sent: Send is disabled on an empty draft, and
    // the transcript never appeared. This is the assertion that makes the test about the
    // cap rather than about a toast.
    await expect(sendButton(page)).toBeDisabled();
    await expect(transcript(page)).toHaveCount(0);
  });

  test("a sent message gets a reply, both exchanges survive a reload, and New chat clears them", async ({
    page,
  }) => {
    await startFreshConversation(page);

    // TWO exchanges, not one. Four turns is what proves the ordering is real: a single
    // exchange cannot tell a correct transcript from one that renders the reply above the
    // question, and the second send is also the only path that carries history to the
    // model. Both prompts ask for one short word, which keeps the completion — the
    // expensive half — to a few tokens.
    await sendAndAwaitReply(page, pingMessage("first"), { viaKeyboard: true });
    await sendAndAwaitReply(page, pingMessage("second"), { viaKeyboard: false });

    await expect(turnLabels(page)).toHaveText(expectedLabels(2));

    // THE RELOAD IS THE REAL ASSERTION. Everything above it is true of a transcript held
    // in React state, which is exactly what the app had before persistence existed — so
    // without a reload this spec would pass on a page that stores nothing. A fresh
    // document re-renders from `loadLatestConversation`, so what survives here came out of
    // Postgres, in the order `seq` gave it.
    await page.reload();

    await expect(turns(page)).toHaveCount(4);
    await expect(turnLabels(page)).toHaveText(expectedLabels(2));

    // New chat's clearing behaviour needs a NON-EMPTY transcript, and this is the only
    // place in the suite that has one without a second model call: the rows it clears are
    // the ones this spec just made. Kept here rather than as its own spec for that reason
    // — a separate one would either depend on this spec having run or reach for
    // pre-existing conversations, and the notes suite already records why neither is safe.
    await newChatButton(page).click();

    await expect(page.getByText(copy.chat.empty.title)).toBeVisible();
    await expect(turns(page)).toHaveCount(0);

    // AND NOW THE RELOAD PROVES THE ROWS SURVIVED THE CLEAR — by bringing them back.
    //
    // This asserts SPEC G-44, which is easy to get backwards: reloading here does NOT
    // land on the empty conversation. **New chat** only clears the screen and drops the
    // client's conversation id; the new conversation has no rows, so it has no identity to
    // resume, and `loadLatestConversation` returns the newest conversation that DOES have
    // rows — the four turns above. The first draft of this spec expected the empty state
    // here and would have failed against correct, documented behaviour.
    //
    // Which makes this the cheapest available proof that New chat deletes nothing: the
    // turns it cleared from the screen are still in Postgres a document later.
    await page.reload();

    await expect(turns(page)).toHaveCount(4);
    await expect(turnLabels(page)).toHaveText(expectedLabels(2));
  });
});
