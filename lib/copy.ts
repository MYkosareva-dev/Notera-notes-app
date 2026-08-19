// Every user-visible string in the app lives here (CLAUDE.md rule 10 / SPEC B5).
// Numbers inside copy are derived from LIMITS and formatted with
// toLocaleString("en-US") — never typed out by hand.

import { LIMITS } from "./types";

const formatNumber = (value: number): string => value.toLocaleString("en-US");

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
    submit: "Sign in",
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
    empty: {
      title: "No notes yet.",
      description: "Create your first note to get started.",
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

  // Temporary string for the Phase 1 scaffold. The sign-in screen landed in
  // Phase 3 and no longer uses it; the last caller is the note editor route,
  // which replaces it in Phase 4.
  placeholder: {
    comingSoon: "This screen arrives in a later build phase.",
  },
} as const;
