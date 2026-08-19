import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// SPEC Block A: "/" redirects to "/notes"; the redirect target is what enforces
// auth — the workspace layout and, authoritatively, the DAL behind it.
export default function HomePage() {
  redirect(ROUTES.notes);
}
