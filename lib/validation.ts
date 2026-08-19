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
