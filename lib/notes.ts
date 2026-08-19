import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/types";
import type { NoteFailure, NotePatch, NoteView } from "@/lib/types";
import { isUuid } from "@/lib/validation";

/**
 * The notes data-access layer — FENCE 1 of CLAUDE.md rule 3 / SPEC rule B3, and the
 * only file in this repo that touches the `notes` table (rule 3b).
 *
 * Three properties this file exists to guarantee, in the order they matter:
 *
 * 1. **No verified user, no data.** Every exported function starts with
 *    `getUser()` and throws before a query is built. This is the authoritative
 *    gate, not `app/notes/layout.tsx` and not `proxy.ts`: a layout `redirect()`
 *    does not stop the sibling page from rendering (measured on Next 16.3.1), and
 *    an interceptor is bypassed entirely when a Server Action is POSTed directly.
 * 2. **The owner id is derived, never accepted.** `user.id` comes from `getUser()`
 *    on every call. A note id may come from the client — that is a lookup key,
 *    scoped by the filter below — but an owner id never does (rule 3b). No
 *    function here takes a user id parameter, so a caller cannot supply one.
 * 3. **Every query carries `.eq('user_id', user.id)`** (rule 7), including the
 *    ones RLS would already scope, including the ones addressed by primary key.
 *    RLS is the second fence; a filter that is only in a policy is one dropped
 *    policy away from being nowhere.
 *
 * `import "server-only"` makes an accidental client import a build error rather
 * than a bundle leak. Note that a typo in that specifier is silently inert under
 * this tsconfig — `npm run build` is what verifies it, not `npm run typecheck`.
 *
 * `getUser()` is deliberately called per operation and NOT memoized. Next already
 * dedupes the identical Auth request within one render pass, so the honest version
 * costs nothing; a `cache()` wrapper would make fence 1 return fence 2's answer by
 * construction, which is the property this file is supposed to hold independently.
 */

/** Columns handed out as `NoteView` — `user_id` is deliberately not among them. */
const NOTE_COLUMNS = "id, title, content, tags, created_at, updated_at";

/** Postgres/PostgREST codes that mean "no such row here", not "the query broke". */
const NOT_FOUND_CODES: ReadonlySet<string> = new Set([
  "22P02", // invalid_text_representation — a malformed uuid in the URL (SPEC G-15)
  "PGRST116", // no (or more than one) row returned where one was expected
]);

/** Postgres codes that mean the row itself was rejected — a Block F rule, in the DB. */
const INVALID_CODES: ReadonlySet<string> = new Set([
  "23514", // check_violation — the title/content/tags CHECKs from SPEC Block C
  "22001", // string_data_right_truncation
]);

/**
 * Why an operation refused, as a throw.
 *
 * Thrown rather than returned because a read is called from a Server Component,
 * where there is no result channel — and because a caller that forgets to check a
 * returned error still gets rows in that shape. Server Actions catch this and
 * return `{ ok: false, failure }` so the editor can act on the reason (SPEC B8).
 *
 * `sessionExpired` is a throw and NOT a `redirect()` on purpose: an autosave POST
 * that redirects never returns its result, so the editor could not show G-1's
 * banner and the user would lose the text they had typed. Read paths translate the
 * same throw into the redirect they are able to perform.
 */
export class NotesError extends Error {
  readonly failure: NoteFailure;

  constructor(failure: NoteFailure, detail?: string) {
    // The message is developer-facing only; user copy lives in lib/copy.ts (rule 10).
    super(detail === undefined ? `notes: ${failure}` : `notes: ${failure} (${detail})`);
    this.name = "NotesError";
    this.failure = failure;
  }
}

export function isNotesError(error: unknown): error is NotesError {
  return error instanceof NotesError;
}

/**
 * The gate. Returns the verified user, or throws.
 *
 * `getUser()`, never `getSession()`: only the former revalidates the token against
 * the Auth server, and an unvalidated cookie is client-controlled input (rule 2).
 * The client this runs on cannot refresh a token — that is `proxy.ts`'s job alone —
 * so a genuinely expired session surfaces here as an error, which is exactly the
 * `sessionExpired` case.
 */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error !== null || user === null) {
    // Status and code only: an auth error can carry request payloads.
    if (error !== null) {
      console.error("[notes] no verified user", {
        status: error.status,
        code: error.code,
      });
    }
    throw new NotesError("sessionExpired");
  }

  return { supabase, user };
}

/** Maps a PostgREST failure onto the union, logging what the user never sees. */
function failureFor(error: PostgrestError, operation: string): NoteFailure {
  console.error(`[notes] ${operation} failed`, {
    code: error.code,
    details: error.details,
  });

  if (NOT_FOUND_CODES.has(error.code)) {
    return "notFound";
  }
  if (INVALID_CODES.has(error.code)) {
    return "invalid";
  }
  return "unavailable";
}

function raise(error: PostgrestError, operation: string): never {
  throw new NotesError(failureFor(error, operation), error.code);
}

/**
 * A note id from the client is checked for shape before it reaches Postgres.
 * Without this, `/notes/abc` costs a round-trip to learn it is not a uuid (SPEC
 * G-15). A well-formed id that belongs to someone else is indistinguishable from
 * one that does not exist, which is the point — RLS plus the ownership filter
 * return no row either way (G-14).
 */
