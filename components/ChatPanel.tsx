"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, LoaderCircle, MessageSquarePlus } from "lucide-react";

import { sendMessage } from "@/app/chat/actions";
import { EmptyState } from "@/components/EmptyState";
import { ErrorCard } from "@/components/ErrorCard";
import { useToast } from "@/components/Toast";
import { callAction } from "@/lib/callAction";
import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";
import {
  LIMITS,
  type ChatSendFailure,
  type ChatTurn,
  type NoteFailure,
} from "@/lib/types";

/**
 * The chat conversation (SPEC US8): a scrolling transcript and a composer.
 *
 * WHERE THE MEMORY LIVES, since that is the feature and not an implementation detail.
 * `turns` below IS the conversation. Every send posts the whole array, so the model
 * receives the history along with the new message and "tell me more about that"
 * resolves against what was actually said.
 *
 * **The persistence amendment did not change that, and the distinction is the whole
 * point.** Storage seeds `turns` once, on mount, from what the server read; it is not
 * consulted again. The prompt is still built from this component's array, the trim is
 * still the same trim, and the Server Action still receives a transcript rather than a
 * conversation id to look up. So a reload resumes the conversation, and what happens
 * *within* one is the behaviour that existed before there was a table. Nothing in this
 * file reads the database.
 *
 * That makes this component the same shape as `NoteEditor` under rule B2 — local state
 * is the truth, the server round-trip is something that happens to it — with two
 * deliberate differences:
 *
 * 1. **No debounce.** A message is sent by an explicit submit, once. Rule B2's debounce
 *    exists to stop per-keystroke writes.
 * 2. **No retry ladder.** Rule B8 retries a failed save three times on a backoff
 *    because a note must not lose text. A failed send has lost nothing — the user's
 *    message is still on screen — and each attempt costs credit, so the retry is a
 *    BUTTON (`copy.chat.retry`) and never automatic. `lib/chat.ts` records the same
 *    decision on the server side.
 *
 * The user's message is appended BEFORE the call and is never rolled back, failure
 * included. That is rule B2's promise about typed text, applied here: the transcript is
 * what the person said, and a network fault is not a reason to unsay it. What a failed
 * send does NOT do is persist that message — see `appendExchange` — so a message that
 * never got an answer is lost by a reload. It is on screen with **Retry** until then.
 */

/** One dedupe key per notice, so a repeated failure updates in place (Toast's `key`). */
const SEND_TOAST_KEY = "chat-send";
const LIMIT_TOAST_KEY = "chat-message-limit";
const NOT_SAVED_TOAST_KEY = "chat-not-saved";

/**
 * The failures worth offering a **Retry** on — the three where the same bytes might
 * succeed a moment later.
 *
 * `misconfigured` and `invalid` are excluded on purpose: retrying either sends an
 * identical request to an identical refusal, and a button that cannot work is worse
 * than no button. `sessionExpired` is excluded because its action is signing in, which
 * the notice offers instead.
 */
const RETRYABLE: readonly ChatSendFailure[] = [
  "unavailable",
  "timeout",
  "rateLimited",
];

/** The message for each failure code — the one place a chat failure becomes English. */
function messageFor(failure: ChatSendFailure): string {
  switch (failure) {
    case "sessionExpired":
      return copy.notes.save.sessionExpired;
    case "invalid":
      return copy.chat.failed.invalid;
    case "rateLimited":
      return copy.chat.failed.rateLimited;
    case "timeout":
      return copy.chat.failed.timeout;
    case "misconfigured":
      return copy.chat.failed.misconfigured;
    case "unavailable":
      return copy.chat.failed.unavailable;
  }
}

/**
 * Narrow what `callAction` can hand back onto this screen's own union.
 *
 * `callAction` types its transport failure as `ActionFailure`, whose reason is
 * `NoteFailure` — so the compiler believes a result from it can be `notFound` or
 * `limitReached`, two codes `sendMessage` has no way to produce. That is an artifact of
 * one shared wrapper serving two domains (see `NoteFailure`'s docblock, which
 * anticipated a third sharer), not a case to write copy for.
 *
 * They map to `unavailable`, which is what the wrapper actually produces and the only
 * thing either could honestly mean here: the request did not come back. Written as a
 * mapping rather than a cast, so the day `callAction` grows a real new failure this
 * function is where the compiler stops.
 */
