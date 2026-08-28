// Shared domain types and limits. SPEC Block C is the source of truth for both.
// Import LIMITS wherever a cap is needed — never redeclare a number (CLAUDE.md rule 11).

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string; // ISO 8601
  updated_at: string;
}

/**
 * What a note looks like OUTSIDE the data-access layer: the row minus its owner.
 *
 * Every read in `lib/notes.ts` returns this. `Note` above stays the internal row
 * shape, so `user_id` never reaches a component — and therefore never becomes the
 * obvious thing to send back in a mutation. SPEC rule B3b forbids a Server Action
 * trusting a client-supplied user id; this makes the type system say so too. The
 * DAL still filters every query with `.eq('user_id', user.id)` (rule B4) — the id
 * simply comes from `getUser()` rather than from the wire.
 */
export type NoteView = Omit<Note, "user_id">;

/**
 * The fields a caller may change. Ownership and timestamps are not among them:
 * `user_id` comes from `getUser()` and `updated_at` from the Postgres trigger
 * (SPEC Block C), so neither is patchable by anyone.
 *
 * `tags` is a WHOLE-ARRAY replacement, not an add/remove instruction, because that
 * is what the debounced pipeline needs: `TagEditor` commits and removes chips in
 * local state (rule B2) and the save that follows sends the resulting array, so two
 * chips added inside one debounce window are one write rather than two. It also
 * keeps the patch idempotent — a retry after a failed save re-sends the same array
 * instead of appending a second copy of the tag (rule B8 retries the CURRENT draft).
 */
export interface NotePatch {
  title?: string;
  content?: string;
  tags?: string[];
}

/**
 * Why an operation refused. One union, shared by the DAL (which throws it), the
 * Server Actions (which return it) and `NoteEditor` (which maps each case to copy
 * and to a behaviour).
 *
 * Notes are what it was written for and what all five cases describe. One non-notes
 * action now shares it — `setThemePreference`, which uses `invalid` for a payload
 * that is not one of the three theme words and can never produce the other four.
 * Kept shared rather than split: `callAction` returns this shape for a transport
 * failure whoever the caller is, so a second union would have to duplicate
 * `unavailable` to say the same thing. Worth revisiting if a third such action
 * appears.
 *
 * Discriminated rather than a bare message, for the reason SPEC rule B8 and edge
 * case G-1 need: "the save failed" is three different situations. `unavailable`
 * is the retryable one (retry ×3, then the persistent banner), `sessionExpired`
 * has to stop retrying and offer a sign-in, and `notFound` means the note is gone
 * and the editor should leave. Only the client turns a case into a string, so no
 * user-visible copy crosses the wire (rule 10).
 */
export type NoteFailure =
  /** No verified user — fence 1 refused. SPEC G-1: session expired mid-edit. */
  | "sessionExpired"
  /** No such row for this user: deleted elsewhere, foreign, or a malformed id (G-13/G-14/G-15). */
  | "notFound"
  /** SPEC rule B7 — `LIMITS.notesPerUser` reached. */
  | "limitReached"
  /** The payload broke a Block F rule. The UI blocks these; a direct POST does not. */
  | "invalid"
  /** Network or Postgres failure — the retryable case (rule B8). */
  | "unavailable";

/** A Server Action's failure result. Success is `{ ok: true }`, or a redirect. */
export interface ActionFailure {
  ok: false;
  failure: NoteFailure;
}

export type ActionResult = { ok: true } | ActionFailure;

