import "server-only";

import type { AuthError, PostgrestError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/types";
import type { NoteFailure, NotePatch, NoteView } from "@/lib/types";
import { hasTag, isUuid, isValidTag } from "@/lib/validation";

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
  // insufficient_privilege: an RLS refusal. It should be unreachable, because the
  // explicit filter and the policy say the same thing by construction — which is
  // exactly why it must be TERMINAL rather than retryable. Retrying an authorization
  // refusal three times and then offering "Retry now" would present a permission
  // failure as a network blip.
  "42501",
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
      throw new NotesError(authFailure(error), error.code);
    }
    // No error and no user: the request simply carries no session.
    throw new NotesError("sessionExpired");
  }

  return { supabase, user };
}

/** Maps a PostgREST failure onto the union, logging what the user never sees. */
function failureFor(error: PostgrestError, operation: string): NoteFailure {
  // Code and hint only. PostgREST's `details` is Postgres DETAIL, which for a CHECK
  // violation reads "Failing row contains (id, user_id, title, content, …)" — the user's
  // note text and their owner id, in a server log.
  console.error(`[notes] ${operation} failed`, {
    code: error.code,
    hint: error.hint,
  });

  if (NOT_FOUND_CODES.has(error.code)) {
    return "notFound";
  }
  if (INVALID_CODES.has(error.code)) {
    return "invalid";
  }
  return "unavailable";
}

/**
 * Why `getUser()` refused, told apart by status rather than collapsed.
 *
 * Mapping every auth error to `sessionExpired` sent the one failure class rule B8's
 * retry ladder exists for straight past the ladder: a transient Auth-host failure
 * suspended autosave permanently behind "Your session expired." and a **Sign in**
 * button, for a session that had not expired.
 *
 * Transport failures carry no status (auth-js `AuthRetryableFetchError`), and 5xx/429
 * are the server saying "not now" — both are `unavailable`, so the editor retries. Any
 * other 4xx is about the token itself (401/403, and the `invalid_grant` family that
 * carries a 400 — including this project's own synthetic refresh decline from
 * lib/supabase/server.ts, where only `proxy.ts` can mint a new pair): the session is
 * unusable from here and no amount of retrying changes that.
 */
