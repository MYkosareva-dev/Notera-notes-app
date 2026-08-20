#!/usr/bin/env node
/**
 * `npm run check` — the mechanical half of SPEC Block H, in one command.
 *
 * Zero dependencies (CLAUDE.md: no new packages) and no shell, so it behaves the same
 * in PowerShell, bash and CI. It promotes Block H checks 5 and 6 from "the owner greps
 * at review time" into something that fails loudly, and adds the mechanical form of
 * rule 7 — every notes query filters by `user_id`. That last one is the highest-value
 * guard this project can automate, because dropping an ownership filter would still
 * typecheck, still build, and still pass every other gate.
 *
 * WHAT THIS CANNOT DO, stated so nobody mistakes green for proof: it reads text. It can
 * see that `.eq("user_id", …)` sits inside a query chain; it cannot see whether that
 * chain is the one a page actually calls, whether the id came from `getUser()` rather
 * than a request body, or whether RLS is still enabled on the table. Those are review
 * questions (`.claude/commands/review-auth.md`) and dashboard checks, and this script
 * is not a substitute for either.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const CODE_DIRS = ["app", "components", "lib"];
const CODE_FILES = ["proxy.ts"];
const CODE_EXT = [".ts", ".tsx"];

/** Every code file under the given dirs/files, as repo-relative posix paths. */
function collect(dirs, files, exts) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.some((e) => entry.endsWith(e))) out.push(full);
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  for (const f of files) if (existsSync(join(ROOT, f))) out.push(join(ROOT, f));
  return out.map((p) => relative(ROOT, p).split(sep).join("/"));
}

const FROM_LITERAL = /\.from\("notes"\)/;
const CODE = collect(CODE_DIRS, CODE_FILES, CODE_EXT);
const SQL = collect(["supabase"], [], [".sql"]);
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Every line matching `re`, as "path:line: text" — the failure detail. */
function hits(paths, re) {
  const found = [];
  for (const p of paths) {
    read(p).split(/\r?\n/).forEach((line, i) => {
      if (re.test(line)) found.push(`${p}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  return found;
}

const checks = [];
const check = (name, why, fn) => checks.push({ name, why, fn });

// ── Block H check 5, first grep ────────────────────────────────────────────────
check(
  "no web storage",
  "rule 6 — Supabase is the only persistence layer, for notes and for the session",
  () => hits(CODE, /localStorage|sessionStorage/i),
);

// ── Block H check 5, second grep. Application code only: prose about the key is not
//    a use of it, so .agents/skills/, docs/, WORKLOG.md and .next/ are out of scope
//    by design (SPEC Block H check 5 names the known prose hits). ────────────────
check(
  "no service-role key",
  "rule 4 — this project needs only the anon key",
  () => hits([...CODE, ...SQL], /service_role|SERVICE_ROLE/i),
);

// ── Block H check 6. Matches a CALL (`.getSession(`), not the many comments that
//    name `getSession()` to explain why it is never called. ─────────────────────
check(
  "no getSession() call sites",
  "rule 2 — getSession() does not validate the token, so it cannot decide access",
  () => hits(CODE, /\.getSession\s*\(/),
);

// ── rule 3b: one chokepoint for notes data ────────────────────────────────────
check(
  "every notes query lives in the DAL",
  "rule 3b — no page, component or Server Action touches the notes table directly",
  () => hits(CODE, /\.from\("notes"\)/).filter((h) => !h.startsWith("lib/notes.ts:")),
);

// ── rule 7, mechanically: each query chain carries the ownership filter ────────
check(
  "every notes query filters by user_id",
  "rule 7 — the explicit filter is mandatory even with RLS enabled",
  () => {
    const src = read("lib/notes.ts");
    const bad = [];
    let seen = 0;
    // Scoped to the STATEMENT, not to a window of lines. A fixed window is fooled by
    // the next query's filter when two chains sit close together — a broken chain then
    // borrows its neighbour's `.eq("user_id", …)` and the check passes. So each match
    // runs to whichever comes first: the `;` that ends its chain, or the next query.
    const FROM = /\.from\("notes"\)/g;
    for (let m = FROM.exec(src); m; m = FROM.exec(src)) {
      seen += 1;
      const rest = src.slice(m.index + m[0].length);
      const semi = rest.indexOf(";");
      const next = rest.search(FROM_LITERAL);
      const stop = Math.min(...[semi, next].filter((n) => n >= 0), rest.length);
      const chain = rest.slice(0, stop);
      const owned = /\.eq\("user_id",/.test(chain) || /user_id:\s*user\.id/.test(chain);
      if (!owned) {
        // Line number by counting newlines - no regex, so nothing to escape.
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`lib/notes.ts:${line}: query with no user_id in its chain`);
      }
    }
    if (seen === 0) bad.push("lib/notes.ts: no notes query found at all — has the DAL moved?");
    return bad;
  },
);

// ── The phantom-dialog regression, guarded by one line ────────────────────────
check(
  "the dialog spells out both states",
  "a closed <dialog> painted over the editor once, with its Delete armed — the fix is that both `hidden` and `open:flex` are present",
  () => {
    const src = read("components/ConfirmDialog.tsx");
    const decl = src.match(/const DIALOG_CLASS\s*=\s*\n?\s*"([^"]*)"/);
    if (!decl) return ["components/ConfirmDialog.tsx: DIALOG_CLASS not found"];
    const missing = ["hidden", "open:flex"].filter((c) => !decl[1].split(/\s+/).includes(c));
    return missing.map((c) => `components/ConfirmDialog.tsx: DIALOG_CLASS is missing \`${c}\``);
  },
);

// ── Two prohibitions from SPEC Block A / rule 5 ───────────────────────────────
check(
  "no dangerouslySetInnerHTML",
  "SPEC Block A — prohibited outright (it is also why no copy string is ever HTML)",
  () => hits(CODE, /dangerouslySetInnerHTML\s*[=:]/),
);
check(
  "no hardcoded email addresses",
  "rule 5 — no address literal anywhere in the code",
  () => hits(CODE, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/),
);

// ── App Router only ───────────────────────────────────────────────────────────
check(
  "no pages/ directory",
  "SPEC Block A — App Router only; a stray pages/ dir changes routing silently",
  () => (existsSync(join(ROOT, "pages")) ? ["pages/ exists"] : []),
);

let failed = 0;
console.log(`checking ${CODE.length} code files and ${SQL.length} sql files\n`);
for (const { name, why, fn } of checks) {
  let found;
  try {
    found = fn();
  } catch (error) {
    found = [`check itself threw: ${error.message}`];
  }
  if (found.length === 0) {
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${why}`);
    for (const line of found) console.log(`        ${line}`);
  }
}
console.log(
  `\n${checks.length - failed}/${checks.length} passed` +
    (failed ? " — see the lines above\n" : "\n"),
);
process.exit(failed === 0 ? 0 : 1);
