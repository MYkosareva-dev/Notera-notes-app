"use client";

import { useId, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { signIn } from "@/app/sign-in/actions";
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
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError(copy.auth.invalidEmail);
      return;
    }
    if (password.length === 0) {
      setError(copy.auth.missingPassword);
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.set("email", trimmedEmail);
    formData.set("password", password);

    startTransition(async () => {
      const result = await signIn(formData);
      // Reached on failure only: a successful sign-in redirects, so the call
      // navigates instead of resolving with a value — hence the optional chain.
      if (result?.error) {
        // US1 step 2: the form stays filled except the password.
        setPassword("");
        setPasswordVisible(false);
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium">
          {copy.auth.emailLabel}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isPending}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm font-medium">
          {copy.auth.passwordLabel}
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isPending}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : errorId}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-3 pr-10 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-60"
          />
          {/* type="button": inside a form a bare <button> submits, which would
              fire a sign-in attempt on every reveal. */}
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            disabled={isPending}
            aria-label={
              passwordVisible ? copy.auth.hidePassword : copy.auth.showPassword
            }
            aria-pressed={passwordVisible}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
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
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {isPending ? copy.auth.submitPending : copy.auth.submit}
      </button>

      {/* Inline error under the form, SPEC Block E. role="alert" so a screen
          reader announces it without moving focus away from the field. */}
      {error === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
