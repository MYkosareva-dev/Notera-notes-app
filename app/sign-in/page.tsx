import { copy } from "@/lib/copy";

/**
 * Public sign-in screen. Layout shell only for now: the email/password form,
 * the `signIn` Server Action and the "already signed in → /notes" redirect all
 * land in Phase 3 (BUILD_PHASES.md). Nothing here touches Supabase.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <h1 className="mb-6 text-lg font-semibold tracking-tight">
        {copy.app.name}
      </h1>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-card">
        <p className="text-sm text-text-muted">{copy.placeholder.comingSoon}</p>
      </div>
    </main>
  );
}
