import { SignInForm } from "@/components/SignInForm";
import { copy } from "@/lib/copy";

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
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <h1 className="mb-6 text-lg font-semibold tracking-tight">
        {copy.app.name}
      </h1>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-card">
        <SignInForm />
      </div>
    </main>
  );
}