function asChatFailure(
  failure: ChatSendFailure | NoteFailure,
): ChatSendFailure {
  return failure === "notFound" || failure === "limitReached"
    ? "unavailable"
    : failure;
}

/**
 * The history one send carries, trimmed to fit BOTH caps, newest kept.
 *
 * Two caps and not one, because they bound different things. `chatTurnsMax` bounds how
 * far back the model can see; `chatTranscriptMax` bounds what the request COSTS, and it
 * is the one that actually does that job — forty turns of legitimately long assistant
 * replies is an unbounded prompt, and a per-turn cap cannot fix it without refusing real
 * replies (see `isChatTurn` in `lib/chat.ts`, and the bug that taught it).
 *
 * Trimming HERE is what keeps a long conversation working. The server enforces the same
 * two caps because a Server Action is a public POST, but a server that merely refused an
 * over-budget transcript would turn the fortieth message of a good conversation into a
 * permanent `invalid` — a failure that deliberately offers no Retry and would have no way
 * out. So the client fits the budget and the server guards it: the same split the turn
 * count already used, and the reason persistence needed it is that a LOADED conversation
 * arrives long.
 *
 * The walk is from the newest backwards, so the last turn — the user's new message — is
 * always kept first. The final guard covers a case the caps make unreachable today
 * (`chatMessageMax` is far below `chatTranscriptMax`): if the budget somehow excluded
 * everything, an empty transcript would be refused as `invalid`, so one turn goes
 * regardless.
 */
function historyFor(transcript: readonly ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let characters = 0;

  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const turn = transcript[index];
    if (kept.length >= LIMITS.chatTurnsMax) break;
    if (characters + turn.content.length > LIMITS.chatTranscriptMax) break;
    kept.push(turn);
    characters += turn.content.length;
  }

  if (kept.length === 0 && transcript.length > 0) {
    kept.push(transcript[transcript.length - 1]);
  }

  kept.reverse();
  return kept;
}

interface ChatPanelProps {
  /**
   * The stored conversation, oldest turn first — or `null` when the read FAILED.
   *
   * `null` and `[]` are different states and must stay different: `[]` is a user with no
   * conversation yet, `null` is a database that could not be reached (including the
   * migration not having been run). Showing an error for the second is what stops a new
   * conversation being started on top of history that already exists.
   */
  initialTurns: ChatTurn[] | null;
  /** The conversation those turns belong to; `null` when there is no conversation yet. */
  initialConversationId: string | null;
}

/**
 * The load boundary. Hooks live in `Conversation` below, so the failure case can return
 * early without a conditional hook call — the reason this is two components rather than
 * one with an `if` in the middle.
 */
export function ChatPanel({
  initialTurns,
  initialConversationId,
}: ChatPanelProps) {
  if (initialTurns === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center py-6">
        {/* ErrorCard's Try again is `router.refresh()`, which re-runs the Server
            Component that failed — a real re-read through the DAL rather than a
            client-side reset of something that never loaded. And no composer: appending
            to a conversation whose history could not be read would silently start a
            second one beside it. */}
        <ErrorCard title={copy.chat.loadError} />
      </div>
    );
  }

  return (
    <Conversation
      initialTurns={initialTurns}
      initialConversationId={initialConversationId}
    />
  );
}

