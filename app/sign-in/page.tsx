import { NotebookPen } from "lucide-react";

import { SignInForm } from "@/components/SignInForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { copy } from "@/lib/copy";
import { getThemePreference } from "@/lib/theme.server";

/**
 * Public sign-in screen (SPEC Block E). A Server Component shell around the
 * client form; the form itself talks to the `signIn` Server Action.
 *
 * No getUser() call here. This page is public, so there is no access decision to
 * make: the "already signed in → /notes" hop is a convenience that proxy.ts takes
 * before this renders (SPEC Block A routes, edge case G-3). If it ever stopped
 * working the worst case is a signed-in user seeing a form — no data is exposed,
 * which is why this one may live in the interceptor while real guards may not.
 */
export default async function SignInPage() {
  const theme = await getThemePreference();

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      {/* This screen has no `Header`, so the control is placed here rather than
          inherited. It has to be reachable HERE and not only inside the workspace:
          /sign-in is the first thing a new visitor sees, and a preference that can
          only be set after signing in is a preference the sign-in screen ignores.
          Absolute so it stays in the corner without pushing the centred card off
          the vertical middle. */}
      <ThemeToggle
        preference={theme}
        className="absolute top-4 right-4 sm:top-6 sm:right-6"
      />
      <div className="mb-8 flex flex-col items-center gap-3">
        {/* Decorative — the app name below it is the accessible text. */}
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-card bg-accent-soft text-accent"
        >
          <NotebookPen className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{copy.app.name}</h1>
      </div>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
        <SignInForm />
      </div>
    </main>
  );
}
