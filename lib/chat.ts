import "server-only";

import {
  chat,
  DEFAULT_MODEL,
  type ChatFailure,
  type ChatMessage,
} from "@/lib/openrouter/server";
import { copy } from "@/lib/copy";
import { appendExchange } from "@/lib/chatMessages";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import {
  LIMITS,
  type ChatSendFailure,
  type ChatSendResult,
  type ChatTurn,
} from "@/lib/types";

/**
 * The chat layer — fence 1 for `/chat`, and the exact counterpart of `lib/notes.ts`
 * for a resource that is not a table.
 *
 * WHY IT EXISTS AT ALL, given `lib/openrouter/server.ts` already knows how to call a
 * model: that module is the CONNECTION and has no opinion about who may use it. This
 * one is the gate. It calls `getUser()` before anything else and refuses without a
 * verified user, so no model call in this app can happen for an anonymous caller —
 * the same property rule B3b gives note reads, applied to the one endpoint that
 * spends money. `app/chat/layout.tsx` is fence 2 and issues the redirect; as
 * `app/notes/layout.tsx` records, a redirecting layout does not stop the sibling page
 * from rendering, and it does not re-run on a client navigation at all, so it cannot
 * be the authoritative one. `proxy.ts` is fence 3 and is never trusted.
 *
 * `server-only` is the line that makes that claim structural rather than customary:
 * the build fails if a Client Component imports this file, which is what keeps
 * `OPENROUTER_API_KEY` — reachable from here through two imports — on the server.
 *
 * WHAT THIS MODULE DOES NOT DO, so its scope is not overread:
 *
 * - **It does not touch a table itself.** Storage is `lib/chatMessages.ts`, the chat
 *   DAL, and this module calls it exactly once — after the model has answered. Rule
 *   B3b's chokepoint is intact in both directions: `lib/notes.ts` is still the only
 *   door to `public.notes`, and `lib/chatMessages.ts` is now the only door to
 *   `public.chat_messages`. Neither knows about the other.
 * - **It still holds no conversation state of its own.** The transcript arrives whole
 *   on every send and is not read back from the database to build the prompt — the
 *   history the model sees is the client's array, exactly as it was before
 *   persistence existed. Storage is a consequence of a send, never an input to one.
 *   That is what keeps the memory behaviour unchanged by this layer.
 * - **It does not retry.** A retry against a metered endpoint is a spending decision,
 *   and it belongs to the person who can see the failure. `ChatPanel` offers a button
 *   (`copy.chat.retry`); nothing here fires a second call on its own. Same reasoning
 *   that kept rule B8's ladder in `NoteEditor` rather than in `callAction`, with one
 *   extra reason: money.
 *
 * THE TRUST BOUNDARY, stated plainly because a chat transcript looks more trusted
 * than it is. Every turn below — the assistant's included — arrives from the client
 * and can be forged: a hand-built POST can claim the assistant said anything, and the
 * model will read it as history. That is accepted, and here is the whole of why it is
 * safe to accept. The forgery buys nothing but a different reply, to the forger, in
 * their own conversation: the model has no tools, reads no notes, cannot write
 * anywhere, and its output is rendered as a JSX text node (Block A prohibits
 * `dangerouslySetInnerHTML`). What a forged transcript CAN do is cost credit, and
 * that is what the two caps are for — they are the real control, not the type.
 * The one thing a caller may NOT do is set `role: "system"`: see `isChatTurn`.
 */

/**
 * The instructions the model is given, prepended server-side on every send.
 *
 * IN THIS FILE RATHER THAN lib/copy.ts, and the line is worth drawing precisely. Rule
 * 10 covers every user-VISIBLE string, and this one is never rendered — it is a model
 * parameter, in the same category as `DEFAULT_MODEL`. Putting it in `copy.ts` would
 * also put it one import away from a Client Component, which is exactly where a
 * system prompt should not be: not because it is a secret, but because `copy.ts` is
 * shipped to the browser and this string has no business being edited there.
 *
 * The app name comes from `copy.app.name` rather than being typed again (rule 11) —
 * the same reason `lib/openrouter/server.ts` reads it for its `X-Title` header.
 */
const SYSTEM_PROMPT =
  `You are the assistant inside ${copy.app.name}, a private notes app. ` +
  "Be concise and direct. Answer in plain prose without headings unless the user asks " +
  "for a list. You have no access to the user's notes, their account or any tool — if " +
  "you are asked what a note says, say that plainly rather than guessing.";

