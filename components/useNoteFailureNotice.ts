"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";

/**
 * ONE dedupe key for every notice about a note operation, shared by every screen that
 * can raise one.
 *
 * SPEC Block E's Toast row says the single queue exists so two notices cannot overlap.
 * That property is a function of the key, not of the queue: while the editor and the
 * card menu each built their own notice with their own key, two persistent
 * "Your session expired." banners could stack — the exact thing the rule excludes.
 */
export const NOTE_NOTICE_KEY = "note-notice";

/**
 * The failure→notice policy for notes, in one place.
 *
 * It exists because the policy was written twice — once in `NoteEditor`, once in
 * `NoteCardMenu` — and had already drifted before the branch closed: different dedupe
 * keys, and different recovery for the same `notFound`. What a save failure or a delete
 * failure LOOKS like now has one home; what each screen DOES about it afterwards
 * (navigate, refresh, keep editing) stays with the screen, because that genuinely
 * differs.
 *
 * Every string comes from lib/copy.ts (rule 10). The returned object is memoized, so
 * callers may list it in a dependency array.
 */
export function useNoteFailureNotice() {
  const router = useRouter();
  const { showToast, dismissKey } = useToast();

  /** SPEC G-1. Persistent: nothing can be retried on the user's behalf. */
  const showSessionExpired = useCallback(() => {
    showToast(copy.notes.save.sessionExpired, {
      variant: "danger",
      duration: "persistent",
      key: NOTE_NOTICE_KEY,
      action: {
        label: copy.notes.save.signIn,
        onClick: () => router.push(ROUTES.signIn),
      },
    });
  }, [router, showToast]);

  /** SPEC B8, after the ladder: persistent, with the user-driven way out. */
  const showRetryable = useCallback(
    (onRetry: () => void) => {
      showToast(copy.notes.save.failed, {
        variant: "danger",
        duration: "persistent",
        key: NOTE_NOTICE_KEY,
        action: { label: copy.notes.save.retryNow, onClick: onRetry },
      });
    },
    [showToast],
  );

  /**
   * SPEC B8, the refused-patch case: persistent, with the same **Retry now** as the
   * retryable one. The action matters more here than it looks — the user's way out is
   * to change what they typed (remove the offending chip), and saving stays suspended
   * until something asks for it, so without a button the fix would sit on screen
   * unsaved. Retry now is what turns a corrected note back into a saved one.
   */
  const showRejected = useCallback(
    (onRetry: () => void) => {
      showToast(copy.notes.save.rejected, {
        variant: "danger",
        duration: "persistent",
        key: NOTE_NOTICE_KEY,
        action: { label: copy.notes.save.retryNow, onClick: onRetry },
      });
    },
    [showToast],
  );

  /** SPEC B8, during the ladder: one notice for all four attempts. */
  const showRetrying = useCallback(() => {
    showToast(copy.notes.save.retrying, { key: NOTE_NOTICE_KEY });
  }, [showToast]);

  /** SPEC G-13: the row is gone. The caller decides where the user goes next. */
  const showGone = useCallback(() => {
    showToast(copy.notes.gone, { variant: "danger", key: NOTE_NOTICE_KEY });
  }, [showToast]);

  /** Anything the UI does not model — a payload it could not have sent. */
  const showGeneric = useCallback(() => {
    showToast(copy.errors.generic, { variant: "danger", key: NOTE_NOTICE_KEY });
  }, [showToast]);

  const clear = useCallback(() => dismissKey(NOTE_NOTICE_KEY), [dismissKey]);

  return useMemo(
    () => ({
      showSessionExpired,
      showRetryable,
      showRejected,
      showRetrying,
      showGone,
      showGeneric,
      clear,
    }),
    [
      showSessionExpired,
      showRetryable,
      showRejected,
      showRetrying,
      showGone,
      showGeneric,
      clear,
    ],
  );
}
