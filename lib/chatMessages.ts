import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/types";
import type { ChatLoadResult, ChatTurn } from "@/lib/types";

/**
 * The chat data-access layer — the ONLY file in this repo that touches
 * `public.chat_messages`, and the exact counterpart of `lib/notes.ts` for the second
 * table this project has.
 *
 * The three properties `lib/notes.ts` guarantees, guaranteed here in the same order:
 *
 * 1. **No verified user, no data.** Both exported functions start with `getUser()` and
 *    refuse before a query is built. `getSession()` reads the cookie without validating
 *    the token and is prohibited for any access decision (rule 2).
 * 2. **The owner id is derived, never accepted.** `user.id` comes from `getUser()` on
 *    every call. Neither function takes a user id parameter, so no caller — including
 *    `lib/chat.ts`, which has already verified the same user — can supply one. That
 *    costs one extra Auth round-trip per send, and it is worth it: see `appendExchange`.
 * 3. **Every query carries `.eq("user_id", user.id)`** (rule 7), including the write.
 *    RLS is the second fence, and a filter that lives only in a policy is one dropped
 *    policy away from living nowhere.
 *
 * WHY THIS IS A SEPARATE FILE FROM `lib/chat.ts`, which is also `server-only` and also
 * calls `getUser()`. `lib/chat.ts` imports `lib/openrouter/server.ts`, which imports
 * `lib/openrouter/env.ts`, which THROWS AT IMPORT TIME when `OPENROUTER_API_KEY` is
 * missing. `app/chat/page.tsx` has to read history in order to render, and folding these
 * functions into `lib/chat.ts` would mean a missing key turns the whole page into a
 * crash instead of a send that fails with a clear message. Reading a conversation does
 * not need a model key, so it does not import one.
 *
 * APPEND-ONLY, and enforced below the app: the table has SELECT and INSERT policies and
 * no UPDATE or DELETE policy at all, so RLS denies both (see
 * `supabase/chat-amendment.sql`). This file has no update or delete function because
 * there is nothing for one to call.
 */

/** Columns the app reads. `user_id` is deliberately not among them — see `NoteView`. */
const TURN_COLUMNS = "conversation_id, role, content";

/**
 * `42P01` is `undefined_table`: the migration has not been run yet.
 *
 * Called out by name because it is the ONE failure a reader of this code is likely to
 * hit personally, and because "couldn't load" is a misleading thing to think when the
 * real answer is "the table does not exist". It is still reported to the user as
 * `unavailable` — there is no user-facing copy for a missing migration, and there should
 * not be — but the server log says which it was.
 */
const UNDEFINED_TABLE = "42P01";

/** One row as it comes back from PostgREST, before it is narrowed to a `ChatTurn`. */
interface TurnRow {
  conversation_id: string;
  role: string;
  content: string;
}

/**
 * Log a Postgres failure with the code and message only.
 *
 * Never the payload: an error object from this layer can carry the request body, and the
 * body here is what the user typed and what the model answered. The same rule
 * `app/notes/actions.ts` follows for note text.
 */
function logFailure(operation: string, error: PostgrestError): void {
  const hint =
    error.code === UNDEFINED_TABLE
      ? " — public.chat_messages does not exist; run supabase/chat-amendment.sql"
      : "";
  console.error(
    `[chatMessages/${operation}] ${error.code}: ${error.message}${hint}`,
  );
}

/**
 * Narrow a row to a `ChatTurn`, or null.
 *
 * The `role` column has a `check (role in ('user','assistant'))` constraint, so this can
 * only fail on a row that predates the constraint or arrived some other way — but the
 * column's TYPE is `text`, and `no any` (CLAUDE.md Stack) means the honest version has
 * to say what happens to a value outside the union rather than casting the problem away.
 * A row that does not narrow is DROPPED rather than failing the load: one unreadable
 * turn should not cost the user the whole conversation.
 *
 * Content is deliberately NOT length-checked here. The read path must return what is
 * stored; the send path is where a transcript is trimmed to fit its caps, and doing it
 * here instead would silently hide a stored reply from the screen that is showing it.
 */
function toTurn(row: TurnRow): ChatTurn | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  if (typeof row.content !== "string" || row.content.length === 0) return null;
  return { role: row.role, content: row.content };
}

