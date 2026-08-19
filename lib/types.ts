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
 * (SPEC Block C), so neither is patchable by anyone. `tags` joins this type in
 * Phase 6 along with the editor that writes them.
 */
export interface NotePatch {
  title?: string;
  content?: string;
}

/**
 * Why a notes operation refused. One union, shared by the DAL (which throws it),
 * the Server Actions (which return it) and `NoteEditor` (which maps each case to
 * copy and to a behaviour).
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
