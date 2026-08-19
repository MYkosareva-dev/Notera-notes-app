"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteNote, saveNote } from "@/app/notes/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { callAction } from "@/lib/callAction";
import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";
import { LIMITS } from "@/lib/types";
import type { ActionResult, NoteFailure, NotePatch, NoteView } from "@/lib/types";

/**
 * The note editor (SPEC Block E — /notes/[id], rules B1/B2/B8, edge cases G-1,
 * G-8, G-10, G-11, G-12, G-13, G-16, G-19, G-20).
 *
 * THE RULE THIS FILE EXISTS FOR (CLAUDE.md rule 9 / SPEC B2): the inputs are bound
 * to local state and nothing else. A save is a separate, debounced thing that
 * happens *near* the typing, never *in* it — binding an input to a server round-trip
 * is what made the previous project's editor lag, and here it would also mean losing
 * keystrokes whenever the network hiccuped.
 *
 * The consequences of that separation are the rest of the file:
 *
 * - `draft` (a ref, always current) is what the user has typed; `saved` (a ref) is
 *   what the server has confirmed. A save sends the difference and only advances
 *   `saved` when the action says `ok` — SPEC G-10: the "Saved" indicator is never a
 *   guess, it is a confirmation.
 * - The user's text is never rolled back on a failure (rule B8). A failed save
 *   leaves `draft` alone and retries it; what changes is the notice on screen.
 * - Every failure gets its own behaviour: retry with backoff for a network blip, a
 *   persistent notice with **Retry now** when the retries run out, a sign-in prompt
 *   for an expired session (G-1), and a redirect when the note itself is gone (G-13).
 *   That is what the discriminated `NoteFailure` is for — a single message string
 *   could not tell these apart. A dead network is one of those failures and reaches
 *   here as `unavailable`, because every action call goes through `callAction`: an
 *   action that never ran rejects rather than returning, and an `await` on it would
 *   otherwise take the whole save engine down with it (see that file).
 * - After the ladder is spent the engine STOPS on purpose and waits for **Retry now**.
 *   Rule B8 ends in a user-driven affordance, so continuing to fire a save on every
 *   keystroke against a network that is still down would be both unspecced and
 *   invisible — the notice would sit there while attempts piled up behind it.
 *   Decided at the Phase 4 gate and recorded in SPEC B8: there is deliberately NO
 *   auto-resume when the network returns. Adding an `online` listener here would be a
 *   behaviour change, not a fix — it is a post-sprint candidate.
 * - Pending changes are flushed on unmount (G-12), so navigating away one keystroke
 *   after typing still saves.
 *
 * All copy comes from lib/copy.ts (rule 10) and all writes go through the Server
 * Actions in app/notes/actions.ts, which go through the DAL (rules B1, B3b). This
 * component never sees a Supabase client and never sees `user_id` — its prop type is
 * `NoteView`, which does not have one.
 */

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 5_000;
/** SPEC rule B8: retry ×3, at 1 s / 2 s / 4 s. */
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000] as const;

/**
 * One dedupe key for every save notice, so the retry sequence updates a single
 * toast in place instead of stacking four (SPEC B8 asks for one notice).
 */
const SAVE_TOAST_KEY = "note-save";
const TITLE_LIMIT_TOAST_KEY = "title-limit";
const CONTENT_LIMIT_TOAST_KEY = "content-limit";

interface Draft {
  title: string;
  content: string;
}

