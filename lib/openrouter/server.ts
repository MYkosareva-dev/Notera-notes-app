import "server-only";

import { copy } from "@/lib/copy";

import { OPENROUTER_API_KEY } from "./env";

/**
 * The OpenRouter connection — the ONLY module in this repo that calls a model, and the
 * only one that reads OPENROUTER_API_KEY.
 *
 * `server-only` is the load-bearing line, not decoration. CLAUDE.md ("AI model calls")
 * requires every model call to happen server-side and the key never to reach the browser;
 * a rule stated in prose is kept by whoever remembers it, while this import makes the
 * build FAIL the moment a Client Component pulls this file in. Same fence, same reason, as
 * the one at the top of lib/notes.ts. It needs no package — Next aliases the specifier —
 * but a typo in it is silently inert, so `npm run build` is what proves it is doing
 * anything.
 *
 * Three properties this file exists to guarantee:
 *
 * 1. **The key never leaves the server.** It is read in ./env, used to build one header
 *    here, and is not part of any exported value. Nothing a caller receives contains it.
 * 2. **No new dependency.** OpenRouter's API is OpenAI-compatible plain HTTP, so `fetch`
 *    is enough. The official skill (`openrouter-typescript-sdk`) recommends
 *    `@openrouter/agent`, and it is genuinely nicer for agent loops with tool calling —
 *    but CLAUDE.md forbids new packages without the owner's approval, and a single
 *    non-streaming chat call does not need one. Revisit if tool calling arrives.
 * 3. **Failures are CODES, not prose.** See ChatFailure.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, so nobody mistakes its scope: no streaming, no tool
 * calling, no conversation state, no retry. This is the connection, not a feature — SPEC
 * M15 records the amendment that allows it to exist and the fact that nothing calls it
 * yet. `scripts/verify-openrouter.mjs` is what exercises it.
 */

/** OpenRouter's chat endpoint. OpenAI-compatible, so the request body shape is theirs. */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * How long one call may take before it is abandoned.
 *
 * A model call is slow by nature and `fetch` has no timeout of its own, so without this a
 * hung provider would hold a Server Action open until the platform killed it. Generous
 * enough for a cold start on a large prompt, short enough that a caller can still show
 * something.
 */
const TIMEOUT_MS = 30_000;

/**
 * The default model: verified present in `GET /api/v1/models` at the time of writing, with
 * THREE healthy provider endpoints (OpenAI plus two Azure regions).
 *
 * That last part is the actual reason, and it is why this is not simply "the cheapest
 * model". OpenRouter's value is routing, so a default with one provider behind it is a
 * default that goes down when that provider does; this one survives losing two. 128k
 * context and $0.15/$0.60 per million tokens are the secondary arguments.
 *
 * Model IDs are not stable forever — `anthropic/claude-3.5-sonnet` was a valid ID within
 * this file's lifetime and is now absent from the list. Per the official
 * `openrouter-models` skill: resolve any candidate against `GET /api/v1/models` by exact
 * `id`, then check `GET /api/v1/models/{author}/{slug}/endpoints` for provider status,
 * before changing this line. `npm run verify:openrouter` does both.
 */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Why a call failed, as a CODE rather than a sentence.
 *
 * Rule 10 puts every user-visible string in lib/copy.ts, so this module must not invent
 * one. A caller maps the code it gets to copy at the point it renders — the same split
 * `NoteFailure` already uses in lib/types.ts, and the reason that type is a union of
 * literals too. The `detail` alongside it is for the server log and for a developer
 * reading a terminal; it is never the right thing to put on screen.
 */
export type ChatFailure =
  /** 401/403 — the key is missing, wrong, or revoked. A configuration fault, not a blip. */
  | "unauthorized"
  /** 402 — the account is out of credit. Also configuration, but a different fix. */
  | "outOfCredit"
  /** 429 — rate limited upstream. The one failure where retrying later is the right move. */
  | "rateLimited"
  /** 404/400 on the model — DEFAULT_MODEL (or an override) is not a routable id any more. */
  | "unknownModel"
  /** 5xx, a network error, or unparseable JSON. Retryable, like NoteFailure's `unavailable`. */
  | "unavailable"
  /** TIMEOUT_MS elapsed. Split from `unavailable` because a caller can retry it cheaply. */
  | "timeout"
  /** A 200 whose choices array carried no text. Rare, and silent if not named. */
  | "empty";

export type ChatResult =
  | { ok: true; text: string; model: string }
  | { ok: false; failure: ChatFailure; detail: string };

/** Map a non-2xx status onto the failure code a caller can act on. */
function failureForStatus(status: number): ChatFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "outOfCredit";
  if (status === 429) return "rateLimited";
  if (status === 400 || status === 404) return "unknownModel";
  return "unavailable";
}

/**
 * The assistant text out of an OpenRouter response, or null.
 *
 * Hand-narrowed from `unknown` rather than cast to a response interface. A cast would be a
 * claim about someone else's JSON that nothing checks: the first malformed payload becomes
 * a TypeError deep in a Server Action instead of the `empty` code above. `no any`
 * (CLAUDE.md Stack) is what forces the honest version, and it is the right one here.
 */
function textFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || content.trim() === "") return null;
  return content;
}

/** The error string OpenRouter puts in a failed response, when it has one. */
function detailFrom(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error !== "") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return fallback;
}

/**
 * Send one non-streaming chat completion and return its text.
 *
 * Never throws for an expected failure — every one of them comes back as
 * `{ ok: false, failure }`. A caller in a Server Action can therefore branch on the code
 * without a try/catch, which is what lib/notes.ts established for Postgres failures. It
 * CAN still throw on the first import, from ./env, when the key is missing or has been
 * exposed under a NEXT_PUBLIC_ name: that is a boot-time configuration fault and must be
 * loud, not a value a caller can shrug off.
 */
export async function chat(
  messages: readonly ChatMessage[],
  { model = DEFAULT_MODEL }: { model?: string } = {},
): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // Attribution, shown on OpenRouter's app rankings. `X-Title` only: the sibling
        // `HTTP-Referer` header wants a public URL and nothing here is deployed (SPEC
        // Block A — local only this sprint), so sending one would be a claim, not data.
        // The name comes from lib/copy.ts rather than a second literal (rule 11).
        "X-Title": copy.app.name,
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A model answer is never worth reusing from a cache, and Next caches server
      // `fetch` by default in some contexts. Stated rather than assumed.
      cache: "no-store",
    });
  } catch (error) {
    // AbortSignal.timeout() rejects with a DOMException named TimeoutError. Matched on the
    // NAME, not the message, which is not stable across runtimes.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      failure: timedOut ? "timeout" : "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // Read the body ONCE, as text, before deciding anything. A failed OpenRouter response is
  // usually JSON with an `error`, but a gateway 502 is HTML — and `await response.json()`
  // on that throws, turning a clean `unavailable` into an unhandled rejection.
  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      failure: failureForStatus(response.status),
      detail: detailFrom(payload, `HTTP ${response.status}: ${raw.slice(0, 200)}`),
    };
  }

  const text = textFrom(payload);
  if (text === null) {
    return {
      ok: false,
      failure: "empty",
      detail: detailFrom(payload, `no text in response: ${raw.slice(0, 200)}`),
    };
  }

  return { ok: true, text, model };
}