function authFailure(error: AuthError): NoteFailure {
  const status = error.status;
  if (status === undefined || status === 0 || status === 429 || status >= 500) {
    return "unavailable";
  }
  return "sessionExpired";
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
 * One element of a PostgREST array literal, quoted.
 *
 * VERIFIED IN THE INSTALLED SDK, not remembered — docs/supabase-postgres-queries-filters.md
 * opens its `.contains()` section with a GAP annotation saying Context7 never returned
 * that reference page, so the call had to be confirmed against
 * `node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts`. There,
 * `contains(column, array)` builds the query value as `cs.{${value.join(",")}}` — a raw
 * join with NO quoting of its own (unlike `.in()`, which quotes). That string is then
 * handed to `URLSearchParams.append`, so it is URL-encoded exactly once and never
 * concatenated into SQL.
 *
 * Consequence, and the reason this function exists: an unquoted element makes the comma
 * a SEPARATOR. `.contains("tags", ["Design, UX"])` emits `cs.{Design, UX}`, which asks
 * Postgres for notes carrying BOTH `Design` and ` UX` — a filter that silently returns
 * nothing for a tag the user can perfectly well create, since SPEC Block F puts no
 * character rule on a tag (trimmed and length-capped, nothing more). A brace is worse:
 * a malformed array literal, rejected with `22P02`, which this file maps to `notFound`.
 * Quoting every element removes the whole class — a double-quoted element is always one
 * value — and costs nothing for the ordinary tag.
 *
 * Backslash first, then the quote: escaping in the other order would re-escape the
 * backslashes this function itself just added.
 */
function tagLiteral(tag: string): string {
  return '"' + tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * The user's notes, most recently updated first — the `/notes` list (SPEC Block E).
 *
 * `tag` is the tag filter's query path, and SPEC US5 is specific about it: the
 * filtering must happen in the DATABASE, not in the browser. So the filter is a
 * predicate on this query, and no row the user did not ask for is ever sent to the
 * browser to be hidden there. `.contains` compiles to Postgres `@>` ("the column holds
 * all of these values") and composes WITH the ownership filter rather than instead of
 * it — nothing in `tag` can widen `.eq("user_id", ...)`, because they are two separate
 * entries in the query string.
 *
 * An over-length tag is refused without a round-trip, the same courtesy `requireNoteId`
 * does for a malformed uuid: `LIMITS.tagMax` is the write-side cap, so no stored tag can
 * be longer and the honest answer is an empty list. It is not a security check — what
 * scopes the rows is the ownership filter plus RLS.
 *
 * The `.limit()` is `LIMITS.notesPerUser`: the row cap rule B7 enforces on write,
 * so it is also the largest honest page size (rule 11 — the number is imported).
 *
 * Ordered by `updated_at desc` so the order follows the timestamp the card actually
 * prints (SPEC Block E) — sorting by `created_at` while displaying `updated_at` produced
 * a list whose order contradicted its own labels. Both access paths this function uses
 * are indexed as of Phase 6: `notes_user_updated_idx` on `(user_id, updated_at desc)`
 * for the ordering, and the GIN index `notes_tags_idx` for the `@>` above, which a btree
 * cannot answer. Both are in SPEC Block C and in `supabase/schema.sql`, and both were
 * run in the SQL Editor — the two files describe a database that exists (rule 8).
 */
export async function listNotes(tag?: string): Promise<NoteView[]> {
  const { supabase, user } = await requireUser();

  const wanted = tag === undefined ? "" : tag.trim();
  if (wanted.length > LIMITS.tagMax) {
    return [];
  }

  let query = supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(LIMITS.notesPerUser);

  if (wanted.length > 0) {
    // Its own call, so it can only narrow the query — and quoted, so a tag holding a
    // comma or a brace is one value rather than array-literal syntax (see tagLiteral).
    query = query.contains("tags", [tagLiteral(wanted)]);
  }

  const { data, error } = await query.overrideTypes<NoteView[], { merge: false }>();

  if (error !== null) {
    raise(error, "listNotes");
  }

  return data;
}

/**
 * Every distinct tag across the caller's own notes — the chip row of `TagFilter`
 * (SPEC US5 step 3: "one chip per distinct tag").
 *
 * A second query rather than a derivation from `listNotes()`, deliberately: the chip
 * row must list ALL of the user's tags even while a filter is active, or clicking
 * `client` would leave `urgent` with no chip to click back to. Deriving the row from
 * the filtered rows would do exactly that.
 *
 * Only the `tags` column crosses the wire, so this costs far less than a second full
 * list, and the distinct-ing happens here rather than in SQL because PostgREST cannot
 * express `select distinct unnest(tags)` without an RPC — and an RPC would be a second
 * entry point into this table (rule 3b).
 *
 * DISTINCT BY EXACT VALUE, not case-insensitively, even though one note may not carry
 * `Client` and `client` at once (that rule is per note — see `isSameTag`). Across two
 * notes both spellings can exist, and `@>` is case-sensitive: a `Client` chip and a
 * `client` chip select different notes, so folding them into one chip would give that
 * chip a set of rows it does not describe. Sorted, because the order of `tags` within a
 * note is the order the user typed them, which is not an ordering for a shared row.
 */
export async function listTags(): Promise<string[]> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("notes")
    .select("tags")
    .eq("user_id", user.id)
    .limit(LIMITS.notesPerUser)
    .overrideTypes<{ tags: string[] }[], { merge: false }>();

  if (error !== null) {
    raise(error, "listTags");
  }

  const distinct = new Set<string>();
  for (const row of data) {
    for (const tag of row.tags) {
      distinct.add(tag);
    }
  }

  return [...distinct].sort((left, right) => left.localeCompare(right, "en-US"));
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

  if (patch.tags !== undefined) {
    // The same three Block F rules `TagEditor` applies, applied again — and here they
    // are the rule rather than the courtesy, because this arrives as a POST body. The
    // array is checked as a whole because that is how it is patched (see NotePatch):
    // a caller who sends eleven tags, a 200-character tag or an untrimmed one is
    // refused outright rather than silently corrected, so the client's local state
    // never diverges from what was stored.
    //
    // The Block C CHECK is the third fence, and it only bounds the array LENGTH —
    // `LIMITS.tagMax` has no database counterpart (a recorded schema-amendment
    // candidate), so this is the last place a 200-character tag can be stopped.
    if (patch.tags.length > LIMITS.tagsPerNote) {
      throw new NotesError("invalid", "too many tags");
    }
    const tags: string[] = [];
    for (const tag of patch.tags) {
      if (!isValidTag(tag)) {
        throw new NotesError("invalid", "malformed tag");
      }
      if (hasTag(tags, tag)) {
        throw new NotesError("invalid", "duplicate tag");
      }
      tags.push(tag);
    }
    changes.tags = tags;
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