function Conversation({
  initialTurns,
  initialConversationId,
}: {
  initialTurns: ChatTurn[];
  initialConversationId: string | null;
}) {
  // Seeded ONCE. A later change to the prop — which a `revalidatePath` from the send
  // action does produce — does not reset `useState`, and must not: this component's
  // array is the live conversation, and the server's copy is a render behind it.
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const { showToast, dismissKey } = useToast();

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  /**
   * Keep the newest message in view.
   *
   * Anchored to a zero-height element after the list rather than by setting `scrollTop`,
   * so the browser does the arithmetic and it stays correct while a bubble is still
   * growing. `block: "end"` and not `"nearest"`: the pending row appears below the last
   * bubble, and `"nearest"` stops short of it.
   *
   * The FIRST run is always instant, even where motion is allowed. Since persistence,
   * mount can arrive with a whole conversation already loaded, and smooth-scrolling
   * through it is an animation nobody asked for — the user opened a page, they did not
   * send a message. Every later run IS a reply arriving, where the movement is the
   * feedback.
   *
   * Motion is queried at call time rather than read from a hook: this app suppresses
   * every animation under `prefers-reduced-motion: reduce` (Block E), and a smooth
   * scroll is an animation. `matchMedia` is safe here because the effect runs only in
   * the browser.
   */
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const instant = reduced || !hasScrolled.current;
    hasScrolled.current = true;
    bottomRef.current?.scrollIntoView({
      behavior: instant ? "auto" : "smooth",
      block: "end",
    });
  }, [turns, pending]);

  /**
   * Grow the composer with its content, up to a ceiling.
   *
   * A one-row textarea is right for the common message and wrong for a paragraph, and a
   * fixed multi-row box wastes the screen for every short one. The height is reset to
   * `auto` before it is read, because `scrollHeight` on an already-tall element reports
   * the tall height and the box would only ever grow.
   */
  useEffect(() => {
    const node = composerRef.current;
    if (node === null) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [draft]);

  /**
   * Post a transcript and append the reply.
   *
   * Takes the transcript as an argument rather than reading `turns`, so **Retry** can
   * re-send exactly what failed: reading state here would close over a stale array, and
   * re-deriving it would race the append above.
   *
   * `conversationId` is read from state rather than passed, because unlike the
   * transcript it is not what failed — it is where the exchange belongs, and a retry
   * belongs in the same place.
   */
  const send: (transcript: readonly ChatTurn[]) => Promise<void> = useCallback(
    async (transcript: readonly ChatTurn[]) => {
      const history = historyFor(transcript);

      setPending(true);
      // The previous notice goes as soon as a new attempt starts, so a stale "try
      // again" cannot sit next to a request that is in flight.
      dismissKey(SEND_TOAST_KEY);

      // callAction, never a bare await: offline the action never runs and the call
      // REJECTS rather than returning a result. Left unwrapped it would skip the line
      // that clears `pending` below, and the composer would be dead for the rest of
      // the page's life — the same failure the Phase 4 browser pass found in the
      // editor.
      const result = await callAction(() =>
        sendMessage(history, conversationId),
      );

      setPending(false);

      if (result.ok) {
        // `reply` is present because `ChatSendResult`'s success arm carries it — but
        // `callAction` can also return a bare `{ ok: true }` for Next's redirect
        // signal, so the property is checked rather than assumed. Nothing in this
        // action redirects, which is exactly why an unchecked read here would be a
        // silent `undefined` in the transcript the day one did.
        if (!("reply" in result)) {
          return;
        }

        setTurns((current) => [
          ...current,
          { role: "assistant", content: result.reply },
        ]);

        if (result.persisted) {
          // Adopt the id the server used. On the first exchange of a new conversation
          // this is where the client learns it; every later send appends to it.
          setConversationId(result.conversationId);
          return;
        }

        // A SUCCESSFUL SEND WHOSE STORAGE FAILED. The reply is above — it exists and was
        // paid for — but nothing was written, so a reload will not find this exchange.
        // Said out loud rather than swallowed: silence here is how a user discovers on
        // their next visit that an afternoon of conversation is gone. Persistent, and
        // its own dedupe key, so it neither times out nor fights the send notice.
        //
        // `conversationId` is deliberately left as it was. If the exchange belonged to an
        // existing conversation, the next successful send still appends to it — the
        // stored transcript simply has a gap where this one should be.
        showToast(copy.chat.notSaved, {
          variant: "danger",
          key: NOT_SAVED_TOAST_KEY,
          duration: "persistent",
        });
        return;
      }

      // One narrowing, then every branch below reads the same value.
      const failure = asChatFailure(result.failure);

      showToast(messageFor(failure), {
        variant: "danger",
        key: SEND_TOAST_KEY,
        // Persistent for the failures the user has to answer, timed for none of them:
        // a chat failure leaves a message on screen with no reply under it, so the
        // notice explaining why must not disappear before it is read.
        duration: "persistent",
        action: RETRYABLE.includes(failure)
          ? { label: copy.chat.retry, onClick: () => void send(transcript) }
          : failure === "sessionExpired"
            ? {
                label: copy.notes.save.signIn,
                // A full navigation, not `router.push`: the session is gone, so the
                // point is to leave this page and let the server decide what to
                // render. Same move G-1 makes in the editor.
                onClick: () => {
                  window.location.assign(ROUTES.signIn);
                },
              }
            : undefined,
      });
    },
    [conversationId, dismissKey, showToast],
  );

  function submit() {
    const content = draft.trim();
    if (content.length === 0 || pending) {
      return;
    }

    // Focus moves to the composer BEFORE the send button is disabled. Disabling the
    // element that currently has focus drops the caret to `<body>`, so a user who
    // clicked Send with the keyboard would lose their place on every message — the
    // same debt the Toast viewport pays when a control vanishes.
    composerRef.current?.focus();

    const next: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setDraft("");
    void send(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  /**
   * Start a fresh conversation (SPEC US8: a new conversation starts empty).
   *
   * Purely local, and there is nothing for it to write: a conversation is a group of
   * stored messages, so an empty one has no rows and needs none. The id is minted
   * server-side by the first exchange that succeeds.
   *
   * The visible consequence, recorded in SPEC US8: pressing this and reloading WITHOUT
   * typing anything resumes the previous conversation, because the new one left no trace
   * to resume. The alternatives — a `conversations` table, or the id in the URL — buy
   * that one case and cost a table or a query-string surface.
   *
   * The old conversation is not deleted, and cannot be: the table has no DELETE policy.
   * It stops being the newest as soon as this one gets its first exchange.
   */
  function startNewConversation() {
    setTurns([]);
    setConversationId(null);
    setDraft("");
    // Both notices belong to the conversation being left. Leaving a "couldn't save"
    // banner over an empty screen would attach it to a conversation that has not
    // happened yet.
    dismissKey(SEND_TOAST_KEY);
    dismissKey(NOT_SAVED_TOAST_KEY);
    composerRef.current?.focus();
  }

  /**
   * Enter sends; Shift + Enter is a newline (`copy.chat.hint` says so under the box).
   *
   * `isComposing` is checked because an IME uses Enter to commit a candidate: without
   * it, typing Japanese or Chinese sends the message halfway through a word.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  /**
   * SPEC Block F: block further input, toast once (the dedupe key does the "once").
   *
   * Not `maxLength`, for the reason `NoteEditor` records: a browser truncation is
   * silent, and a cap the user cannot see is a cap they cannot work around.
   */
  function handleDraftChange(value: string) {
    if (value.length > LIMITS.chatMessageMax) {
      showToast(copy.limits.chatMessageTooLong, {
        variant: "danger",
        key: LIMIT_TOAST_KEY,
      });
      return;
    }
    setDraft(value);
  }

  const canSend = draft.trim().length > 0 && !pending;
  // Nothing to leave when the screen is already a fresh conversation. Disabled rather
  // than hidden, so the control does not appear and vanish as the user types.
  const canStartNew = turns.length > 0 && !pending;

  return (
    <>
      {/* THE SCROLL CONTAINER. `min-h-0` lets this flex child shrink below its
          content, which is what makes it scroll instead of pushing the composer off
          the bottom of the screen. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        {turns.length === 0 && !pending ? (
          <EmptyState
            title={copy.chat.empty.title}
            description={copy.chat.empty.description}
          />
        ) : (
          <>
            {/* The New chat control lives here rather than in the header, because the
                conversation it clears is this component's state and the header is
                rendered by a Server Component. Sticky so it stays reachable in a long
                transcript, and translucent for the same reason the header is. */}
            <div className="sticky top-0 z-10 mb-4 flex justify-end bg-bg/85 pb-2">
              <button
                type="button"
                onClick={startNewConversation}
                disabled={!canStartNew}
                className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-text/15 hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <MessageSquarePlus aria-hidden="true" className="size-3.5" />
                {copy.chat.newChat}
              </button>
            </div>

            {/* `role="log"` makes this a polite live region, so a screen reader
                announces a reply as it arrives instead of leaving the user to go
                looking for it. It needs an accessible name, or the announcement has no
                context.

                ON THE WRAPPER, NOT ON THE `<ol>`. An explicit role REPLACES the
                element's implicit one, so `role="log"` on the list would leave every
                `<li>` inside a parent that is no longer a list — and an orphaned
                `listitem` role is ignored, which costs the "item 3 of 7" that makes a
                transcript navigable. Two elements keep both: the live region outside,
                the list inside. */}
            <div role="log" aria-label={copy.chat.logLabel} aria-busy={pending}>
              <ol className="flex flex-col gap-5">
                {turns.map((turn, index) => {
                  const mine = turn.role === "user";
                  return (
                    // The index is the key, which is safe HERE and nowhere near a note
                    // list: turns are only ever APPENDED, never reordered, removed or
                    // edited, so an index is a stable identity for the life of the
                    // array. Stored rows do have an `id`, and it is deliberately not
                    // read — the DAL hands out `conversation_id, role, content` only, so
                    // a turn on screen has the same shape whether it came from the
                    // database or from the send that just happened.
                    <li
                      key={index}
                      className={`flex flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}
                    >
                      {/* The attribution, and not decoration: left/right placement is
                          invisible to a screen reader and to anyone who cannot compare
                          alignment, so who spoke is also said in words. */}
                      <span className="px-1 text-xs font-medium text-text-muted">
                        {mine ? copy.chat.you : copy.chat.assistant}
                      </span>
                      {/* `whitespace-pre-wrap` keeps the newlines Shift + Enter allows
                          and the ones the model sends. `break-words` is what stops a
                          pasted URL from widening the bubble past the column. Plain
                          text in a JSX text node — Block A prohibits
                          dangerouslySetInnerHTML, so model output is never markup. */}
                      <div
                        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-card px-4 py-3 text-sm leading-relaxed shadow-card ${
                          mine
                            ? "bg-accent text-on-accent"
                            : "border border-border bg-surface text-text"
                        }`}
                      >
                        {turn.content}
                      </div>
                    </li>
                  );
                })}

                {pending ? (
                  <li className="flex flex-col items-start gap-1.5">
                    <span className="px-1 text-xs font-medium text-text-muted">
                      {copy.chat.assistant}
                    </span>
                    {/* `animate-pulse` is one of the two pre-existing looping
                        animations (Block E), already suppressed under
                        prefers-reduced-motion. */}
                    <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-sm text-text-muted shadow-card">
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      <span className="animate-pulse">
                        {copy.chat.thinking}
                      </span>
                    </div>
                  </li>
                ) : null}
              </ol>
            </div>
          </>
        )}
        {/* Scroll anchor. Zero height, and `aria-hidden` because it is furniture. */}
        <div ref={bottomRef} aria-hidden="true" className="h-0" />
      </div>

      {/* THE COMPOSER. Inside the flex column rather than `fixed`, so it needs no
          z-index and no safe-area padding of its own. The slightly translucent ground
          matches the header's, so the transcript scrolls under both edges the same
          way. */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border/80 bg-bg/85 pb-5 pt-3"
      >
        <div className="flex items-end gap-2 rounded-card border border-border bg-surface p-2 shadow-card transition-[box-shadow,border-color] focus-within:border-accent/40 focus-within:shadow-card-hover">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={copy.chat.inputPlaceholder}
            // A placeholder is not a label (the same rule the editor's two borderless
            // fields follow), so the field carries its accessible name explicitly.
            aria-label={copy.chat.inputLabel}
            className="max-h-[180px] min-h-10 w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-text-muted/70"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-on-accent transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {/* Icon-only, so the label is the accessible name rather than visible
                text — the button sits beside a field whose placeholder already says
                what this does. */}
            <span className="sr-only">{copy.chat.send}</span>
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <ArrowUp aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        <p className="mt-2 px-1 text-xs text-text-muted">{copy.chat.hint}</p>
      </form>
    </>
  );
}
