# Persistence decision — the P0 consultation record

Assignment requirement 3: before settling on a persistence approach, consult
Claude Code on the best option given the existing stack, evaluate its
recommendation, and record the chosen approach and why. This file is that
record. The consultation ran in the empty repository, before SPEC.md and
CLAUDE.md existed — those documents codify its outcome.

## The question I asked

The database itself was fixed by the assignment (notes persist in Supabase
Postgres; `localStorage`/`sessionStorage` ruled out under any circumstances),
so the consultation was not "which database" but **which access pattern**:
which layer of the app talks to Supabase, given that sessions must be
verifiable on the server. I asked for a comparison of at least:
(a) direct access from Server Components / Server Actions,
(b) Supabase behind my own `/api` route handlers — the shape of my previous
project, where a JSON file behind a route handler was chosen deliberately so a
real database could later replace the handler internals without touching the
client,
(c) any other serious option — with trade-offs, failure modes, and implications
for server-side session checks and per-user row scoping.

## What the agent answered (condensed)

**Framing it got right before comparing anything:** on the server,
`getSession()` merely decodes a browser-supplied cookie and is not trustworthy;
`auth.getUser()` actually validates the token. Whatever the pattern, the gate
must be `getUser()`, server-side, before protected content is produced. And
per-user scoping belongs in Postgres (RLS, `auth.uid() = user_id`), so the
database refuses foreign rows even if a query forgets a filter.

**(a) Server Components / Server Actions (recommended).** Natural server-side
gate (a protected page awaits `getUser()` and redirects before any markup
exists); the cookie-bound JWT travels with every query so RLS applies
automatically; least code. Failure modes it warned about: every Server Action
is a publicly callable POST endpoint — one missing `getUser()` is a live hole;
Server Components cannot write cookies, so middleware must refresh the session;
middleware itself must never be the gate; careless caching of per-user data can
cross-leak.

**(b) Own `/api` route handlers.** Workable, curl-able, nice HTTP semantics —
but the page still needs its own gate (two auth idioms), and the classic
failure chain is: self-fetch from a Server Component → forgotten cookie
forwarding → "fixed" with the service-role key → RLS bypassed and scoping
collapses. On my previous project's rationale it was direct: the HTTP seam
bought the ability to swap a file for a real database without touching the
client — *that swap is this sprint*, the insurance has paid out, and the seam
still worth having is a **module boundary**, not an HTTP one, because a browser
cannot call a module.

**(c) Others.** Browser client + RLS only: data stays safe but the gate becomes
a client-side redirect — exactly the "trusts the browser session" flaw the
assignment's scan hunts for; disqualified. An ORM over direct Postgres: a
second auth path and manual JWT claims for zero benefit at this scope.

**Recommendation:** (a), with three specifics — RLS on all four operations
with `user_id` defaulting to `auth.uid()`; one `server-only` data-access module
that every page and action goes through, which calls `getUser()` itself; and
middleware demoted to cookie refresh + cheap early redirect, never the gate.

**Costs it named:** auth becomes per-function discipline rather than a
structural guarantee (mitigated by the DAL chokepoint and the per-PR
`/review-auth` scan); and giving up the HTTP seam means no curl/Postman surface
and a real — but deliberate — deferral of any external API layer.

## My evaluation and decision

I accepted (a) with all three specifics. Two things in the answer changed the
project rather than just confirming it: the DAL chokepoint (`lib/notes.ts`,
`server-only`) — my draft had queries spread across pages and actions, and the
"every Server Action is a public endpoint" argument convinced me to centralize
them — and the demotion of middleware from co-gate to convenience, which
became the "three fences" rule (DAL → protected layout → middleware) in
SPEC.md rule B3 and CLAUDE.md rule 3. The named costs are acceptable here:
next sprint deploys this same app, no external clients exist, and the module
seam keeps a future API layer cheap. The outcome is codified in SPEC.md
(Block A decisions, rules B3/B3b/B4) and CLAUDE.md (rules 3/3b, 6–7), and the
per-PR `/review-auth` command checks the DAL-bypass failure mode explicitly
(item 9).
