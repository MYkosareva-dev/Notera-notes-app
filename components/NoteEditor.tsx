"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Trash2 } from "lucide-react";

import { deleteNote, saveNote } from "@/app/notes/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TagEditor } from "@/components/TagEditor";
import { useToast } from "@/components/Toast";
import { useNoteFailureNotice } from "@/components/useNoteFailureNotice";
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
 * - Tags ride the SAME pipeline, which is all "tags save through the same debounced
 *   pipeline" means: `TagEditor` is controlled by the `tags` state below, a committed
 *   or removed chip updates `draft` and calls `scheduleSave` exactly as a keystroke
 *   does, and the patch that goes out carries whichever of the three fields changed.
 *   No second action, no immediate write on Enter — two chips added inside one debounce
 *   window are one save.
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
 * - A notice the user dismissed with × must not strand them. Saving stays suspended,
 *   so the next edit RE-SURFACES the same notice (one dedupe key, so it never stacks).
 *   Without that, dismissing the banner left the only way back — Retry now — nowhere on
 *   screen, with the status indicator still saying the save had failed and a reload the
 *   only exit,
 *   which is the one action that would lose the text.
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
 * The cap messages keep their own keys — they are about the FIELD, not about a save, so
 * one must not replace the other. Every save/delete notice shares NOTE_NOTICE_KEY, which
 * lives with the policy in useNoteFailureNotice.
 */
const TITLE_LIMIT_TOAST_KEY = "title-limit";
const CONTENT_LIMIT_TOAST_KEY = "content-limit";

/**
 * Why saving stopped. All three are user-driven from here on (rule B8, G-1).
 *
 * `rejected` is the case tags introduced. The other two are about the request not
 * getting through; this one is the server REFUSING the payload — `updateNote` re-checks
 * the Block F tag rules because a Server Action is a public POST, and it throws
 * `invalid` for a tag array it will not store.
 *
 * WHAT ACTUALLY TRIGGERS IT, corrected at the Phase 6 gate after the owner's repro:
 * ONLY a patch that carries `tags`. `diff` above is per-field, so on a note holding an
 * unstorable tag, typing in the title or the body sends `{title}` / `{content}` and the
 * bad tag never reaches validation — the note saves normally. That is the better
 * behaviour and it is not an accident of the design; it is the per-field patch doing
 * its job. The first draft of this comment claimed "touch anything and it was
 * unsaveable", which was wrong.
 *
 * The loop is real all the same, and the mechanism is the second half: `saved.current`
 * advances ONLY on `ok` (see `attemptSave`). So the moment one tags-bearing patch is
 * refused, `draft.tags` and `saved.tags` stay different forever, `sameTags` keeps
 * returning false, and EVERY later patch — including a pure title or body edit — carries
 * the tags again and is refused again. One refusal is what arms it; after that it really
 * is one POST and one server-side error per debounce window, with the text typed
 * alongside refused in the same breath, because a patch is refused whole.
 *
 * Reachable without a forged request: `LIMITS.tagMax` has no database counterpart, so a
 * note seeded through the SQL Editor (SPEC Block C ships a seed block; G-18 treats
 * direct inserts as a real path) can hold a tag `isValidTag` rejects. Add or remove any
 * chip on that note and the refusal arms; from there the note was unsaveable forever.
 */
type SuspendedReason = "retriesSpent" | "sessionExpired" | "rejected";

/**
 * Module scope, not a closure: it touches nothing but its argument, and defining it per
 * render made it a function used inside memoized callbacks while being neither stable nor
 * declared as a dependency — the pattern react-hooks/exhaustive-deps exists to catch, in
 * a project with no ESLint to catch it.
 */
