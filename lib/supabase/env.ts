// The two public Supabase env vars, read once and validated.
//
// These are the only two PUBLIC env vars this project has (SPEC Block F — Security). The
// service-role key is never added in any form, never behind a NEXT_PUBLIC_*
// name, and is not referenced anywhere in this repo (CLAUDE.md rule 4); the anon
// key is all an RLS-protected app needs.
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

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in both values (Supabase dashboard → Project → Settings → API).`,
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
