"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";

import { useToast } from "@/components/Toast";
import { copy } from "@/lib/copy";
import { TAG_CHIP } from "@/lib/tagChip";
import { LIMITS } from "@/lib/types";
import { dedupeTags, hasTag, normalizeTag } from "@/lib/validation";

/**
 * The tag chips row inside the note sheet (SPEC US5 step 1, Block E — /notes/[id]).
 *
 * PRESENTATIONAL AND CONTROLLED. It owns exactly one piece of state, the text in its
 * own input; the tags themselves belong to `NoteEditor`, which holds them in local
 * state beside the title and the content and pushes all three through the one
 * debounced Server Action (rule B2, rule B1). That is what "tags save through the same
 * pipeline" means in practice: this component never calls an action, never touches
 * Supabase, and never knows a note id.
 *
 * `onChange` is handed the WHOLE next array rather than an add/remove instruction, for
 * the reason recorded on `NotePatch`: the save that follows is a replacement, so two
 * chips added inside one 300 ms window are one write, and a retry re-sends the same
 * array instead of appending a second copy of the tag.
 *
 * THE RULES, in the order SPEC Block F's validation table lists them — each one
 * refuses the tag and leaves the input alone so the text can be corrected rather than
 * retyped, except the silent case, which clears:
 *
 * 1. Trimmed to empty → refused SILENTLY, input cleared (SPEC G-21). Nothing was
 *    typed that a message could be about.
 * 2. Longer than `LIMITS.tagMax` → "Tags are limited to {n} characters."
 * 3. Already on this note, case-insensitively → "This tag is already on the note."
 *    (SPEC G-22). Before the count check on purpose: on a note that already has ten
 *    tags, retyping one of them is a duplicate, not an eleventh tag, and the precise
 *    message is the useful one.
 * 4. Would be the 11th → "A note can have up to {n} tags." (SPEC G-23).
 *
 * Every message is derived from `LIMITS` in lib/copy.ts and never typed out here
 * (rule 10 / US5's third acceptance box), and all four share one dedupe key, so a
 * user hammering Enter sees one notice replaced in place rather than a stack.
 *
 * TWO WAYS TO COMMIT: Enter, and leaving the field. Enter is what SPEC US5 step 1
 * names; blur was added at the Phase 6 full-review gate because the alternative was a
 * silent loss — typing `urgent` and clicking into the textarea discarded it while the
 * debounced save fired for the other fields and the indicator said "Saved". This app
 * spends `callAction`, rule B8's ladder and the unmount flush on never losing typed
 * text; a field that drops it on a click was the one place that promise did not hold.
 * A rejected tag on blur still toasts and still keeps its text, so nothing is lost by
 * the stricter path either. Recorded in SPEC US5.
 *
 * No `maxLength` on the input, for the same reason `NoteEditor` gives for the title: a
 * browser truncating silently at 24 characters explains nothing, and Block F asks for
 * the cap to be *told*.
 */

/** One key for all four rejections: only ever one tag notice on screen at a time. */
const TAG_TOAST_KEY = "tag-rejected";

interface TagEditorProps {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  /**
   * Where focus goes when a chip removes itself. The input is the only control in this
   * row guaranteed to still be mounted afterwards — removing the last chip unmounts
   * the whole list — which is what makes it the right target rather than a neighbouring
   * chip. See `removeTag`.
   */
  const inputRef = useRef<HTMLInputElement>(null);

  // Exact duplicates cannot be written through this app, but a row seeded in the SQL
  // Editor can hold them, and `key={tag}` would then make React log a duplicate-key
  // warning — failing SPEC Block H check 4 for a reason unrelated to the code. Render
  // what React can render; the DAL is what decides what may be stored.
  const chips = dedupeTags(tags);

  function reject(message: string) {
    showToast(message, { variant: "danger", key: TAG_TOAST_KEY });
  }

  /** Returns true when the input was consumed, so the caller can clear it. */
  function commit(): boolean {
    const tag = normalizeTag(input);

    if (tag.length === 0) {
      // SPEC G-21 — whitespace only. Silent, and the field clears.
      setInput("");
      return true;
    }
    if (tag.length > LIMITS.tagMax) {
      reject(copy.limits.tagTooLong);
      return false;
    }
    if (hasTag(tags, tag)) {
      reject(copy.limits.tagDuplicate);
      return false;
    }
    if (tags.length >= LIMITS.tagsPerNote) {
      reject(copy.limits.tooManyTags);
      return false;
    }

    onChange([...tags, tag]);
    setInput("");
    return true;
  }

  function removeTag(tag: string) {
    onChange(tags.filter((existing) => existing !== tag));
    // The × destroys itself, and a control that vanishes owes the caret back — the same
    // rule the Toast viewport follows. Without this, focus falls to <body> and the next
    // keystroke goes nowhere, which on a keyboard is the difference between removing
    // three chips and removing one.
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    // The editor sheet has no form around it, but a stray Enter should not reach
    // anything else either — this key belongs to the tag input while it has focus.
    event.preventDefault();
    commit();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 sm:px-7">
      {/* A real list, because a row of chips IS one — it gives the group a name and a
          count without printing a redundant "Tags" heading above three words. It is a
          flex item that wraps internally rather than `display: contents`, which drops
          the list semantics again on some engines. Rendered only when it has content:
          an empty list announced as "list, 0 items" is noise. */}
      {chips.length > 0 ? (
        <ul
          aria-label={copy.notes.tags.label}
          className="flex min-w-0 flex-wrap items-center gap-2"
        >
          {chips.map((tag) => (
            <li
              key={tag}
              className={`${TAG_CHIP} flex min-w-0 items-center gap-1 py-1 pl-2.5 pr-1 text-xs`}
            >
              {/* A JSX text node: a tag called `<script>alert(1)</script>` renders as
                  that text (SPEC G-19). `title` because the shared chip class
                  truncates — a clipped 24-character tag with no tooltip is unreadable
                  to a mouse user, and the text is already the × button's accessible
                  name for everyone else. */}
              <span title={tag} className="truncate">
                {tag}
              </span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={copy.notes.tags.remove(tag)}
                className="shrink-0 rounded-full p-0.5 text-accent/70 transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        // Leaving the field commits what is in it (see the docblock). Guarded on
        // `input` so an ordinary tab-through of an empty field is not a state update,
        // and `commit()` reports whether it consumed the text — a REJECTED tag keeps
        // its text and its toast, so blurring cannot silently discard it either.
        onBlur={() => {
          if (input.length > 0) {
            commit();
          }
        }}
        placeholder={copy.notes.tags.addPlaceholder}
        aria-label={copy.notes.tags.addLabel}
        // Grows to fill the rest of the row but never forces it wider than the sheet:
        // `min-w-0` with a small basis is what lets the chips wrap instead of the
        // input squeezing them (SPEC Block E — nothing overflows at 375).
        className="min-w-0 flex-1 basis-28 bg-transparent py-1 text-xs outline-none placeholder:text-text-muted/70"
      />
    </div>
  );
}
