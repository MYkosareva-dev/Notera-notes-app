// Shared input predicates. They live here, not inside a form or an action,
// because sign-in validates twice: the client component blocks submit so the
// user gets the SPEC Block F copy inline, and the Server Action re-checks the
// same rule because every Server Action is a public endpoint (CLAUDE.md rule 3b).
// One rule, one home — never two copies that can drift (rule 11).

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
