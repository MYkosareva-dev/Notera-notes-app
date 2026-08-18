// Every user-visible string in the app lives here (CLAUDE.md rule 10 / SPEC B5).
// Numbers inside copy are derived from LIMITS and formatted with
// toLocaleString("en-US") — never typed out by hand.

import { LIMITS } from "./types";

const n = (value: number): string => value.toLocaleString("en-US");

export const copy = {
  app: {
    name: "Notera Notes",
  },

  common: {
    loading: "Loading…",
    tryAgain: "Try again",
    dismiss: "Dismiss",
    allNotes: "← All notes",
  },

  errors: {
    // SPEC Block E: the generic failure message, shown by app/error.tsx.
    generic: "Something went wrong. Try again.",
  },

  notFound: {
    // Root 404. SPEC asks for a "friendly 404" without fixing the wording;
    // this follows the voice of the note-level screen below.
    page: "This page doesn't exist.",
    // SPEC Block E, exact copy for app/notes/[id]/not-found.tsx.
    note: "This note doesn't exist (anymore).",
  },

  notes: {
    empty: {
      title: "No notes yet.",
      description: "Create your first note to get started.",
    },
  },

  // Cap and validation messages, SPEC Block F. Kept here from the start so no
  // number ever gets typed into a string later on.
  limits: {
    titleTooLong: `The title is limited to ${n(LIMITS.titleMax)} characters.`,
    contentTooLong: `The note is limited to ${n(LIMITS.contentMax)} characters.`,
    tagTooLong: `Tags are limited to ${n(LIMITS.tagMax)} characters.`,
    tagDuplicate: "This tag is already on the note.",
    tooManyTags: `A note can have up to ${n(LIMITS.tagsPerNote)} tags.`,
    tooManyNotes: `You've reached the limit of ${n(LIMITS.notesPerUser)} notes.`,
  },

  // Temporary strings for the Phase 1 scaffold. Each one disappears when the
  // real screen lands (sign-in in Phase 3, the editor in Phase 4).
  placeholder: {
    comingSoon: "This screen arrives in a later build phase.",
  },
} as const;