export const LIMITS = {
  titleMax: 200,
  contentMax: 50_000,
  tagMax: 24, // characters per tag
  tagsPerNote: 10,
  notesPerUser: 1_000,

  // Chat caps (SPEC US8 / Block F). Both exist because `sendMessage` is a publicly
  // callable POST that SPENDS CREDIT on every call — the only endpoint in this app
  // where an oversized payload costs money rather than just time. They are the reason
  // the transcript may be client-held at all.
  chatMessageMax: 2_000, // characters in one USER message
  chatTurnsMax: 40, // messages of history that travel with a send, newest kept

  /**
   * The upper bound on ONE STORED ASSISTANT REPLY, and it is deliberately nowhere near
   * `chatMessageMax`.
   *
   * A reply's length is the model's to decide, not the app's. `openai/gpt-4o-mini` can
   * emit up to 16,384 output tokens — on the order of 65,000 characters — so capping a
   * reply at the user's 2,000 would refuse a perfectly good answer AFTER the call had
   * been paid for. This sits above anything that model can physically produce while
   * still refusing a runaway, and it is the `check` constraint on
   * `public.chat_messages.content` for `role = 'assistant'`.
   */
  chatReplyMax: 100_000,

  /**
   * The total characters one send may carry, history included.
   *
   * THIS is the real spend control, and `chatTurnsMax` alone was not one: 40 turns of
   * unbounded assistant replies is an unbounded prompt. A per-turn cap cannot do this
   * job either, for the reason `chatReplyMax` exists — the replies in a transcript are
   * legitimately long. So the budget is on the sum.
   *
   * ~20k tokens, comfortably inside the model's 128k context. `ChatPanel` trims the
   * history it sends to fit this AND `chatTurnsMax`, keeping the newest turns; the
   * server re-checks both, because a Server Action is a public POST.
   */
  chatTranscriptMax: 80_000,

  /**
   * How many turns of a stored conversation `/chat` loads on render.
   *
   * Higher than `chatTurnsMax` on purpose: what the SCREEN shows and what the MODEL is
   * given are two different questions. The screen can afford the scrollback; the model's
   * share is bounded by the two caps above. A conversation longer than this loads its
   * newest turns and loses its beginning on screen (SPEC US8).
   */
  chatHistoryMax: 200,
} as const;

/**
 * One turn of a chat conversation, as it travels between the browser and the server.
 *
 * `role` DELIBERATELY EXCLUDES `"system"`, and that omission is the security property
 * of this type rather than a convenience. `ChatMessage` in lib/openrouter/server.ts
 * allows all three roles because the module that talks to the model needs to send a
 * system message; this type is the shape a PUBLIC POST body may take, and a caller who
 * could set `role: "system"` could rewrite the instructions the model is given. The
 * system message is therefore built server-side, in lib/chat.ts, and is never something
 * the wire can carry. TypeScript states the rule; `isChatTurn` there enforces it,
 * because a POST body is not typed by the compiler.
 *
 * THE WIRE SHAPE, not the row shape — the same split `NoteView` makes for a note. Chat
 * turns ARE persisted (`public.chat_messages`, added by the chat-persistence amendment)
 * and the stored row carries `id`, `user_id`, `conversation_id`, `seq` and `created_at`
 * as well. None of them appears here, and that is deliberate: `lib/chatMessages.ts`
 * hands out `conversation_id, role, content` and the panel keeps only the last two, so a
 * turn on screen has an identical shape whether it was just typed or just read back. It
 * also means `user_id` never reaches a component and therefore never becomes the obvious
 * thing to send back in a mutation (rule B3b).
 */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Why a chat send refused. A separate union from `NoteFailure`, and the split is
 * deliberate — `NoteFailure`'s docblock invited a third sharer to be considered, and
 * this is the case that should NOT share.
 *
 * Three of its five cases (`notFound`, `limitReached`, plus the note-shaped meaning of
 * `invalid`) can never occur here, and two cases this needs have no counterpart there:
 * a model call can be rate-limited upstream and it can be MISCONFIGURED in a way no
 * user action fixes. Folding those into `unavailable` would tell the user to try again
 * against a wall — the honest split is the point, exactly as it is for rule B8's three
 * suspended states.
 *
 * `ChatFailure` in lib/openrouter/server.ts is the transport-level union this maps
 * FROM. Two names for two layers on purpose: that one describes what OpenRouter
 * answered, this one describes what the app can do about it, and the mapping between
 * them lives in one function (`sendFailureFor` in lib/chat.ts).
 */
