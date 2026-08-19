"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";

/**
 * Sign-in Server Action. Lives next to the only screen that calls it; the
 * workspace's own actions (including signOut) live in app/notes/actions.ts, so a
 * public page never imports from the protected segment.
 *
 * Supabase Auth does all of the authentication (CLAUDE.md rule 1). The only thing
 * this file does with a password is hand the string to signInWithPassword: no
 * hashing, no comparison, no token of our own. The session is written to cookies
 * by the @supabase/ssr client — Server Actions can write cookies, so the refresh
 * path's swallowed error in lib/supabase/server.ts does not apply here.
 */

/** Returned only on failure; success redirects and never resolves to a value. */
export interface SignInResult {
  error: string;
}

// Rate-limit codes from @supabase/auth-js's ErrorCode union. Only the request
// limit can fire on this screen; the other two are listed so a future flow that
// sends mail or SMS maps to the same copy rather than to the generic failure.
const RATE_LIMIT_CODES: ReadonlySet<string> = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

function isRateLimitCode(code: string | undefined): boolean {
  return code !== undefined && RATE_LIMIT_CODES.has(code);
}

/**
 * Supabase's message is never shown to the user. Two reasons: rule 10 (all copy
 * lives in lib/copy.ts) and enumeration — "Invalid login credentials" vs "User not
 * found" tells an attacker which addresses have accounts.
 */
function messageFor(error: AuthError): string {
  // The built-in Auth rate limit (SPEC Block G case 6). Status AND code are both
  // checked: 429 is the documented shape, but this branch has never been
  // exercised against a live rate limit, and Supabase can answer with another 4xx
  // carrying an over_*_rate_limit code — in which case a status-only test would
  // silently show the wrong-credentials copy instead. Deliberately not verified
  // with a live probe: that would spend the project's real rate-limit budget.
  if (error.status === 429 || isRateLimitCode(error.code)) {
    return copy.auth.rateLimited;
  }
  // Anything the Auth server rejected on its merits — wrong password, unknown
  // address, unconfirmed address — collapses into one message on purpose.
  if (error.status === 400 || error.status === 401 || error.status === 403) {
    return copy.auth.badCredentials;
  }
  // Auth unreachable, 5xx, network failure (SPEC Block G case 7): never a raw dump.
  return copy.errors.generic;
}

export async function signIn(formData: FormData): Promise<SignInResult> {
  // A Server Action is a publicly callable POST endpoint, so the payload is
  // whatever the caller sent — narrow it, never cast it (rule 3b).
  const emailField = formData.get("email");
  const passwordField = formData.get("password");

  const email = typeof emailField === "string" ? emailField.trim() : "";
  if (!isValidEmail(email)) {
    return { error: copy.auth.invalidEmail };
  }

  // Not trimmed: whitespace can be part of a password.
  const password = typeof passwordField === "string" ? passwordField : "";
  if (password.length === 0) {
    return { error: copy.auth.missingPassword };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Status and code only. Never log the credentials, and never log the whole
    // error object — auth errors can carry request payloads.
    console.error("[signIn] rejected", { status: error.status, code: error.code });
    return { error: messageFor(error) };
  }

  // Drop every cached Server Component render made for the previous visitor
  // before navigating, then redirect. Both calls stay outside any try/catch:
  // redirect() works by throwing, so a catch would swallow the navigation.
  revalidatePath("/", "layout");
  redirect("/notes");
}
