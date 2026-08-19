import type { ActionFailure, ActionResult } from "@/lib/types";

/**
 * Next signals navigation by REJECTING the action's client-side promise.
 *
 * `redirect()` inside an action surfaces at the caller as an Error whose message (and,
 * server-side, whose `digest`) is `NEXT_REDIRECT`. It is control flow, not a failure —
 * measured against a production build: the router performs the navigation regardless of
 * what the caller does with the rejection, so the caller's job is simply not to report
 * it as an error. A catch-all here turned every successful "New note" into
 * "Couldn't create the note. Try again." while the editor opened behind the toast.
 *
 * `NEXT_HTTP_ERROR_FALLBACK` is the same kind of signal for `notFound()`. No action in
 * this app calls it today; it is matched so the next one does not have to rediscover
 * this.
 */
const FRAMEWORK_SIGNALS = ["NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK"];

/**
 * The `digest` Next attaches to an error that CROSSED THE SERVER BOUNDARY, or null.
 *
 * It is the only thing at the client that distinguishes "the action ran and threw"
 * from "the request never arrived": a transport rejection is a plain DOM
 * `TypeError` with no digest, while an exception raised inside the action is
 * re-thrown here carrying one (in production it is all that survives — the message
 * is replaced by the digest; in development Next forwards the real message too).
 */
function digestOf(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : null;
}

function isFrameworkSignal(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const marks = [error.message, digestOf(error) ?? ""];
  return FRAMEWORK_SIGNALS.some((signal) => marks.some((mark) => mark.startsWith(signal)));
}

/**
 * Calls a Server Action and returns a result instead of throwing.
 *
 * WHY THIS EXISTS — a Server Action call is a `fetch`, and a `fetch` on a dead
 * network REJECTS. It does not resolve with the action's return value, because the
 * action never ran. Every `await someAction()` in a client component is therefore two
 * outcomes, not one: the action's result, or a transport failure — and the failure is
 * exactly the case SPEC rule B8 is about.
 *
 * Measured in Chrome with the network offline (Phase 4, Box 3): the rejection arrives
 * as `Uncaught (in promise) TypeError: Failed to fetch at fetchServerAction`, and the
 * damage is not the missing message. In `NoteEditor` the throw skipped the line that
 * cleared the in-flight flag, so the flag stayed set, every later save returned early,
 * and the user's text was never written even after the network came back. In dev it
 * also fed the error overlay, which POSTs the stack trace — one action POST plus one
 * overlay POST per failure, and the overlay's own re-render produced more attempts.
 *
 * So: no client component may `await` an action bare. Wrap the call here, and handle
 * `unavailable` like any other failure the server could have reported.
 *
 * Deliberately NOT a retry: retrying is a policy decision that belongs to the caller
 * (rule B8's ladder lives in `NoteEditor`, and "Couldn't create the note. Try again."
 * hands that decision to the user). This function only translates.
 */
export async function callAction<T>(run: () => Promise<T>): Promise<T | ActionResult> {
  try {
    return await run();
  } catch (error) {
    if (isFrameworkSignal(error)) {
      // The action ran and asked the router to navigate. Reported as success: the
      // navigation is already under way, and the caller must not raise a failure for
      // it. Swallowing the signal here is what keeps it from also surfacing as an
      // unhandled rejection (which in dev lights up the error overlay).
      return { ok: true };
    }
    // TWO FAILURES REACH HERE, and they deserve different severities — logging both
    // at one level makes one of them a lie. Developer-visible only either way: the
    // user-facing message is the caller's business, and every string it could use
    // lives in lib/copy.ts (rule 10).
    //
    // NO DIGEST — the request never arrived (offline, dev server down). This is the
    // HANDLED case: it is already modelled as a structured `unavailable` result that
    // every caller answers (rule B8's ladder, the create/delete toasts), so nothing
    // is unaccounted for. At `error` it also fed the Next dev overlay a "Failed to
    // fetch" card with a call stack over the app on every offline save — a real
    // defect's presentation for behaviour the app delivers exactly as specified.
    // `warn` keeps the whole context in the console without claiming the app broke.
    //
    // WITH A DIGEST — the action RAN and threw on the server: a bug in the action, a
    // Supabase client that threw instead of returning, a serialization failure. That
    // is unhandled by definition, so it keeps `error` and it keeps the overlay. It
    // also gets its own message: "never ran" was false for this case, and a wrong
    // message is worse than a wrong level, because it sends the reader looking at the
    // network when the fault is on the server.
    //
    // Framework signals (NEXT_REDIRECT) carry a digest too and are already gone by
    // here — isFrameworkSignal runs first, above. Misclassification in either
    // direction changes only the log line: the returned result is `unavailable`
    // either way, so no caller's behaviour depends on getting this split right.
    if (digestOf(error) !== null) {
      console.error("[callAction] the action threw", error);
    } else {
      console.warn("[callAction] the action never ran", error);
    }
    return { ok: false, failure: "unavailable" } satisfies ActionFailure;
  }
}
