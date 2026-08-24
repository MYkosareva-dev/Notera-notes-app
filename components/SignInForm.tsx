"use client";

import { useId, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { signIn } from "@/app/sign-in/actions";
import { callAction } from "@/lib/callAction";
import { copy } from "@/lib/copy";
import { isValidEmail } from "@/lib/validation";

/**
 * The sign-in form (SPEC Block E — /sign-in).
 *
 * Email and password are local component state and are submitted to the `signIn`
 * Server Action. No Supabase client is created here on purpose: a browser client
 * rendered on the server reads an empty cookie jar, so any auth check in a client
 * component reports "signed out" as a silent false negative — and access decisions
 * belong on the server anyway (CLAUDE.md rule 2). Nothing is written to web
 * storage; the session is a cookie set by the action (rule 6).
 *
 * Only the submit button disables while the action runs (SPEC Block E). The fields
 * stay enabled on purpose: disabling a focused input drops focus to the body and
 * silently swallows anything typed during the round-trip, and the disabled submit
 * button already prevents a double submit.
 */
/**
 * Which field the inline message is about, when it is about a field at all.
 * `aria-invalid` describes the control it sits on, so the two inputs cannot share
 * one form-level flag — "Enter your password." must not announce the email box as
 * invalid. A credentials rejection blames neither field on its own: it comes back
 * as "form", and both inputs stay valid while the message is still announced
 * through the shared `aria-describedby`.
 */
type InvalidField = "email" | "password" | "form";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<InvalidField | null>(null);
  // Default hidden: the field is a password field until the user asks otherwise.
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  const errorId = useId();
  const emailId = useId();
  const passwordId = useId();

  // `noValidate` on the form: the browser's own bubble would pre-empt the SPEC
  // Block F copy. The same two rules run again inside the Server Action, which is
  // where they actually bind — this pass exists to block the round-trip and show
  // the message inline.
  // Any edit clears the inline error, so a corrected field stops being announced
  // as invalid and the stale message goes away instead of waiting for the next
  // submit. Both fields share the MESSAGE — it belongs to the form — but not the
  // `aria-invalid` state, which belongs to one control at a time.
  function clearError() {
    setError(null);
    setInvalidField(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError(copy.auth.invalidEmail);
      setInvalidField("email");
      return;
    }
    if (password.length === 0) {
      setError(copy.auth.missingPassword);
      setInvalidField("password");
      return;
    }

    clearError();

    const formData = new FormData();
    formData.set("email", trimmedEmail);
    formData.set("password", password);

    startTransition(async () => {
      // Three outcomes, not two. `callAction` is what separates them:
      //
      //   { error }            the action RAN and refused — wrong credentials, rate
      //                        limit, or Auth unreachable from the server. Message
      //                        already chosen server-side.
      //   { ok: true }         the action ran and redirected. Nothing to do: the
      //                        router is already navigating to /notes.
      //   { ok: false }        the action never ran (offline, dev server down).
      //
      // The middle case is why this call cannot use a bare `.catch`. `redirect()`
      // REJECTS the client promise with NEXT_REDIRECT, so a catch-all read every
      // successful sign-in as a failure: it rendered copy.errors.generic and wiped the
      // password for the two frames before the navigation landed — a red flash on every
      // correct password. Measured on throwaway probe routes: ~2 ms of error, then the
      // redirect. `callAction` reports that signal as success instead.
      const result = await callAction(() => signIn(formData));

      if ("error" in result) {
        // US1 step 2: the form stays filled except the password.
        setPassword("");
        setPasswordVisible(false);
        setError(result.error);
        setInvalidField("form");
        return;
      }

      if (!result.ok) {
        // SPEC G-7's copy, for the case where the request never left the browser. The
        // password is deliberately KEPT here, unlike a refusal: nothing was submitted,
        // so there is nothing to re-type once the connection is back.
        setError(copy.errors.generic);
        setInvalidField("form");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium text-text">
          {copy.auth.emailLabel}
        </label>
        {/* No `name`: the values are read from state in handleSubmit, so a name
            would only add a native GET submit that puts the credentials in the URL
            when JS has not hydrated. autoComplete is what password managers use. */}
        <input
          id={emailId}
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearError();
          }}
          aria-invalid={invalidField === "email"}
          aria-describedby={error === null ? undefined : errorId}
          className="w-full rounded-control border border-border bg-bg px-3 py-2.5 text-sm transition-colors outline-none placeholder:text-text-muted/70 hover:border-text/15 focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-soft aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm font-medium text-text">
          {copy.auth.passwordLabel}
        </label>
        <div className="relative">
          <input
            id={passwordId}
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            aria-invalid={invalidField === "password"}
            aria-describedby={error === null ? undefined : errorId}
            className="w-full rounded-control border border-border bg-bg py-2.5 pl-3 pr-11 text-sm transition-colors outline-none placeholder:text-text-muted/70 hover:border-text/15 focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-soft aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15"
          />
          {/* type="button": inside a form a bare <button> submits, which would
              fire a sign-in attempt on every reveal. */}
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={
              passwordVisible ? copy.auth.hidePassword : copy.auth.showPassword
            }
            aria-pressed={passwordVisible}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-control px-3 text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-on-accent shadow-card transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {isPending ? copy.auth.submitPending : copy.auth.submit}
      </button>

      {/* Inline error under the form, SPEC Block E. role="alert" so a screen
          reader announces it without moving focus away from the field. */}
      {error === null ? null : (
        <p
          id={errorId}
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger ring-1 ring-danger/20"
        >
          {error}
        </p>
      )}
    </form>
  );
}
