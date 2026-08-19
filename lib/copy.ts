// Every user-visible string in the app lives here (CLAUDE.md rule 10 / SPEC B5).
// Numbers inside copy are derived from LIMITS and formatted with
// toLocaleString("en-US") — never typed out by hand.

import { LIMITS } from "./types";

const formatNumber = (value: number): string => value.toLocaleString("en-US");

// Two screens need this exact word: the submit button on the sign-in form, and the
// action on the "session expired" notice the editor raises mid-edit (SPEC G-1).
// One constant rather than the same literal twice (rule 11).
const SIGN_IN_LABEL = "Sign in";

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

  // Sign-in screen and the sign-out control (SPEC Block E + Block F). The three
  // failure strings are ours on purpose: Supabase's raw error text varies with
  // project config and can distinguish "wrong password" from "no such account",
  // which is an account-enumeration leak.
  auth: {
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: SIGN_IN_LABEL,
    // aria-labels for the show/hide control on the password field. The button has
    // no text of its own, so these are its accessible name.
    showPassword: "Show password",
    hidePassword: "Hide password",
    submitPending: "Signing in…",
    signOut: "Sign out",
    invalidEmail: "Enter a valid email address.",
    missingPassword: "Enter your password.",
    badCredentials: "Email or password is incorrect.",
    // SPEC Block G case 6 — Supabase Auth's built-in rate limit, which this
    // project accepts as-is rather than adding throttling of its own.
    rateLimited: "Too many attempts. Wait a minute and try again.",
  },

  errors: {
    // SPEC Block E: the generic failure message. Shown by app/error.tsx, and
    // returned by the signIn action for any failure that is neither bad
    // credentials nor the rate limit.
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
    newNote: "New note",
    // Shown in place of an empty title, muted, in the list AND as the editor's
    // title placeholder (SPEC G-16). The stored value stays "".
    untitled: "Untitled",
    empty: {
      title: "No notes yet.",
      description: "Create your first note to get started.",
    },
    // SPEC Block E: the /notes error card, paired with common.tryAgain.
    loadError: "Couldn't load your notes.",
    createError: "Couldn't create the note. Try again.",
    deleted: "Note deleted.",
    // SPEC G-13: the note was removed elsewhere (another tab, the SQL editor)
    // while this screen still showed it.
    gone: "This note no longer exists.",

    editor: {
      // Accessible names for the two borderless fields: SPEC Block E gives them a
      // placeholder and no visible label, and a placeholder is not a label.
      titleLabel: "Note title",
      contentLabel: "Note content",
      contentPlaceholder: "Start writing…",
      saving: "Saving…",
      saved: "Saved",
    },

    // Save feedback, SPEC rule B8 and edge case G-1. `retrying` is the toast that
    // accompanies the three backoff attempts; `failed` is the persistent notice
    // that follows them, with `retryNow` as its action.
    save: {
      retrying: "Couldn't save. Retrying…",
      failed: "Couldn't save your changes.",
      retryNow: "Retry now",
      sessionExpired: "Your session expired.",
      signIn: SIGN_IN_LABEL,
    },

    // The per-card "⋯" menu (SPEC Block E). `label` is the icon-only trigger's
    // accessible name; `edit` names the destination the whole-card link reaches
    // silently.
    menu: {
      label: "More actions",
      edit: "Edit",
    },

    // Destructive confirmation, SPEC US4 step 2 — exact wording.
    delete: {
      action: "Delete",
      confirmTitle: "Delete this note? This can't be undone.",
      confirm: "Delete",
      cancel: "Cancel",
    },
  },

  // Cap and validation messages, SPEC Block F. Kept here from the start so no
  // number ever gets typed into a string later on.
  limits: {
    titleTooLong: `The title is limited to ${formatNumber(LIMITS.titleMax)} characters.`,
    contentTooLong: `The note is limited to ${formatNumber(LIMITS.contentMax)} characters.`,
    tagTooLong: `Tags are limited to ${formatNumber(LIMITS.tagMax)} characters.`,
    tagDuplicate: "This tag is already on the note.",
    tooManyTags: `A note can have up to ${formatNumber(LIMITS.tagsPerNote)} tags.`,
    tooManyNotes: `You've reached the limit of ${formatNumber(LIMITS.notesPerUser)} notes.`,
  },
} as const;
