import { redirect } from "next/navigation";

// SPEC Block A: "/" redirects to "/notes"; the redirect target is what enforces
// auth (Phase 3 adds the check).
export default function HomePage() {
  redirect("/notes");
}
