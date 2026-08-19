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

function isFrameworkSignal(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  const marks = [error.message, typeof digest === "string" ? digest : ""];
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
    // Developer-visible only: the user-facing message is the caller's business, and
    // every string it could use lives in lib/copy.ts (rule 10).
    console.error("[callAction] the action never ran", error);
    return { ok: false, failure: "unavailable" } satisfies ActionFailure;
  }
}
