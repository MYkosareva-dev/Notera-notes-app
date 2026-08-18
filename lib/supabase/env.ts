// The two public Supabase env vars, read once and validated.
//
// These are the ONLY env vars this project has (SPEC Block F — Security). The
// service-role key is never added in any form, never behind a NEXT_PUBLIC_*
// name, and is not referenced anywhere in this repo (CLAUDE.md rule 4); the anon
// key is all an RLS-protected app needs.
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