/**
 * One turn, checked rather than trusted. This is the runtime half of `ChatTurn`.
 *
 * `role` is compared against the two literals, which is the point: `"system"` is a
 * legal `ChatRole` for the connection module and must be REFUSED here, because a
 * caller who can inject a system message can replace `SYSTEM_PROMPT` above. This
 * comparison is the fence; the TypeScript type only documents it.
 *
 * **THE LENGTH CAP IS PER ROLE, and the first version of this function got that wrong
 * in a way that persistence would have made permanent.** It capped EVERY turn at
 * `LIMITS.chatMessageMax` (2,000) — the composer's cap. But an assistant reply is
 * routinely longer than 2,000 characters, and replies go back as history on the next
 * send, so one long answer made `isTranscript` refuse the whole conversation and every
 * later message failed as `invalid` — a code that deliberately offers no Retry, because
 * the same bytes would be refused again. It was self-healing only because nothing was
 * stored: a reload cleared the poisoned turn. Storing the transcript would have made a
 * conversation permanently unsendable from its first long reply. Confirmed by lifting
 * this predicate out and asserting on it before the fix.
 *
 * So: a USER turn is capped at what the composer allows, because that is a public POST
 * and `maxLength` in a browser is not a control. An ASSISTANT turn is capped at
 * `LIMITS.chatReplyMax`, the same bound the database puts on a stored reply — high
 * enough that no answer this model can physically produce hits it. What actually bounds
 * the spend is the TOTAL, in `isTranscript`.
 *
 * Content is bounded at both ends either way. Empty (or whitespace-only) is refused
 * because a blank turn is a paid round-trip that says nothing. Note the RAW length is
 * what is capped, not the trimmed one — a caller cannot buy a longer prompt by padding
 * it with spaces.
 */
function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as { role?: unknown; content?: unknown };
  if (role !== "user" && role !== "assistant") return false;
  if (typeof content !== "string") return false;
  if (content.trim().length === 0) return false;
  const max = role === "user" ? LIMITS.chatMessageMax : LIMITS.chatReplyMax;
  return content.length <= max;
}

/**
 * The transcript rule: a non-empty array of well-formed turns whose LAST entry is the
 * message being sent, i.e. the user's.
 *
 * The `at(-1)` check is not pedantry — without it a caller can post a transcript
 * ending in an assistant turn, which asks the model to continue its own sentence and
 * produces a reply that answers nothing. It also pins down what a send MEANS: exactly
 * one new user message, with history behind it.
 *
 * Roles are deliberately NOT required to alternate. A user who sends a second message
 * before the first reply arrives produces a legitimate `user, user` pair, and
 * rejecting it would break the screen to enforce a shape the model does not need.
 */
function isTranscript(value: unknown): value is ChatTurn[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0 || value.length > LIMITS.chatTurnsMax) return false;
  if (!value.every(isChatTurn)) return false;

  // THE SPEND CONTROL, and the reason `chatTurnsMax` alone was never one: forty turns
  // of legitimately long assistant replies is an unbounded prompt, and the per-turn caps
  // above cannot fix that without refusing real replies. So the budget is on the sum.
  // `ChatPanel` trims what it sends to fit this; the check here is what answers a POST
  // that did not.
  const characters = value.reduce(
    (total: number, turn: ChatTurn) => total + turn.content.length,
    0,
  );
  if (characters > LIMITS.chatTranscriptMax) return false;

  return value.at(-1)?.role === "user";
}

/**
 * What the app can do about what OpenRouter answered.
 *
 * The three CONFIGURATION faults collapse into one code on purpose. A missing key, an
 * empty account and a dead model id are three different jobs for the owner and the
 * same sentence for the user — "retrying will not help, and you are not the one who
 * can fix it". Which of the three it was stays in the server log, where the person
 * who can act on it will be looking (see `logChatFailure` in app/chat/actions.ts).
 */
function chatSendFailureFor(failure: ChatFailure): ChatSendFailure {
  switch (failure) {
    case "unauthorized":
    case "outOfCredit":
    case "unknownModel":
      return "misconfigured";
    case "rateLimited":
      return "rateLimited";
    case "timeout":
      return "timeout";
    case "unavailable":
    case "empty":
      return "unavailable";
  }
}