/** The fields that differ, or null when the server is already up to date. */
function diff(draft: Draft, saved: Draft): NotePatch | null {
  const patch: NotePatch = {};
  if (draft.title !== saved.title) {
    patch.title = draft.title;
  }
  if (draft.content !== saved.content) {
    patch.content = draft.content;
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

export function NoteEditor({ note }: { note: NoteView }) {
  const router = useRouter();
  const { showToast, dismissKey } = useToast();

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  /**
   * "saved" appears only after a confirmed round-trip (G-10). "saving" covers typed
   * but not yet sent, in flight, and waiting on a retry — all of which are real
   * progress. "failed" exists because "Saving…" must not claim progress that has
   * stopped: once the ladder is spent, or the session is gone, nothing is in flight
   * and the indicator has to say so (SPEC Block E footer).
   */
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  const draft = useRef<Draft>({ title: note.title, content: note.content });
  const saved = useRef<Draft>({ title: note.title, content: note.content });

  const debounceTimer = useRef<number | null>(null);
  const maxWaitTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  /**
   * Set when the retry ladder is spent, or when retrying cannot help (an expired
   * session). Automatic saving stops until **Retry now** clears it — the text stays
   * on screen and in `draft` throughout, so nothing is lost by waiting.
   */
  const suspended = useRef(false);
  /**
   * Set when this note is deliberately left behind — deleted, or found to be gone.
   * It stops the unmount flush from re-saving a row that should not come back and
   * from raising a second notice on the screen the user just landed on.
   */
  const abandoned = useRef(false);

  const clearTimer = (timer: { current: number | null }) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Stops everything pending — used when the note is abandoned (deleted or gone). */
  const clearSaveTimers = useCallback(() => {
    clearTimer(debounceTimer);
    clearTimer(maxWaitTimer);
    clearTimer(retryTimer);
  }, []);

  const notifyFailure = useCallback(
    (failure: NoteFailure) => {
      if (failure === "sessionExpired") {
        // SPEC G-1. Persistent, because there is nothing the app can retry on the
        // user's behalf — and their text stays on screen while they decide. Saving
        // stops too: every further attempt would fail identically and silently.
        suspended.current = true;
        showToast(copy.notes.save.sessionExpired, {
          variant: "danger",
          duration: "persistent",
          key: SAVE_TOAST_KEY,
          action: {
            label: copy.notes.save.signIn,
            onClick: () => router.push(ROUTES.signIn),
          },
        });
        return;
      }

      if (failure === "notFound") {
        // SPEC G-13: deleted elsewhere. Stop trying to save it and leave.
        abandoned.current = true;
        clearSaveTimers();
        showToast(copy.notes.gone, { variant: "danger", key: SAVE_TOAST_KEY });
        router.replace(ROUTES.notes);
        return;
      }

      // "invalid" and "limitReached": the editor blocks both before they can
      // happen, so reaching here means a payload this UI did not send.
      showToast(copy.errors.generic, { variant: "danger", key: SAVE_TOAST_KEY });
    },
    [clearSaveTimers, router, showToast],
  );

  /**
   * Sends one patch and owns the whole outcome, including the retry ladder.
   *
   * `attempt` counts retries, not attempts: 0 is the first try. Each retry
   * re-derives the patch from the CURRENT draft, so text typed during the backoff
   * rides along instead of waiting for its own round-trip.
   */
  const attemptSave = useCallback(
    async (attempt: number): Promise<void> => {
      const patch = diff(draft.current, saved.current);
      if (patch === null) {
        return;
      }

      const sent: Draft = { ...draft.current };
      inFlight.current = true;
      // callAction, never a bare await: an action that never ran rejects, and a throw
      // here would leave inFlight set forever — which is exactly how the offline bug
      // silenced every later save (Box 3).
      let result: ActionResult;
      try {
        result = await callAction(() => saveNote(note.id, patch));
      } finally {
        inFlight.current = false;
      }

      // The component may have unmounted mid-flight (G-12's fire-and-forget case
      // included). The write still landed; there is just nobody to tell.
      if (!mounted.current || abandoned.current) {
        return;
      }

      if (result.ok) {
        saved.current = sent;
        suspended.current = false;
        dismissKey(SAVE_TOAST_KEY);
        // Anything typed while this was in flight is now the difference; save it.
        if (diff(draft.current, saved.current) === null) {
          setSaveState("saved");
        } else {
          void attemptSave(0);
        }
        return;
      }

      if (result.failure !== "unavailable") {
        setSaveState("failed");
        notifyFailure(result.failure);
        return;
      }

      const backoff = RETRY_BACKOFF_MS[attempt];
      if (backoff === undefined) {
        // Retries exhausted (rule B8): stop, say so, and hand the next move to the
        // user. The draft is untouched, so Retry now resumes from the current text.
        suspended.current = true;
        clearTimer(debounceTimer);
        clearTimer(maxWaitTimer);
        setSaveState("failed");
        showToast(copy.notes.save.failed, {
          variant: "danger",
          duration: "persistent",
          key: SAVE_TOAST_KEY,
          action: {
            label: copy.notes.save.retryNow,
            onClick: () => {
              suspended.current = false;
              setSaveState("saving");
              showToast(copy.notes.save.retrying, { key: SAVE_TOAST_KEY });
              void attemptSave(0);
            },
          },
        });
        return;
      }

      // One notice for the whole ladder (the dedupe key), shown from the first
      // failure — not one per attempt.
      showToast(copy.notes.save.retrying, { key: SAVE_TOAST_KEY });
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = null;
        void attemptSave(attempt + 1);
      }, backoff);
    },
    [dismissKey, note.id, notifyFailure, showToast],
  );

  /** Fires the debounce/maxWait timers' payload. */
  const flush = useCallback(() => {
    clearTimer(debounceTimer);
    clearTimer(maxWaitTimer);

    if (abandoned.current || suspended.current) {
      return;
    }
    // A save is already on the wire, or a retry is already scheduled. Either one
    // re-derives the patch from the CURRENT draft when it runs, so a second write
    // would only duplicate it — and restarting the ladder on every keystroke is how
    // a retry policy turns into a request loop.
    if (inFlight.current || retryTimer.current !== null) {
      return;
    }
    void attemptSave(0);
  }, [attemptSave]);

  /**
   * The debounce (rule B2): 300 ms of quiet sends the change, and a 5 s maxWait
   * forces a save during continuous typing (G-11) so a long paragraph is never one
   * unsaved blob.
   */
  const scheduleSave = useCallback(() => {
    // The indicator follows the text, not the transport: unsaved is unsaved even
    // while a notice is on screen. It only goes back to "failed" from the failure
    // path itself.
    setSaveState((current) => (current === "failed" ? "failed" : "saving"));

    // Suspended: the persistent notice owns the next move (rule B8). A pending retry
    // will carry this edit along, so neither case wants a fresh timer.
    if (suspended.current || retryTimer.current !== null) {
      return;
    }

    clearTimer(debounceTimer);
    debounceTimer.current = window.setTimeout(flush, DEBOUNCE_MS);

    if (maxWaitTimer.current === null) {
      maxWaitTimer.current = window.setTimeout(flush, MAX_WAIT_MS);
    }
  }, [flush]);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      clearTimer(debounceTimer);
      clearTimer(maxWaitTimer);
      clearTimer(retryTimer);

      if (abandoned.current) {
        return;
      }

      // SPEC G-12 — save-on-unmount. Deliberately not awaited: the component is
      // going away, and the POST completes on its own. Nothing here touches state
      // afterwards (`mounted` is already false), so there is nothing to leak.
      const pending = diff(draft.current, saved.current);
      if (pending !== null) {
        // Through callAction as well: the component is already gone, so a rejection
        // here has nobody to report to and would surface as an unhandled rejection.
        void callAction(() => saveNote(note.id, pending));
      }
    };
  }, [note.id]);

  function handleTitleChange(value: string) {
    if (value.length > LIMITS.titleMax) {
      // SPEC Block F: block further input, toast once (the key does the "once").
      showToast(copy.limits.titleTooLong, {
        variant: "danger",
        key: TITLE_LIMIT_TOAST_KEY,
      });
      return;
    }
    setTitle(value);
    draft.current = { ...draft.current, title: value };
    scheduleSave();
  }

  function handleContentChange(value: string) {
    if (value.length > LIMITS.contentMax) {
      showToast(copy.limits.contentTooLong, {
        variant: "danger",
        key: CONTENT_LIMIT_TOAST_KEY,
      });
      return;
    }
    setContent(value);
    draft.current = { ...draft.current, content: value };
    scheduleSave();
  }

  function handleDelete() {
    // Stop the autosave machinery first: a pending debounce firing after the row is
    // gone would answer with G-13's "no longer exists" notice for a note the user
    // deleted on purpose.
    abandoned.current = true;
    clearSaveTimers();
    dismissKey(SAVE_TOAST_KEY);

    startDeleting(async () => {
      const result = await callAction(() => deleteNote(note.id));

      if (result.ok) {
        showToast(copy.notes.deleted);
        router.replace(ROUTES.notes);
        return;
      }

      if (result.failure === "notFound") {
        // Already gone — the user's intent is satisfied either way.
        showToast(copy.notes.gone, { variant: "danger" });
        router.replace(ROUTES.notes);
        return;
      }

      // The note is still there, so editing must keep working.
      abandoned.current = false;
      setConfirmOpen(false);
      notifyFailure(result.failure);
    });
  }

  return (
    <>
      {/* Borderless title input, SPEC Block E. Local state only — value comes from
          `title`, never from a server round-trip. */}
      <input
        type="text"
        value={title}
        onChange={(event) => handleTitleChange(event.target.value)}
        placeholder={copy.notes.untitled}
        aria-label={copy.notes.editor.titleLabel}
        // Not `maxLength`: the cap has to be *explained* (Block F copy), and a
        // silent browser truncation says nothing. handleTitleChange rejects the
        // keystroke and toasts instead.
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-text-muted focus-visible:outline-none"
      />

      <textarea
        value={content}
        onChange={(event) => handleContentChange(event.target.value)}
        placeholder={copy.notes.editor.contentPlaceholder}
        aria-label={copy.notes.editor.contentLabel}
        className="mt-6 min-h-[60dvh] w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-text-muted focus-visible:outline-none"
      />

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p
          aria-live="polite"
          className={`text-xs ${saveState === "failed" ? "text-danger" : "text-text-muted"}`}
        >
          {saveState === "saved"
            ? copy.notes.editor.saved
            : saveState === "saving"
              ? copy.notes.editor.saving
              : copy.notes.save.failed}
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {copy.notes.delete.action}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={copy.notes.delete.confirmTitle}
        confirmLabel={copy.notes.delete.confirm}
        cancelLabel={copy.notes.delete.cancel}
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          // Cancel does nothing else, by design (US4 step 3).
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