function requireNoteId(id: string): string {
  if (!isUuid(id)) {
    throw new NotesError("notFound", "malformed id");
  }
  return id;
}

/**
 * The user's notes, newest first — the `/notes` list (SPEC Block E).
 *
 * `tag` is the Phase 6 tag filter's query path (SPEC US5: the filter must hit the
 * database, not browser memory). It has no UI caller yet; the DAL owns it because
 * a containment filter is a query, and queries live here. `.contains` compiles to
 * Postgres `@>` — "the column holds all of these values" — and composes with, not
 * instead of, the ownership filter.
 *
 * The `.limit()` is `LIMITS.notesPerUser`: the row cap rule B7 enforces on write,
 * so it is also the largest honest page size (rule 11 — the number is imported).
 */
export async function listNotes(tag?: string): Promise<NoteView[]> {
  const { supabase, user } = await requireUser();

  let query = supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(LIMITS.notesPerUser);

  const wanted = tag?.trim();
  if (wanted !== undefined && wanted.length > 0) {
    // Passed as a parameter by the SDK, never interpolated into SQL (SPEC G-24),
    // and kept as its own call so it cannot widen the ownership predicate.
    query = query.contains("tags", [wanted]);
  }

  const { data, error } = await query.overrideTypes<NoteView[], { merge: false }>();

  if (error !== null) {
    raise(error, "listNotes");
  }

  return data;
}

/**
 * One note, or `notFound`. Unknown id, malformed id and another account's id all
 * end here identically (SPEC G-13/G-14/G-15) — the ownership filter and RLS make
 * "not yours" and "not there" the same answer, so nothing leaks about which it was.
 */
export async function getNote(id: string): Promise<NoteView> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("id", requireNoteId(id))
    .eq("user_id", user.id)
    .maybeSingle()
    .overrideTypes<NoteView, { merge: false }>();

  if (error !== null) {
    raise(error, "getNote");
  }
  if (data === null) {
    throw new NotesError("notFound");
  }

  return data;
}

/**
 * Creates an empty note and returns its id (SPEC US3 step 1: `title` and `content`
 * are `""`, and the caller redirects to the editor).
 *
 * `user_id` is written explicitly even though the column defaults to `auth.uid()`:
 * rule 7 wants the ownership stated by the query, not inferred from DDL.
 *
 * Rule B7's cap is enforced by counting first. This is a two-step check, so two
 * simultaneous creates could both pass at exactly the cap; that is accepted —
 * there is no DB fence for a row count (a CHECK cannot hold a subquery), and the
 * consequence of the race is one note over a soft limit. The trigger-based fence
 * is a parked schema amendment, not a Phase 4 change (schema edits go through
 * SPEC Block C and a SQL Editor re-run, rule 8).
 */
export async function createNote(): Promise<string> {
  const { supabase, user } = await requireUser();

  const { count, error: countError } = await supabase
    .from("notes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError !== null) {
    raise(countError, "createNote/count");
  }
  if (count !== null && count >= LIMITS.notesPerUser) {
    throw new NotesError("limitReached");
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({ user_id: user.id, title: "", content: "" })
    .select("id")
    .single()
    .overrideTypes<{ id: string }, { merge: false }>();

  if (error !== null) {
    raise(error, "createNote");
  }

  return data.id;
}

/**
 * Applies a patch to one of the caller's own notes.
 *
 * The Block F caps are re-checked here even though `NoteEditor` blocks the
 * keystroke that would exceed them: a Server Action is a publicly callable POST,
 * so the editor's check is a courtesy and this one is the rule. (The CHECK
 * constraints in Block C are the third.)
 *
 * `.select("id")` is what makes a vanished note distinguishable from a successful
 * write: an UPDATE matching no row is not an error in Postgres, so without the
 * returned rows SPEC G-13 (deleted in another tab) would look like a clean save.
 */
export async function updateNote(id: string, patch: NotePatch): Promise<void> {
  const { supabase, user } = await requireUser();

  const changes: NotePatch = {};

  if (patch.title !== undefined) {
    if (patch.title.length > LIMITS.titleMax) {
      throw new NotesError("invalid", "title too long");
    }
    changes.title = patch.title;
  }

  if (patch.content !== undefined) {
    if (patch.content.length > LIMITS.contentMax) {
      throw new NotesError("invalid", "content too long");
    }
    changes.content = patch.content;
  }

  if (Object.keys(changes).length === 0) {
    throw new NotesError("invalid", "empty patch");
  }

  const { data, error } = await supabase
    .from("notes")
    .update(changes)
    .eq("id", requireNoteId(id))
    .eq("user_id", user.id)
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();

  if (error !== null) {
    raise(error, "updateNote");
  }
  if (data.length === 0) {
    throw new NotesError("notFound");
  }
}

/** Deletes one of the caller's own notes (SPEC US4). Zero rows means it was already gone. */
export async function deleteNote(id: string): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .delete()
    .eq("id", requireNoteId(id))
    .eq("user_id", user.id)
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();

  if (error !== null) {
    raise(error, "deleteNote");
  }
  if (data.length === 0) {
    throw new NotesError("notFound");
  }
}
