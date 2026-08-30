---
description: Run all three security scanners in parallel and merge their findings into one severity-grouped report.
---

Run a full security scan of this project using all three scanner subagents, then
merge their output into a single report.

## Dispatch — all three at once

Launch these three subagents **in parallel**, as three Agent tool calls in a
SINGLE message. Do not run them one after another, and do not wait for one
report before starting the next:

- `supabase-security-scanner` — RLS gaps, missing or incomplete policies,
  `service_role` / `sb_secret_…` exposure, public storage buckets, policies that
  trust user-editable data.
- `nextjs-security-scanner` — secrets behind `NEXT_PUBLIC_*`, whole records
  crossing the server/client boundary, Server Actions and route handlers without
  their own auth check, ownership gaps (IDOR), data access outside `lib/notes.ts`.
- `vercel-security-scanner` — deployment layer: environment-variable scoping and
  Sensitive marking, preview-deployment protection, security response headers,
  whether a committed secret was ever rotated.

Give each one the same scope: the whole repository as it stands on the current
branch. Each already carries its own checklist and reporting format — do not
restate their checks in the prompt, just tell them the scope.

## Report only — no code changes

This command audits. Neither you nor any subagent may edit, create, or delete a
file, run a migration or any SQL that writes, deploy, build, or open a PR. If a
finding suggests an obvious fix, write the fix down as one line — do not apply
it. The owner decides what gets changed.

Do not print the VALUE of any environment variable, key, or secret that appears
in a scanner's output. Names and prefixes only.

## Merging the three reports

Wait for all three to finish, then produce ONE report. Do not paste the three
reports end to end.

**Group by severity, in this order: Critical, High, Medium, Low.** Use the band
the scanner assigned. Two scanners will sometimes rate the same issue
differently — place it in the HIGHER band and say so in its entry ("nextjs: High,
supabase: Medium"). The Supabase scanner has no Low band; that is expected, not a
gap.

**Deduplicate by underlying cause, not by wording.** Two findings are the same
finding when they name the same file and line, the same variable, the same table
or policy, or the same route — even when the sentences differ completely. List it
once, with the merged detail, and mark which scanners flagged it:

    ### Publishable key check does not catch a legacy service_role JWT
    Flagged by: supabase-security-scanner, nextjs-security-scanner
    Location: lib/supabase/env.ts:14
    What could go wrong: …
    Fix: …

For a finding only one scanner raised, mark it the same way with the single name.
Rank most severe first inside each band. An issue confirmed independently by two
scanners is stronger evidence than one seen once — say that where it matters, but
never merge two genuinely different problems just because they sit in one file.

## Sections that must survive the merge

- **Unverified — for the owner.** The Vercel scanner returns an explicit
  Unverified list of dashboard- or CLI-checkable questions. Carry it through
  whole, at the end, after the severity bands. Add anything the other two
  scanners said they could not confirm statically. This section is a deliverable.
- **Checks run.** End with one combined coverage table: each scanner, each of its
  checks, and what that check returned — including the clean ones. A merged report
  that lists only hits is indistinguishable from one where a scanner died early.
- **Scanner failures.** If a scanner returns nothing, errors, or is skipped, say
  so by name in its own line. Never let a missing report read as a clean result,
  and never fill its gap with your own guesswork.

Finish with a one-paragraph bottom line: the count per band, and the single
highest-priority thing the owner should fix first.
