"use server";

import { revalidatePath } from "next/cache";

import { sendChat } from "@/lib/chat";
import { ROUTES } from "@/lib/routes";
import type { ChatFailure } from "@/lib/openrouter/server";
import type { ChatSendResult } from "@/lib/types";

/**
 * The chat screen's one Server Action (SPEC US8).
 *
 * The same two rules that shape app/notes/actions.ts shape this file, plus a third
 * that is specific to it:
 *
 * 1. **No model access here.** Everything goes through `lib/chat.ts`, which calls
 *    `getUser()` first and refuses without a verified user. This file never imports
 *    `lib/openrouter/server.ts` for a call of its own — the chokepoint is the point,
 *    exactly as rule B3b makes `lib/notes.ts` the only door to the `notes` table.
 * 2. **This export is a public POST endpoint.** Anyone can invoke it with any payload,
 *    so the argument is typed `unknown` and narrowed at runtime by the layer below,
 *    rather than trusted because TypeScript typed it.
 * 3. **Every call costs money.** That makes this the one action in the app where an
 *    unauthenticated or oversized request is a bill and not just an error, and it is
 *    why the user check and the two caps in `lib/chat.ts` run before the `fetch`.
 *
 * `revalidatePath` IS called now, and only on a send that stored something — the
 * persistence amendment is what changed that. It was correctly absent while chat wrote
 * nothing: rule B1 governs WRITES, and there was no row to make a cached path stale.
 * The reasoning and the measured cost are at the call itself, below.
 *
 * NOT debounced either, for the same reason and one more. Rule B2's debounce exists
 * because per-keystroke writes to shared state caused input lag; a chat message is
 * sent by an explicit submit, once, and a debounce on a paid call would only make the
 * spend harder to predict.
 */

/**
 * The server-side log for a failed model call.
 *
 * The `detail` string never crosses the wire (see `sendChat`), so this is the only
 * place the real upstream reason is recorded — and for a `misconfigured` fault it is
 * the only place the owner can learn WHICH of the three it was, since all three
 * collapse into one code for the user.
 *
 * `error` rather than `warn`: unlike `callAction`'s offline case, every failure here
 * is either a fault in the app's own configuration or an upstream outage, and both are
 * things the person running the app should see loudly. Logged with the failure code
 * and the detail only — never the transcript, which is the user's own text.
 */
function logChatFailure(failure: ChatFailure, detail: string): void {
  console.error(`[chat/sendMessage] ${failure}: ${detail}`);
}

/**
 * Send the conversation and return the assistant's next turn.
 *
 * Both arguments are `unknown` on purpose. The whole conversation still arrives on every
 * call — the prompt is built from what the client sends, not from what is stored (SPEC
 * US8), so the history is a client-supplied value and is treated as one: `lib/chat.ts`
 * decides whether it is a transcript at all, and refuses a `role: "system"` turn
 * outright. `conversationId` is the same: `null` starts a new conversation, and anything
 * that is neither `null` nor a uuid is refused rather than quietly treated as new.
 */
export async function sendMessage(
  transcript: unknown,
  conversationId: unknown,
): Promise<ChatSendResult> {
  const result = await sendChat(transcript, conversationId, {
    onFailure: logChatFailure,
  });

  // THE ONE THING THIS ACTION DOES BEYOND DELEGATING, and it is here because the
  // persistence layer is what earns it. `/chat` now RENDERS from the database, so the
  // client Router Cache holds a payload that a completed exchange has just made stale:
  // navigate to `/notes` and back, and `ChatPanel` would mount with an older
  // conversation. Revalidating is what invalidates that.
  //
  // Only on a send that actually STORED something. A failed send writes nothing, and a
  // reply that could not be saved leaves the database exactly as the cached payload
  // already describes it — so in both cases there is nothing to invalidate, and calling
  // it anyway would be pure cost.
  //
  // THE COST, measured at the Phase 6 gate on `saveNote` and unchanged here: revalidating
  // any path makes Next render the current route's flight data beside the action result,
  // so this POST answers with an RSC tree `ChatPanel` discards (its transcript is local
  // state after mount) — about 6.4 kB where a bare result is ~40 bytes — and that render
  // runs `/chat`'s own data path again, which is another `getUser()` plus another select.
  // Per MESSAGE, not per keystroke, against a model call that already took seconds; and
  // rule B1 names `revalidatePath` as part of the one mutation pipeline, so dropping it
  // from a write path is a spec change rather than an optimisation. It inherits the same
  // post-sprint debt item as `saveNote`.
  if (result.ok && result.persisted) {
    revalidatePath(ROUTES.chat);
  }

  return result;
}
