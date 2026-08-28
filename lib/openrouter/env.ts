import "server-only";

// The one OpenRouter env var, read once and validated.
//
// FENCED IN ITS OWN RIGHT, not just by its caller. The line above was added after an audit
// asked what stopped a Client Component importing THIS file directly, bypassing the fence
// on lib/openrouter/server.ts. The honest answer was "nothing structural" — the exposure
// was prevented only by two conventions: that server.ts is the sole importer, and that
// OPENROUTER_API_KEY carries no NEXT_PUBLIC_ prefix so Next never inlines it (a client
// import would have read `undefined` and thrown, which is a crash rather than a leak, but
// it is not a fence). Owner's call: close it with the fence, not with a convention.
//
// COST, recorded because it is real and not obvious: `server-only` is not an installed
// package — Next aliases the specifier — so plain `node` cannot resolve it, and this module
// can no longer be imported by a bare `node --experimental-strip-types` probe. The guards
// below were verified that way before this line existed. To re-probe them, copy the file
// without its first line and import the copy; the two functions are unchanged by the strip,
// and `npm run build` is what proves the fence itself. Do not delete the fence to make a
// test easier.
//
// This var is the MIRROR IMAGE of the two in lib/supabase/env.ts, and the difference is
// the whole reason this file exists rather than a line added there. Those two are
// NEXT_PUBLIC_* and must hold a LOW-privilege value: the guard there refuses a secret.
// This one is a SECRET and must never become public: the guard here refuses exposure.
// Same shape, opposite direction — so folding them together would mean one function
// with two opposite meanings of "wrong".
//
// Written out literally as `process.env.OPENROUTER_API_KEY` on purpose. A computed
// `process.env[name]` lookup is not statically analysable, and while that only changes
// behaviour for NEXT_PUBLIC_* vars (which Next substitutes textually), keeping the same
// spelling discipline in both env modules means a reader never has to work out which
// rule applies to which file.

/**
 * The OpenRouter key prefix, ASSEMBLED FROM FRAGMENTS rather than written out.
 *
 * `scripts/check.mjs` scans this file for exactly this string, so a literal here would
 * match itself and fail the check it exists to support. Identical trick and identical
 * reason to `FORBIDDEN_PREFIX` in lib/supabase/env.ts — and, as that file records, the
 * trap extends to NAMES and COMMENTS: a constant named after the string matched the
 * case-insensitive needle just as surely as the string did. Hence the neutral name.
 */
const KEY_PREFIX = "sk" + "-or-";

/**
 * Refuse an OpenRouter key that any part of the browser bundle can read.
 *
 * CLAUDE.md ("AI model calls"): the key must never be exposed to the browser — no
 * NEXT_PUBLIC_ prefix, never passed to a client component. Next inlines every
 * NEXT_PUBLIC_* value TEXTUALLY into every browser bundle, so a key pasted under such a
 * name is not a misconfiguration that fails loudly. It is a working credential published
 * to anyone who views source, billed to the project's account, and the app would boot and
 * answer correctly the entire time. Exactly the failure mode lib/supabase/env.ts was
 * hardened against, one credential over.
 *
 * TWO ways it can happen, so two tests. A name that SAYS what it holds — the public
 * prefix followed by this key's own variable name — is the obvious one. A key pasted under
 * a name that says nothing (`NEXT_PUBLIC_API_KEY`, or a copy left in
 * `NEXT_PUBLIC_SUPABASE_URL`) is the one a name check alone misses — so the VALUE is
 * tested too, against the prefix above. Every NEXT_PUBLIC_* var in the environment is
 * checked, not a fixed list, because the whole point is to catch the name nobody thought
 * of.
 *
 * The obvious name is described here rather than SPELLED, and that is deliberate:
 * `npm run check` scans this file for exactly that pattern, so writing it out would make
 * this comment the first finding. The same trap the fragments above avoid, and the same
 * one lib/supabase/env.ts and scripts/check.mjs both record having fallen into.
 *
 * HONEST SCOPE — this runs only when something imports this module, i.e. on the first
 * server-side OpenRouter call. It is not an always-on guard, and it cannot see a key
 * hardcoded into a component rather than passed through the environment.
 * `npm run check` is the net for both: it scans every code file this repo ships, on
 * every run, whether or not anything calls OpenRouter.
 */
function refuseBrowserExposure(): void {
  const needle = new RegExp("OPEN" + "ROUTER", "i");
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    const namedForIt = needle.test(name);
    const holdsOne = value !== undefined && value.startsWith(KEY_PREFIX);
    if (!namedForIt && !holdsOne) continue;
    throw new Error(
      `${name} is a NEXT_PUBLIC_* variable and ${
        holdsOne ? "holds an OpenRouter API key" : "is named for the OpenRouter API key"
      }. Every NEXT_PUBLIC_* value is inlined into the browser bundle, so this publishes ` +
        `a working credential to anyone who views source. Remove it from .env.local and ` +
        `keep the key in OPENROUTER_API_KEY (no prefix), then rotate the key you pasted: ` +
        `https://openrouter.ai/settings/keys`,
    );
  }
}

/**
 * The key itself.
 *
 * A missing value fails with a message that says what to do, rather than letting the
 * request go out with `Authorization: Bearer undefined` and surfacing as a 401 from a
 * host the developer never configured — the same reasoning that put `required()` in
 * lib/supabase/env.ts.
 *
 * Deliberately NOT validated against the prefix above. A wrong-format value is refused by
 * OpenRouter on the first call with a clear 401, whereas a required-prefix check here
 * would break this app the day OpenRouter issues a new key format — a self-inflicted
 * outage guarding against a mistake the network already reports. lib/supabase/env.ts
 * draws the same line: refuse the value that must not be here, do not demand the shape of
 * the one that must.
 */
function requireKey(): string {
  const value = process.env.OPENROUTER_API_KEY;
  if (!value) {
    throw new Error(
      "Missing environment variable OPENROUTER_API_KEY. Add it to .env.local (see " +
        ".env.example); create a key at https://openrouter.ai/settings/keys. It must NOT " +
        "have a NEXT_PUBLIC_ prefix — that would publish it to the browser.",
    );
  }
  return value;
}

refuseBrowserExposure();

export const OPENROUTER_API_KEY = requireKey();
