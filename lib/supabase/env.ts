// The two public Supabase env vars, read once and validated.
//
// These are the ONLY env vars this project has (SPEC Block F — Security). The
// secret key — the service-role key in the legacy panel, the secret key in the
// current one — is never added in any form, never behind a NEXT_PUBLIC_* name, and is not
// referenced anywhere in this repo (CLAUDE.md rule 4); the publishable key is all
// an RLS-protected app needs.
//
// This file used to say these were the ONLY env vars, full stop. The 2026-08-28 amendment
// (SPEC M15) added a third, `OPENROUTER_API_KEY`, and it is validated in
// lib/openrouter/env.ts rather than here — deliberately, not for want of a home. That one
// is a SECRET, so its guard refuses EXPOSURE; these two are public by design, so their
// guard refuses a PRIVILEGED VALUE. One shared `required()` would mean a single function
// with two opposite definitions of a bad value, which is how the wrong one eventually gets
// applied to the wrong variable.
//
// Read here rather than in each of the three clients so the names exist once
// (CLAUDE.md rule 11) and a missing value fails with a message that says what to
// do, instead of supabase-js throwing "Invalid URL" three files away.
//
// Both lookups are written out literally on purpose: Next.js inlines
// NEXT_PUBLIC_* vars into the browser bundle by textual substitution, and a
// computed `process.env[name]` lookup would not be substituted.

// The forbidden key prefix, ASSEMBLED FROM FRAGMENTS rather than written out. This
// file is inside the scope `npm run check` scans for exactly this string, so a
// literal here would match itself and fail the check it exists to support — the
// same trick, and the same reason, as the needles in scripts/check.mjs.
//
// The NAME is deliberately `FORBIDDEN_PREFIX` and not something descriptive: the
// widened needle matches an identifier spelling it out, so naming this constant
// after the thing it detects would trip the check just as surely as a literal
// would. scripts/check.mjs records the same lesson — a constant named after the
// key matched, and then so did the comment explaining the trick.
const FORBIDDEN_PREFIX = "sb" + "_secret_";

/**
 * Refuse a value that is a secret key.
 *
 * Both vars are NEXT_PUBLIC_*, which means Next inlines them TEXTUALLY into every
 * browser bundle. A secret key pasted into either one is therefore not a
 * misconfiguration that fails loudly — it is a full RLS bypass published to
 * anyone who views source, and the app would otherwise boot and work perfectly.
 * The audit's W3: `required()` used to check only for emptiness, while the setup
 * instructions sent the operator to a dashboard panel where the secret key sits
 * immediately beside the publishable one.
 *
 * HONEST SCOPE — this catches the CURRENT key format only. A legacy service-role
 * key is a JWT, and a JWT carries no distinguishing prefix: telling it from the
 * legacy anon key means base64-decoding the payload and reading its `role`
 * claim. Not done here, because this project's key is `sb_publishable_`-prefixed
 * (so the mistake available to make is the new-format one) and because a decoder
 * in the module that every client imports is a poor trade. If this project is ever
 * pointed at a pre-2025 Supabase project, that gap is the thing to close.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in both values (Supabase dashboard → Project → Settings → API Keys).`,
    );
  }
  if (value.startsWith(FORBIDDEN_PREFIX)) {
    throw new Error(
      `${name} holds a Supabase SECRET key. It must hold the publishable key ` +
        `(sb_publishable_…). Every NEXT_PUBLIC_* value is inlined into the browser ` +
        `bundle, so a secret key here bypasses row-level security for anyone who ` +
        `views source. Replace it in .env.local, then rotate the key you pasted: ` +
        `Supabase dashboard → Project → Settings → API Keys.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);

export const SUPABASE_ANON_KEY = required(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);