/**
 * Send a conversation and return the assistant's next turn.
 *
 * ORDER IS THE SECURITY PROPERTY of this function, so it is written to be read
 * top-to-bottom: the user check comes before the shape check, and both come before
 * anything that costs money. An unauthenticated caller never reaches validation, and
 * an invalid payload never reaches OpenRouter.
 *
 * Never throws for an expected failure — every one comes back as a code, so the
 * Server Action above it needs no try/catch and the client can branch on the reason
 * (the pattern `lib/notes.ts` and `lib/openrouter/server.ts` both follow). It CAN
 * still throw on first import, from `lib/openrouter/env.ts`, when the key is missing
 * or has been exposed under a `NEXT_PUBLIC_` name: that is a boot-time configuration
 * fault and must be loud.
 *
 * The `detail` on a failed call is deliberately dropped rather than returned: it is
 * upstream error text meant for a terminal, it is not in lib/copy.ts, and it can
 * quote the prompt back — which here is the user's own words. The caller logs it via
 * the `onFailure` hook below; the wire carries only the code.
 */
export async function sendChat(
  transcript: unknown,
  conversationId: unknown,
  {
    onFailure,
  }: { onFailure?: (failure: ChatFailure, detail: string) => void } = {},
): Promise<ChatSendResult> {
  // FENCE 1. `getUser()` revalidates the token against the Auth server; `getSession()`
  // reads the cookie without validating it and is prohibited for access decisions
  // (rule 2). Called here directly rather than through a cached wrapper, for the
  // reason app/notes/layout.tsx records: wrapping it would collapse this fence into
  // fence 2. Reported as a failure rather than a redirect because a Server Action that
  // redirects never returns its result, and the client needs to show the sign-in
  // notice over the text the user typed (the same reason `updateNote` reports G-1).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, failure: "sessionExpired" };
  }

  if (!isTranscript(transcript)) {
    return { ok: false, failure: "invalid" };
  }

  // The conversation to append to, narrowed like any other part of a POST body. `null`
  // and absent both mean "start a new one", which the DAL mints server-side; anything
  // that is not a uuid is a malformed request rather than a new conversation, because
  // treating it as one would quietly hide a client bug that loses history.
  //
  // A well-formed id is NOT checked for ownership here, and does not need to be: every
  // read filters by `user_id` and the insert writes the caller's own owner id, so a
  // forged id can only file the caller's own messages under a name of their choosing.
  // `appendExchange` records the same reasoning at the write.
  if (conversationId !== null && conversationId !== undefined) {
    if (typeof conversationId !== "string" || !isUuid(conversationId)) {
      return { ok: false, failure: "invalid" };
    }
  }
  const target = typeof conversationId === "string" ? conversationId : null;

  // The system message is built HERE and prepended, so it cannot be supplied, replaced
  // or reordered by the caller. `transcript` is already narrowed to turns whose role is
  // `user` or `assistant`, which is what makes this concatenation safe to type as
  // `ChatMessage[]`.
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...transcript,
  ];

  const result = await chat(messages, { model: DEFAULT_MODEL });

  if (!result.ok) {
    onFailure?.(result.failure, result.detail);
    // NOTHING IS STORED ON A FAILED SEND, and that is what makes **Retry** safe. See
    // `appendExchange`: writing the question before the call would leave an unanswered
    // row behind, and the retry would insert a second copy of it.
    return { ok: false, failure: chatSendFailureFor(result.failure) };
  }

  // The exchange is stored only now, after the reply exists. `transcript.at(-1)` is the
  // user's message — `isTranscript` has already established that the last turn is theirs,
  // which is what makes this read safe without a second check.
  const question = transcript.at(-1)?.content ?? "";
  const stored = await appendExchange(target, question, result.text);

  // A WRITE FAILURE IS NOT A FAILED SEND. The reply exists and the account has been
  // billed for it, so it is returned either way; `persisted: false` is what lets the
  // client show the answer AND warn that the conversation was not saved. Reporting
  // `unavailable` here would discard something already paid for, and reporting plain
  // success would let the user discover the loss on their next reload.
  return {
    ok: true,
    reply: result.text,
    model: result.model,
    conversationId: stored,
    persisted: stored !== null,
  };
}
