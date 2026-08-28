#!/usr/bin/env node
/**
 * `npm run verify:openrouter` — prove the OpenRouter connection actually works.
 *
 * Zero dependencies and no shell, so it behaves the same in PowerShell, bash and CI —
 * the same constraints scripts/check.mjs is written under, and for the same reason.
 *
 * `npm run check` is a TEXT scanner: it proves the key is not exposed anywhere this repo
 * ships. It cannot prove the key is valid, that the default model still routes, or that a
 * completion comes back. This script is the other half, and it is the only thing in the
 * repo that spends money — four HTTP calls, the last one a completion of a few dozen
 * tokens (well under $0.001 at the default model's price).
 *
 * Seven checks, in the order that makes a failure diagnosable — three local, then four
 * over the network:
 *   1. no NEXT_PUBLIC_ OpenRouter var exists   (local)
 *   2. OPENROUTER_API_KEY is set               (local)
 *   3. DEFAULT_MODEL is readable from source   (local)
 *   4. the key is valid            → GET  /api/v1/key
 *   5. DEFAULT_MODEL is routable   → GET  /api/v1/models          (exact `id` match)
 *   6. its providers are up        → GET  /api/v1/models/…/endpoints
 *   7. a completion comes back     → POST /api/v1/chat/completions
 *
 * The three local checks run first and gate the four network ones, because otherwise a
 * missing key fails four times over and every message says something different.
 *
 * Steps 5 and 6 are the official `openrouter-models` skill's own procedure for trusting a
 * model id, and they are here rather than in a comment because a model id is not stable:
 * `anthropic/claude-3.5-sonnet` was valid within this project's lifetime and is now absent
 * from the list. A wrong default fails as an opaque 400 at runtime; here it fails by name.
 *
 * THE KEY IS NEVER PRINTED. Not masked, not partially — this script reports its LENGTH and
 * nothing else. A verification tool that echoes the credential into a terminal, a CI log
 * or a screenshot has created the exposure it exists to rule out.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BASE = "https://openrouter.ai/api/v1";

/**
 * `.env.local`, parsed just enough.
 *
 * Node does not load `.env.local` — that is Next's doing — so a script run outside Next
 * has to read it. Deliberately minimal: `KEY=value`, `#` comments, optional surrounding
 * quotes. No `export`, no interpolation, no multi-line values. If this project's env file
 * ever needs any of those, that is the moment to reach for a real parser, not to grow
 * this one.
 */
function readEnvLocal() {
  const path = join(ROOT, ".env.local");
  const env = new Map();
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && /^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    env.set(name, value);
  }
  return env;
}

/**
 * DEFAULT_MODEL, read out of the module that declares it.
 *
 * Parsed from the TypeScript source rather than re-typed here, because rule 11 says import
 * a constant, never redeclare it — and a second copy of a model id is exactly the kind of
 * duplicate that goes stale silently, leaving this script cheerfully verifying a model the
 * app no longer asks for. It cannot be imported for real: the module starts with
 * `server-only`, which resolves only inside Next's bundler.
 *
 * A missing match is a FAILURE, not a fallback to a hardcoded guess. Renaming the constant
 * would otherwise leave this script testing a stale literal while reporting PASS — the same
 * "passed because it scanned nothing" trap the preflight in check.mjs was written for.
 */
