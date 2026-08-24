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
} as const;