/**
 * The user's most recent conversation: its id and its turns, oldest first.
 *
 * ONE QUERY, NOT TWO. The obvious shape — "find the newest conversation_id, then fetch
 * its rows" — is two round-trips for one screen. Instead this reads the newest
 * `LIMITS.chatHistoryMax` turns the user owns, in reverse order, and keeps the ones
 * belonging to the newest row's conversation. Rows from older conversations may come
 * back in that window and are filtered out here; that is the price of the single query,
 * and it is bounded by the limit.
 *
 * Ordered by `seq`, never by `created_at`. A question and its answer are written in ONE
 * statement, so they share a transaction timestamp and their relative order by
 * `created_at` is undefined — an answer could sort before its question. `seq` is an
 * identity column assigned in row order, which is the only thing here that gives a
 * deterministic transcript. `supabase/chat-amendment.sql` records the same reasoning at
 * the column.
 *
 * A conversation longer than the limit loads its NEWEST turns and silently loses its
 * beginning on screen. Accepted and recorded in SPEC US8: the limit bounds one page
 * render, the transcript that matters for memory is bounded far lower anyway
 * (`LIMITS.chatTurnsMax`), and a "load earlier" control is a feature nobody asked for.
 */
export async function loadLatestConversation(): Promise<ChatLoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, failure: "sessionExpired" };
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select(TURN_COLUMNS)
    // Rule 7: explicit, even though RLS scopes it too.
    .eq("user_id", user.id)
    .order("seq", { ascending: false })
    .limit(LIMITS.chatHistoryMax);

  if (error) {
    logFailure("loadLatestConversation", error);
    return { ok: false, failure: "unavailable" };
  }

  const rows: TurnRow[] = data ?? [];
  if (rows.length === 0) {
    // No history at all — a first-time user, or one who has just signed in. An empty
    // conversation with no id, which is exactly what "New chat" produces.
    return { ok: true, conversationId: null, turns: [] };
  }

  const conversationId = rows[0].conversation_id;
  const turns: ChatTurn[] = [];
  for (const row of rows) {
    // The window can span a conversation boundary; stop at it rather than filtering,
    // since the rows are ordered and everything past the boundary is older.
    if (row.conversation_id !== conversationId) break;
    const turn = toTurn(row);
    if (turn !== null) turns.push(turn);
  }

  // Fetched newest-first for the LIMIT to mean "the newest N"; reversed here because a
  // transcript reads oldest-first, and because that is the order the model needs.
  turns.reverse();

  return { ok: true, conversationId, turns };
}

/**
 * Store one completed exchange — the user's message and the reply — and return the
 * conversation it landed in.
 *
 * BOTH ROWS IN ONE INSERT, and both only AFTER the model has answered. That ordering is
 * the design, and the alternative was considered and rejected: writing the question
 * first would leave an unanswered row behind whenever the model call failed, and the
 * **Retry** button would then insert a second copy of the same question. Making that
 * idempotent needs a client-minted id and a unique constraint to deduplicate against —
 * real machinery, for a case this ordering simply does not have. Nothing is written on a
 * failed send, so a retry cannot duplicate anything.
 *
 * The visible consequence, recorded in SPEC US8: a message whose send FAILED is not
 * stored. It stays on screen with **Retry**, and reloading before retrying loses it —
 * the same bargain rule B8 already makes for a note whose save is suspended, where
 * typed text lives in local state until a write lands.
 *
 * `conversationId === null` mints a new one. The id is generated HERE, on the server,
 * rather than accepted from the client for a new conversation: there is no reason for a
 * client to name a conversation that does not exist yet, and not accepting the value is
 * cheaper than validating it. An EXISTING id does come from the client — it is a
 * grouping key, scoped by the `user_id` filter and by RLS, so the worst a forged one can
 * do is file the caller's own messages under an id of their choosing. It cannot read
 * another account's turns (every read filters by `user_id`) and it cannot disturb them
 * (this is an insert; the rows carry the caller's own owner id).
 *
 * Returns `null` when the write failed. The caller must NOT treat that as a failed send:
 * the reply exists and has been paid for, so it is shown, and the user is told the
 * conversation was not saved. Silently swallowing this is how a user discovers on reload
 * that an afternoon of chat is gone.
 */
export async function appendExchange(
  conversationId: string | null,
  question: string,
  reply: string,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fence 1 again, in its own right. `lib/chat.ts` has already verified the same user a
  // moment ago, and this call is NOT redundant on purpose: property 2 above says no
  // function here takes an owner id, and the only way to keep that true is to derive it
  // here. It costs one Auth round-trip (~35 ms at what this project measured) against a
  // model call that takes seconds — the cheapest invariant in the app.
  if (!user) {
    return null;
  }

  const targetConversation = conversationId ?? crypto.randomUUID();

  const { error } = await supabase.from("chat_messages").insert([
    // Array order IS transcript order: `seq` is an identity column, assigned in row
    // order within a multi-row insert. Swapping these two lines would store every
    // answer before its question.
    {
      user_id: user.id,
      conversation_id: targetConversation,
      role: "user",
      content: question,
    },
    {
      user_id: user.id,
      conversation_id: targetConversation,
      role: "assistant",
      content: reply,
    },
  ]);

  if (error) {
    logFailure("appendExchange", error);
    return null;
  }

  return targetConversation;
}