export type ChatSendFailure =
  /** No verified user — fence 1 refused before any model call. Same shape as G-1. */
  | "sessionExpired"
  /** The transcript broke a Block F chat rule. The composer blocks these; a POST does not. */
  | "invalid"
  /** Rate limited upstream. The one failure where waiting and retrying is the right move. */
  | "rateLimited"
  /** The model took longer than the connection's timeout. Retryable, and cheaply. */
  | "timeout"
  /** Network, 5xx, unparseable JSON, or a 200 with no text. Retryable. */
  | "unavailable"
  /**
   * The key is missing/revoked, the account is out of credit, or the model id no
   * longer routes. A CONFIGURATION fault: retrying changes nothing, and the fix
   * belongs to whoever runs the app, so the user is told that rather than "try again".
   */
  | "misconfigured";

/**
 * A chat send's result. `reply` is the assistant's text; `model` is which model
 * answered, kept because `DEFAULT_MODEL` can change under the app and a reply with no
 * attribution is unattributable after the fact. Neither ever contains the API key —
 * see lib/openrouter/server.ts, property 1.
 *
 * `conversationId` and `persisted` are the persistence layer, and they are on the
 * SUCCESS arm rather than being a failure of their own, which is the whole point:
 *
 * - **`persisted: false` is a successful send whose storage failed.** The reply exists
 *   and has already been paid for, so reporting the send as failed would throw away
 *   something the account was billed for, and reporting it as an unqualified success
 *   would let the user find out on reload that the conversation was never saved. It is
 *   one state and it needs its own word. `ChatPanel` shows the reply and warns.
 * - **`conversationId` is `null` exactly when `persisted` is false.** With nothing
 *   stored there is no conversation to continue, so the next send starts a new one —
 *   which is honest: a conversation with no rows behind it does not exist. The two
 *   fields are not independent, and a caller that reads only one of them still behaves
 *   correctly.
 */
export type ChatSendResult =
  | {
      ok: true;
      reply: string;
      model: string;
      /** The conversation the exchange landed in; `null` when nothing was stored. */
      conversationId: string | null;
      /** False when the model answered but the write failed. See above. */
      persisted: boolean;
    }
  | { ok: false; failure: ChatSendFailure };

/**
 * Why a chat READ refused. A strict subset of `ChatSendFailure`, written out rather than
 * derived with `Extract<>`, because the two unions answer different questions and a
 * derived type would silently grow the day the send union does.
 *
 * There is no `invalid` here: a read takes no payload. There is no `misconfigured`,
 * `rateLimited` or `timeout` either — reading a conversation touches no model, which is
 * exactly why `lib/chatMessages.ts` does not import one.
 */
export type ChatLoadFailure =
  /** No verified user — the DAL refused before a query was built. */
  | "sessionExpired"
  /**
   * Postgres or the network. **Includes `42P01`, the table not existing** — i.e. the
   * migration in `supabase/chat-amendment.sql` has not been run. That is the one case a
   * developer is likely to hit personally, so the DAL logs the code and a pointer to the
   * file; the user sees the same "couldn't load" either way, because there is no
   * user-facing copy for a missing migration and there should not be.
   */
  | "unavailable";

/**
 * A chat read's result: the newest conversation, oldest turn first.
 *
 * `conversationId` is `null` together with an empty `turns` — a user who has never
 * chatted, or one who has just pressed **New chat**. The two travel together because
 * they are one fact ("there is no conversation yet") and splitting them would let a
 * caller construct the impossible state of an id with no turns.
 */
export type ChatLoadResult =
  | { ok: true; conversationId: string | null; turns: ChatTurn[] }
  | { ok: false; failure: ChatLoadFailure };