function readDefaultModel() {
  const rel = "lib/openrouter/server.ts";
  const path = join(ROOT, rel);
  if (!existsSync(path)) return { error: `${rel} is missing` };
  const src = readFileSync(path, "utf8");
  const match = src.match(/export\s+const\s+DEFAULT_MODEL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (!match) return { error: `no DEFAULT_MODEL literal found in ${rel}` };
  return { model: match[1] };
}

/** GET/POST as JSON, with a timeout, never throwing. */
async function call(path, { method = "GET", key, body } = {}) {
  const headers = { Accept: "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body) headers["Content-Type"] = "application/json";
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    return { status: response.status, ok: response.ok, json, raw };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return { status: 0, ok: false, json: null, raw: timedOut ? "timed out" : String(error) };
  }
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};

// ── 1. the key is present, and not browser-exposed ────────────────────────────
// The env file is READ here but its values are never printed. `npm run check`
// deliberately does not scan .env* at all, precisely so a finding cannot echo a real
// secret; this script honours the same rule the only way it can while still using the key
// — it reports NAMES and LENGTHS, never a value.
const env = readEnvLocal();
const key = process.env.OPENROUTER_API_KEY ?? env.get("OPENROUTER_API_KEY");

const exposed = [...env.keys()].filter(
  (name) => name.startsWith("NEXT_PUBLIC_") && new RegExp("OPEN" + "ROUTER", "i").test(name),
);

if (exposed.length > 0) {
  record(
    "key is not exposed to the browser",
    false,
    `.env.local defines ${exposed.join(", ")} — every NEXT_PUBLIC_* value is inlined into ` +
      "the browser bundle. Remove it, then rotate the key at " +
      "https://openrouter.ai/settings/keys",
  );
} else {
  record("key is not exposed to the browser", true, "no NEXT_PUBLIC_ OpenRouter var");
}

const haveKey = record(
  "OPENROUTER_API_KEY is set",
  Boolean(key),
  key ? `${key.length} chars (value never printed)` : "not in .env.local or the environment",
);

const { model, error: modelError } = readDefaultModel();
record("DEFAULT_MODEL is readable from lib/openrouter/server.ts", Boolean(model), model ?? modelError);

// Every remaining check needs the key and the model. Bailing out beats four confusing
// network failures that all mean "step 1 failed".
if (haveKey && model) {
  // ── 2. the key is valid ─────────────────────────────────────────────────────
  const keyInfo = await call("/key", { key });
  // `data.label` is NOT printed, and that is not an oversight. OpenRouter's default label
  // for a key is a TRUNCATED COPY OF THE KEY ITSELF — first characters, ellipsis, last
  // characters. Reporting it looked like harmless provenance and was in fact this script
  // printing part of the credential into a terminal, on the one line whose docblock
  // promises it never does. Found by running the script and reading its own output.
  // Usage and limit say everything a verification needs: the key authenticated.
  const limit = keyInfo.json?.data?.limit;
  record(
    "the key is valid",
    keyInfo.ok,
    keyInfo.ok
      ? `authenticated; usage $${keyInfo.json?.data?.usage ?? "?"}` +
          (limit === null || limit === undefined ? ", no spend limit set" : `, limit $${limit}`)
      : `HTTP ${keyInfo.status} ${String(keyInfo.json?.error?.message ?? keyInfo.raw).slice(0, 120)}`,
  );

  // ── 3. DEFAULT_MODEL is routable — EXACT id match, per the openrouter-models skill ──
  const models = await call("/models");
  const found = models.ok && Array.isArray(models.json?.data)
    ? models.json.data.find((m) => m.id === model)
    : undefined;
  record(
    `${model} is a routable model id`,
    Boolean(found),
    found
      ? `context ${found.context_length}, $${(Number(found.pricing?.prompt) * 1e6).toFixed(3)}/M in`
      : models.ok
        ? `absent from the ${models.json?.data?.length ?? 0}-model list — pick a new DEFAULT_MODEL`
        : `could not fetch the model list (HTTP ${models.status})`,
  );

  // ── 4. its providers are up ─────────────────────────────────────────────────
  // `status` is 0 when a provider endpoint is healthy; a negative value means degraded or
  // disabled. A model with every endpoint down is routable and still cannot answer.
  const endpoints = await call(`/models/${model}/endpoints`);
  const list = endpoints.ok && Array.isArray(endpoints.json?.data?.endpoints)
    ? endpoints.json.data.endpoints
    : [];
  const healthy = list.filter((e) => (e.status ?? 0) >= 0);
  record(
    `${model} has a healthy provider`,
    healthy.length > 0,
    list.length > 0
      ? `${healthy.length}/${list.length} up: ${healthy.map((e) => e.provider_name).join(", ")}`
      : `no endpoint data (HTTP ${endpoints.status})`,
  );

  // ── 5. a completion comes back ──────────────────────────────────────────────
  // The one call that spends money. `max_tokens` is small on purpose: this proves the
  // round trip, it is not a demo of the model.
  const completion = await call("/chat/completions", {
    method: "POST",
    key,
    body: {
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: "Reply with exactly: connection ok" }],
    },
  });
  const text = completion.json?.choices?.[0]?.message?.content;
  record(
    "a chat completion comes back",
    completion.ok && typeof text === "string" && text.trim() !== "",
    completion.ok
      ? `model answered: ${JSON.stringify(String(text ?? "").trim().slice(0, 60))}`
      : `HTTP ${completion.status} ${String(completion.json?.error?.message ?? completion.raw).slice(0, 120)}`,
  );
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exitCode = failed === 0 ? 0 : 1;
