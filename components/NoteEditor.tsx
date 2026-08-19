"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteNote, saveNote } from "@/app/notes/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";
import { LIMITS } from "@/lib/types";
import type { NoteFailure, NotePatch, NoteView } from "@/lib/types";

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
 * - Every failure the server can report gets its own behaviour: retry with backoff
 *   for a network blip, a persistent notice with **Retry now** when the retries run
 *   out, a sign-in prompt for an expired session (G-1), and a redirect when the note
 *   itself is gone (G-13). That is what the discriminated `NoteFailure` is for — a
 *   single message string could not tell these apart.
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
  // "saved" appears only after a confirmed round-trip (G-10). Everything else —
  // typed but not yet sent, in flight, or failed and retrying — is "Saving…".
  const [isSaved, setIsSaved] = useState(true);
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

  const clearSaveTimers = useCallback(() => {
    clearTimer(debounceTimer);
    clearTimer(maxWaitTimer);
    clearTimer(retryTimer);
  }, []);

  const notifyFailure = useCallback(
    (failure: NoteFailure) => {
      if (failure === "sessionExpired") {
        // SPEC G-1. Persistent, because there is nothing the app can retry on the
        // user's behalf — and their text stays on screen while they decide.
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
      const result = await saveNote(note.id, patch);
      inFlight.current = false;

      // The component may have unmounted mid-flight (G-12's fire-and-forget case
      // included). The write still landed; there is just nobody to tell.
      if (!mounted.current || abandoned.current) {
        return;
      }

      if (result.ok) {
        saved.current = sent;
        dismissKey(SAVE_TOAST_KEY);
        // Anything typed while this was in flight is now the difference; save it.
        if (diff(draft.current, saved.current) === null) {
          setIsSaved(true);
        } else {
          void attemptSave(0);
        }
        return;
      }

      if (result.failure !== "unavailable") {
        notifyFailure(result.failure);
        return;
      }

      const backoff = RETRY_BACKOFF_MS[attempt];
      if (backoff === undefined) {
        // Retries exhausted: the persistent notice with Retry now (rule B8).
        showToast(copy.notes.save.failed, {
          variant: "danger",
          duration: "persistent",
          key: SAVE_TOAST_KEY,
          action: {
            label: copy.notes.save.retryNow,
            onClick: () => {
              showToast(copy.notes.save.retrying, { key: SAVE_TOAST_KEY });
              void attemptSave(0);
            },
          },
        });
        return;
      }

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
    clearSaveTimers();

    if (abandoned.current) {
      return;
    }
    // A save is already on the wire; its completion handler picks up whatever has
    // been typed since, so a second concurrent write is never needed.
    if (inFlight.current) {
      return;
    }
    void attemptSave(0);
  }, [attemptSave, clearSaveTimers]);

  /**
   * The debounce (rule B2): 300 ms of quiet sends the change, and a 5 s maxWait
   * forces a save during continuous typing (G-11) so a long paragraph is never one
   * unsaved blob.
   */
  const scheduleSave = useCallback(() => {
    setIsSaved(false);

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
        void saveNote(note.id, pending);
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
      const result = await deleteNote(note.id);

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
        <p aria-live="polite" className="text-xs text-text-muted">
          {isSaved ? copy.notes.editor.saved : copy.notes.editor.saving}
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
