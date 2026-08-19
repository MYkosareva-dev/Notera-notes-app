// Shared input predicates. They live here, not inside a form or an action,
// because sign-in validates twice: the client component blocks submit so the
// user gets the SPEC Block F copy inline, and the Server Action re-checks the
// same rule because every Server Action is a public endpoint (CLAUDE.md rule 3b).
// One rule, one home — never two copies that can drift (rule 11).

import { LIMITS } from "./types";

// Deliberately loose: one @, something either side, a dot in the domain, no
// whitespace. "Valid email shape" in SPEC Block F means exactly that — the
// authority on whether an address exists is Supabase Auth, not a regex, and a
// stricter pattern only rejects real addresses. No address literal appears here
// or anywhere else in the repo (rule 5).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

// Any of the eight uuid versions, case-insensitive — the shape Postgres accepts for
// a `uuid` column, not a version assertion (the column is filled by
// gen_random_uuid(), so v4 is what it holds; a stricter pattern would only start
// rejecting ids the database is perfectly happy with).
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Used by the DAL on every note id that arrives from a URL or an action payload.
 * A wrong shape is answered as "no such note" without a database round-trip
 * (SPEC G-15) — it is not a security check: what keeps a *well-formed* foreign id
 * from returning a row is the ownership filter plus RLS.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * A tag's canonical form: SPEC Block F's `tag` row opens with "trimmed", so the
 * trimmed string IS the tag — everything downstream (the duplicate check, the cap,
 * the stored value, the `?tag=` filter) works on this and never on raw input.
 *
 * Whitespace-only input therefore normalizes to `""`, which `isValidTag` rejects —
 * SPEC G-21, where the tag is refused silently and the field simply clears.
 */
export function normalizeTag(value: string): string {
  return value.trim();
}

/**
 * The Block F length rule, applied to an already-normalized tag.
 *
 * Checked twice on purpose, like the email shape above: `TagEditor` blocks the
 * keystroke so the user gets the copy inline, and `lib/notes.ts` re-checks because a
 * Server Action is a public POST (CLAUDE.md rule 3b). The `=== normalizeTag(value)`
 * clause is what makes the DAL's copy meaningful — the editor sends trimmed tags, a
 * hand-built POST need not.
 */
export function isValidTag(value: string): boolean {
  return (
    value === normalizeTag(value) && value.length > 0 && value.length <= LIMITS.tagMax
  );
}

/**
 * Tag identity for the duplicate rule — case-INSENSITIVE, so `Client` and `client`
 * are the same tag on one note (SPEC G-22).
 *
 * Deliberately `toLowerCase()` and not `localeCompare` with a sensitivity option:
 * this predicate decides what gets STORED, so it has to give the same answer in the
 * browser and in the DAL, and a locale-aware collation is the sort of thing that can
 * differ between two ICU builds. Equality of the lowercased strings cannot.
 *
 * Note the asymmetry this creates by design: two DIFFERENT notes may carry `Client`
 * and `client`, because the rule scopes to one note. `TagFilter` reflects that — see
 * `listTags` in lib/notes.ts.
 */
export function isSameTag(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** True when `tags` already holds `tag` under the case-insensitive rule above. */
export function hasTag(tags: readonly string[], tag: string): boolean {
  return tags.some((existing) => isSameTag(existing, tag));
}

/**
 * Drops EXACT duplicates, keeping first-seen order. A render-time safety net, not a
 * rule — `updateNote` already refuses a duplicate under the looser case-insensitive
 * test, so nothing the app writes can need this.
 *
 * What can: a row inserted straight into the SQL Editor. SPEC Block C ships a seed
 * block and G-18 treats direct inserts as a real path, so `{client,client}` is
 * reachable — and every chip list keys by the tag text, which would make React log a
 * duplicate-key warning and fail Block H check 4 ("zero console errors"). One
 * malformed row would fail a Definition-of-Done check for a reason with nothing to do
 * with the code under test.
 *
 * EXACT, deliberately, not `isSameTag`: an exact duplicate is the only thing that
 * breaks a key, and folding `Client` into `client` here would silently hide a tag the
 * database really holds. This filters what React cannot render; it does not tidy data.
 */
export function dedupeTags(tags: readonly string[]): string[] {
  return [...new Set(tags)];
}