function clearTimer(timer: { current: number | null }) {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

interface Draft {
  title: string;
  content: string;
  /**
   * READONLY, and the compiler is the point.
   *
   * `sent = { ...draft.current }` is a shallow copy, so the moment `Draft` gained a
   * reference-typed field `saved.current.tags` and `draft.current.tags` became the
   * same array after every successful save (and at mount, where both are `note.tags`).
   * A single in-place `push`/`splice` anywhere would then mutate BOTH, `sameTags`
   * would return true, `diff` would return null, and the edit would never be
   * saved — with the indicator still reading "Saved". That is the worst failure this
   * editor can have, and nothing else in the file would notice it.
   *
   * `readonly` makes that unwriteable rather than merely unwritten. `diff` below hands
   * out a fresh array, so a patch on the wire can never alias either ref either.
   */
  tags: readonly string[];
}

/**
 * Order-sensitive array equality — a reorder IS a change, because the stored order is
 * the order the chips are drawn in.
 *
 * Element-by-element rather than a JSON or join comparison: `["a,b"]` and `["a", "b"]`
 * are different tag sets that join to the same string, and this predicate decides
 * whether a save happens at all.
 */
function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
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
  if (!sameTags(draft.tags, saved.tags)) {
    // A COPY, not the ref: `NotePatch.tags` is mutable `string[]` (it crosses the wire
    // to a Server Action), and handing out the draft's own array would give the patch
    // a live view of editor state.
    patch.tags = [...draft.tags];
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

export function NoteEditor({ note }: { note: NoteView }) {
  const router = useRouter();
  const { showToast } = useToast();
  const notice = useNoteFailureNotice();

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState<string[]>(note.tags);
  /**
   * "saved" appears only after a confirmed round-trip (G-10). "saving" covers typed
   * but not yet sent, in flight, and waiting on a retry — all of which are real
   * progress. "failed" exists because "Saving…" must not claim progress that has
   * stopped: once the ladder is spent, or the session is gone, nothing is in flight
   * and the indicator has to say so (SPEC Block E, the editor's status row).
   */
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  const draft = useRef<Draft>({
    title: note.title,
    content: note.content,
    tags: note.tags,
  });
  const saved = useRef<Draft>({
    title: note.title,
    content: note.content,
    tags: note.tags,
  });

  const debounceTimer = useRef<number | null>(null);
  const maxWaitTimer = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  /**
   * Why automatic saving is suspended, or null when it is not. A reason rather than a
   * flag because the two cases put a different notice on screen, and any edit made while
   * suspended has to be able to put THAT notice back (the user may have dismissed it).
   * The text stays on screen and in `draft` throughout, so nothing is lost by waiting.
   */
  const suspendedFor = useRef<SuspendedReason | null>(null);
  /**
   * The Retry-now handler, held in a ref because the notice that offers it is built
   * before `attemptSave` exists in this scope. Assigned in an effect below.
   */
  const retryNow = useRef<() => void>(() => {});
  /**
   * `flush` held in a ref for the same declaration-order reason: the success path needs to
   * re-arm the debounce, and `flush` is defined after `attemptSave`. Assigned in an effect.
   */
  const flushRef = useRef<() => void>(() => {});
  /**
   * Set when this note is deliberately left behind — deleted, or found to be gone.
   * It stops the unmount flush from re-saving a row that should not come back and
   * from raising a second notice on the screen the user just landed on.
   */
  const abandoned = useRef(false);

  /** Stops everything pending — used when the note is abandoned (deleted or gone). */
  const clearSaveTimers = useCallback(() => {
    clearTimer(debounceTimer);
    clearTimer(maxWaitTimer);
    clearTimer(retryTimer);
  }, []);

  /**
   * Puts the suspended-state notice on screen. Idempotent: re-showing it with identical
   * content is a no-op inside the Toast provider, so calling this per keystroke costs
   * nothing while still undoing a dismissal.
   */
  const showSuspendedNotice = useCallback(
    (reason: SuspendedReason) => {
      if (reason === "sessionExpired") {
        notice.showSessionExpired();
        return;
      }
      if (reason === "rejected") {
        notice.showRejected(() => retryNow.current());
        return;
      }
      // Through the ref: the notice is built before `attemptSave` exists in this scope,
      // and the closure it hands to the toast is never replaced once shown (Toast
      // compares actions by label, so an identical re-show is a no-op). Inlining
      // `attemptSave` here would capture a stale one.
      notice.showRetryable(() => retryNow.current());
    },
    [notice],
  );

  /** Stops automatic saving and says so, on screen and in the status indicator. */
  const suspend = useCallback(
    (reason: SuspendedReason) => {
      suspendedFor.current = reason;
      clearTimer(debounceTimer);
      clearTimer(maxWaitTimer);
      setSaveState("failed");
      showSuspendedNotice(reason);
    },
    [showSuspendedNotice],
  );

  const notifyFailure = useCallback(
    (failure: NoteFailure) => {
      if (failure === "sessionExpired") {
        // SPEC G-1. Persistent, because there is nothing the app can retry on the
        // user's behalf — and their text stays on screen while they decide. Saving
        // stops too: every further attempt would fail identically and silently.
        suspend("sessionExpired");
        return;
      }

      if (failure === "notFound") {
        // SPEC G-13: deleted elsewhere. Stop trying to save it and leave.
        abandoned.current = true;
        clearSaveTimers();
        notice.showGone();
        router.replace(ROUTES.notes);
        return;
      }

      if (failure === "invalid") {
        // The server refused the payload. Stop saving and hand the next move over —
        // retrying unchanged bytes would fail identically, forever. The notice carries
        // **Retry now**, which is what the user needs once they have removed the chip
        // the server would not take: saving stays suspended until something asks for
        // it, so a corrected note with no button would sit there unsaved.
        //
        // NOTE this is reached from the DELETE path too, where `invalid` is not
        // producible (deleteNote validates only the id's shape and answers `notFound`).
        // If that ever changes, suspending the editor for a failed delete would be the
        // wrong response and this branch needs splitting.
        suspend("rejected");
        return;
      }

      // What is left: `limitReached`, which only `createNote` can raise, and
      // `unavailable`, which reaches here from the DELETE path alone (autosave answers
      // it with the ladder before ever calling this). Both are one-shot: there is
      // nothing to retry that the Delete button does not already offer.
      notice.showGeneric();
    },
    [clearSaveTimers, notice, router, suspend],
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
        // Nothing to send, because the draft already matches what the server confirmed —
        // and that is precisely what "Saved" means (`saved` only advances on an `ok`).
        // Without this line the optimistic "Saving…" that scheduleSave sets on every
        // keystroke stood forever whenever an edit was undone inside the debounce window:
        // type a character, delete it, and the indicator claimed progress that had stopped.
        setSaveState("saved");
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
        suspendedFor.current = null;
        notice.clear();
        if (diff(draft.current, saved.current) === null) {
          setSaveState("saved");
          return;
        }
        // Something was typed while this was in flight. RE-ARM THE DEBOUNCE rather than
        // saving again straight away: an immediate re-fire chains one write per
        // round-trip for as long as the user keeps typing, which quietly voids rule
        // B2's 5 s ceiling — at a 250 ms RTT that is ~220 writes a minute instead of
        // ~12, each carrying the whole content field. The maxWait timer is re-armed by
        // the next keystroke, so the ceiling still bounds the tail.
        clearTimer(debounceTimer);
        debounceTimer.current = window.setTimeout(() => flushRef.current(), DEBOUNCE_MS);
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
        suspend("retriesSpent");
        return;
      }

      // One notice for the whole ladder (the dedupe key), shown from the first
      // failure — not one per attempt.
      notice.showRetrying();
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = null;
        void attemptSave(attempt + 1);
      }, backoff);
    },
    [note.id, notice, notifyFailure, suspend],
  );

  // Retry now: leave the suspended state and try again from the current draft. Held in
  // a ref so `showSuspendedNotice` can offer it without depending on `attemptSave`.
  useEffect(() => {
    retryNow.current = () => {
      suspendedFor.current = null;
      setSaveState("saving");
      notice.showRetrying();
      void attemptSave(0);
    };
  }, [attemptSave, notice]);

  /** Fires the debounce/maxWait timers' payload. */
  const flush = useCallback(() => {
    clearTimer(debounceTimer);
    clearTimer(maxWaitTimer);

    if (abandoned.current || suspendedFor.current !== null) {
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

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

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

    // Suspended: the persistent notice owns the next move (rule B8), so this edit gets
    // no timer — but it DOES put the notice back if the user dismissed it. Otherwise
    // dismissing the banner would leave a failed save with no way to retry it and a
    // reload as the only exit, which is the one action that loses the text.
    if (suspendedFor.current !== null) {
      showSuspendedNotice(suspendedFor.current);
      return;
    }
    // A pending retry will carry this edit along, so it wants no fresh timer either.
    if (retryTimer.current !== null) {
      return;
    }

    clearTimer(debounceTimer);
    debounceTimer.current = window.setTimeout(flush, DEBOUNCE_MS);

    if (maxWaitTimer.current === null) {
      maxWaitTimer.current = window.setTimeout(flush, MAX_WAIT_MS);
    }
  }, [flush, showSuspendedNotice]);

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
      // Not while a save is on the wire: `saved` has not advanced yet, so the pending
      // patch would be the identical one already in flight. Harmless but wasted.
      const pending = inFlight.current ? null : diff(draft.current, saved.current);
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

  /**
   * A committed or removed chip. No cap check here: `TagEditor` owns the Block F rules
   * and hands over an array that already satisfies them, and `lib/notes.ts` re-checks
   * the same rules on arrival because the action is a public POST. A third copy in the
   * middle would be the one that drifts.
   *
   * The array is stored as given rather than copied: `TagEditor` builds a new one on
   * every change, so there is nothing shared to mutate later.
   */
  function handleTagsChange(next: string[]) {
    setTags(next);
    draft.current = { ...draft.current, tags: next };
    scheduleSave();
  }

  function handleDelete() {
    // Stop the autosave machinery first: a pending debounce firing after the row is
    // gone would answer with G-13's "no longer exists" notice for a note the user
    // deleted on purpose.
    abandoned.current = true;
    clearSaveTimers();
    notice.clear();

    startDeleting(async () => {
      const result = await callAction(() => deleteNote(note.id));

      if (result.ok) {
        // Close it before navigating: a modal dialog left open paints over the editor
        // until the route change lands.
        setConfirmOpen(false);
        showToast(copy.notes.deleted);
        router.replace(ROUTES.notes);
        return;
      }

      if (result.failure === "notFound") {
        // Already gone — the user's intent is satisfied either way.
        setConfirmOpen(false);
        notice.showGone();
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
      {/* The editor's toolbar, and the save status lives HERE rather than in a footer
          under 60dvh of textarea (Phase 5, owner priority 1). Sticky, so the status
          stays beside the text it is about however far the note is scrolled; the
          negative margins let its translucent ground span the column's full width
          while the row itself keeps the page's gutters. */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-border/70 bg-bg/85 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
        {/* Quiet when it is good news, loud when it is not: "Saved" and "Saving…" are
            muted text with a small mark, while the failed state takes a tinted pill,
            the danger colour and semibold weight — the one save state the user has to
            act on is the one that reads from across the room. */}
        <p
          aria-live="polite"
          className={`flex min-w-0 items-center gap-1.5 rounded-full text-xs transition-colors ${
            saveState === "failed"
              ? "bg-danger-soft px-2.5 py-1 font-semibold text-danger ring-1 ring-danger/25"
              : "py-1 text-text-muted"
          }`}
        >
          {saveState === "saved" ? (
            <Check aria-hidden="true" className="size-3.5 shrink-0" />
          ) : saveState === "saving" ? (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-text-muted"
            />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          <span className="truncate">
            {saveState === "saved"
              ? copy.notes.editor.saved
              : saveState === "saving"
                ? copy.notes.editor.saving
                : copy.notes.save.failed}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {copy.notes.delete.action}
        </button>
      </div>

      {/* The note itself sits on a sheet of paper: one card, a title zone divided from
          the body by a hairline, and an accent BORDER (not a ring) around the whole
          sheet while either field has focus (owner priority 2 — the page has to read
          as an editor). Both halves of that effect are transitioned, so the border
          colour does not snap while the shadow eases. */}
      <div className="rounded-card border border-border bg-surface shadow-card transition-[box-shadow,border-color] focus-within:border-accent/40 focus-within:shadow-card-hover">
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
          className="w-full rounded-t-card bg-transparent px-5 pb-4 pt-5 text-2xl font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-text-muted/70 focus-visible:outline-none sm:px-7 sm:pb-5 sm:pt-7"
        />

        <div className="mx-5 border-t border-border sm:mx-7" />

        {/* SPEC Block E's order inside the sheet: title, hairline, tags row, content.
            One hairline only — the tags sit in the body half, with the text they
            describe, rather than being boxed off as a third zone. */}
        <TagEditor tags={tags} onChange={handleTagsChange} />

        <textarea
          value={content}
          onChange={(event) => handleContentChange(event.target.value)}
          placeholder={copy.notes.editor.contentPlaceholder}
          aria-label={copy.notes.editor.contentLabel}
          className="min-h-[60dvh] w-full resize-none rounded-b-card bg-transparent px-5 py-5 text-[0.9375rem] leading-7 outline-none placeholder:text-text-muted/70 focus-visible:outline-none sm:px-7 sm:py-6"
        />
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
