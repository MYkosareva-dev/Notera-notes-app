Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/getting-started/migrating-to-new-api-keys.mdx
Also: https://github.com/supabase/supabase/blob/master/apps/www/_blog/2025-07-14-jwt-signing-keys.mdx
Also: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/self-hosting/self-hosted-auth-keys.mdx

# API keys: publishable and secret (the names that replaced anon and service_role)

Fetched via Context7 from `/supabase/supabase`.
Content below is pasted as returned. Annotations are ours.

> **ANNOTATION (applies to this whole file):** this file exists for one reason — the
> setup instructions in `README.md` and `.env.example` named a dashboard label
> ("anon public") that this project's own key no longer matches, which is a rule 18
> divergence and, worse, sent the operator to improvise next to the one key that must
> never be in this repo. It was found by the security audit on `lab/agents` (finding
> W3). CLAUDE.md rule 4 is unchanged and unconditional: **this project uses only the
> low-privilege key**, whichever of its two names the dashboard shows.

---

## Which key replaces which

> Source: `migrating-to-new-api-keys.mdx`

When migrating, the legacy `anon` key should be replaced with a Publishable key, which
is used by browsers, mobile/desktop apps, CLIs, and public sources. The `service_role`
key should be replaced with a Secret key, intended for servers, Edge Functions,
workers, and other backend code.

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project.supabase.co',
  'sb_publishable_...' // was the anon key
)
```

> **ANNOTATION:** this is the key `NEXT_PUBLIC_SUPABASE_ANON_KEY` holds. The variable
> keeps its name for continuity with the rest of the sprint's docs; the *role* is
> identical, which is why nothing in `lib/supabase/` changed when the panel did. The
> corresponding admin snippet in the same upstream guide — a client built with the
> secret key — is **deliberately not quoted here.** It is a copy-paste-ready line
> whose only purpose is to bypass row-level security, and the audit found that such a
> snippet already sitting in `docs/` is what made the widened `npm run check` needle
> necessary in the first place (W2). The one thing worth knowing from it is recorded
> as prose instead: secret keys bypass RLS.

## Key format

> Source: `self-hosted-auth-keys.mdx`

```text
sb_publishable_<22-char-random>_<8-char-checksum>
sb_secret_<22-char-random>_<8-char-checksum>
```

> **ANNOTATION:** this is what makes the boot-time guard in `lib/supabase/env.ts`
> possible and also what bounds it. The two prefixes are distinguishable by string
> comparison, so a secret key pasted into either `NEXT_PUBLIC_*` variable is refused
> before the app serves a byte. The **legacy** pair is not distinguishable that way:
> `anon` and `service_role` are both JWTs, differing only in a `role` claim inside the
> base64 payload. So the guard catches the new-format mistake and not the old-format
> one, and `env.ts` says so in place rather than implying wider cover than it has.

## Why the change

> Source: `2025-07-14-jwt-signing-keys.mdx`

`anon` and `service_role` are your project's legacy API keys. They identify what
*application* (as opposed to which *user*) is accessing your data. Sadly they're JWTs
that expire 10 years after you create your project. And as you're probably guessing,
rotating and then revoking the legacy JWT secret will reject them. […] You should
switch to publishable/secret keys even if you're not taking advantage of the new JWT
signing keys feature.

> **ANNOTATION:** relevant to this repo only as the reason the dashboard has two panels
> at once, which is why `README.md` documents both and says either works. Nothing here
> asks for a code change: neither key type changes how `@supabase/ssr` is called.
