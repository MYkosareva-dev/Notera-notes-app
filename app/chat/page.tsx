import { redirect } from "next/navigation";
import { NotebookText } from "lucide-react";

import { ChatPanel } from "@/components/ChatPanel";
import { Header } from "@/components/Header";
import { NavLink } from "@/components/NavLink";
import { SignOutButton } from "@/components/SignOutButton";
import { loadLatestConversation } from "@/lib/chatMessages";
import { copy } from "@/lib/copy";
import { ROUTES } from "@/lib/routes";
import { getThemePreference } from "@/lib/theme.server";
import type { ChatTurn } from "@/lib/types";

/**
 * The chat screen (SPEC US8).
 *
 * A Server Component, and since the persistence amendment it DOES fetch: the user's most
 * recent conversation, on the server, through the chat DAL. That changed what makes this
 * page private, so it is worth stating precisely. It used to have nothing to leak — it
 * rendered an empty conversation — and the fence that mattered was the one over the
 * SPEND. It now renders the user's own words, so `/chat` is private for the same reason
 * `/notes` is: `loadLatestConversation()` refuses to run without a verified user, every
 * time (fence 1). The layout's redirect is this page's answer to that refusal, not a
 * second gate — a layout `redirect()` does not stop a sibling page from rendering
 * (measured on Next 16.3.1, recorded in `app/notes/layout.tsx`).
 *
 * `null` for `initialTurns` means the read FAILED, and it is deliberately distinct from
 * an empty array, which means "no conversation yet". The panel shows an error card for
 * the first and its empty state for the second — collapsing them would present a
 * database that is unreachable as a user with nothing to say, which is how a
 * conversation gets quietly started on top of history that already exists.
 * **Before `supabase/chat-amendment.sql` has been run this is the path you get**: the
 * table does not exist, the read fails with `42P01`, and the screen says so.
 *
 * FULL-HEIGHT LAYOUT, not a growing page. `h-dvh` + `overflow-hidden` here pins the
 * screen to the viewport so the TRANSCRIPT scrolls rather than the document, which is
 * what keeps the composer on screen without a `fixed` element and its attendant z-index
 * and safe-area problems. `min-h-0` on the main is the load-bearing half: a flex child's
 * default `min-height: auto` refuses to shrink below its content, so without it the list
 * would push the composer off the bottom instead of scrolling — the same trap `min-w-0`
 * solves in the notes grid.
 */
export default async function ChatPage() {
  // Read here rather than inside `Header`, for the reason `HeaderProps.theme`
  // records: an async Header breaks the notes skeleton, which renders it inside a
  // Suspense fallback.
  const theme = await getThemePreference();

  const loaded = await loadLatestConversation();

  // The DAL reports a missing user rather than redirecting, because it is also called
  // from a Server Action where a redirect would swallow the result. This page is the
  // caller that owes the navigation — the same split `/notes` uses for its
  // `sessionExpired` case. Outside a try/catch on purpose: `redirect()` works by
  // throwing.
  if (!loaded.ok && loaded.failure === "sessionExpired") {
    redirect(ROUTES.signIn);
  }

  const initialTurns: ChatTurn[] | null = loaded.ok ? loaded.turns : null;
  const initialConversationId: string | null = loaded.ok
    ? loaded.conversationId
    : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        theme={theme}
        actions={
          <>
            <NavLink
              href={ROUTES.notes}
              label={copy.chat.navToNotes}
              icon={NotebookText}
            />
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col px-4 sm:px-6">
        <ChatPanel
          initialTurns={initialTurns}
          initialConversationId={initialConversationId}
        />
      </main>
    </div>
  );
}
