import { redirect } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { ErrorCard } from "@/components/ErrorCard";
import { Header } from "@/components/Header";
import { NewNoteButton } from "@/components/NewNoteButton";
import { NoteCard } from "@/components/NoteCard";
import { SignOutButton } from "@/components/SignOutButton";
import { TagFilter } from "@/components/TagFilter";
import { copy } from "@/lib/copy";
import { isNotesError, listNotes, listTags } from "@/lib/notes";
import { ROUTES } from "@/lib/routes";
import type { NoteView } from "@/lib/types";

/**
 * The notes list (SPEC Block E — /notes). A Server Component: the rows are fetched
 * during render, on the server, through the DAL.
 *
 * The fetch is what makes this page private. `app/notes/layout.tsx` issues the
 * redirect for a visitor without a session, but a layout `redirect()` does not stop
 * this component from rendering (measured on Next 16.3.1) — so what keeps note rows
 * off the wire is `listNotes()` refusing to run without a verified user, every time
 * (CLAUDE.md rule 3, fence 1). The redirect below is this page's own answer to that
 * refusal, not a second gate.
 *
 * THE TAG FILTER IS A QUERY, NOT A VIEW (SPEC US5 step 3). `?tag=` is read here and
 * passed straight into `listNotes(tag)`, which adds a `.contains('tags', [...])`
 * predicate beside the ownership filter — so a filtered list is a different SELECT,
 * and the rows for other tags never leave Postgres. There is deliberately no array of
 * all notes in this file to filter, which is what makes that property checkable rather
 * than promised: reading the query string is the only thing this component does with
 * the tag.
 *
 * Two DAL calls, not one. `listTags()` is unfiltered on purpose — the filter has to
 * offer every tag the user owns even while one is selected, or a filtered list would
 * be a dead end (see that function). Both call `getUser()`; Next dedupes the identical
 * Auth request inside one render pass, so honesty costs nothing here.
 */
export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // `?tag=a&tag=b` is a legal URL, so the value arrives as `string | string[]`. One
  // filter is what the screen models, so the first entry wins rather than the request
  // being an error — and an empty or whitespace-only value is simply no filter, the
  // same state the All tags button produces.
  const requested = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const trimmed = requested?.trim() ?? "";
  const activeTag = trimmed.length > 0 ? trimmed : null;

  let notes: NoteView[] | null = null;
  let tags: string[] = [];

  try {
    // Sequential rather than Promise.all: both of these throw on failure, and a
    // rejected second promise nobody awaited is an unhandled rejection. The saving is
    // one round-trip on a page that is already doing two.
    notes = await listNotes(activeTag ?? undefined);
    tags = await listTags();
  } catch (error) {
    if (isNotesError(error) && error.failure === "sessionExpired") {
      // Thrown out of the catch, not swallowed by it: redirect() works by throwing.
      redirect(ROUTES.signIn);
    }
    // Anything else is a load failure, and the user sees it in the browser rather
    // than only in the terminal (CLAUDE.md rule 13). `notes` stays null.
    notes = null;
  }

  return (
    <>
      <Header
        actions={
          <>
            <NewNoteButton />
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {/* ONE flex line that is a column on a phone and a row on a desktop, which is
            the whole of the two-layout filter: `TagFilter` comes FIRST in the DOM, so
            below `md` it stacks above the grid, and `md:order-last` sends it to the
            right-hand side without moving it in the source. Keeping it first in the
            document is also the honest reading order — the control comes before the
            list it narrows.

            `md:items-start` is what keeps the sidebar a sidebar: without it the flex
            default stretches the column to the height of the grid, and a tall stretched
            column with a background would look like a panel. It scrolls with the page —
            no `sticky`, no `overflow-y`, so there is never a second scrollbar. */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          {/* Outside every branch below, because the way out of a filter that matched
              nothing is the All tags button — the filter has to survive the empty state
              it caused. It renders nothing when the user has no tags at all. Suppressed
              only on a load failure, where `tags` is not trustworthy either. */}
          {notes === null ? null : (
            <TagFilter
              tags={tags}
              active={activeTag}
              className="md:order-last md:w-56 md:shrink-0 lg:w-60"
            />
          )}

          {/* `min-w-0` is load-bearing: a flex item's default `min-width: auto` refuses
              to shrink below its content, and a long unbroken word in a card would push
              the grid past the sidebar and put a scrollbar on the page. */}
          <div className="min-w-0 flex-1">
            {notes === null ? (
              <ErrorCard title={copy.notes.loadError} />
            ) : notes.length === 0 ? (
              // Two different emptinesses. "No notes yet." with a New note CTA is a new
              // account; "No notes with this tag." is a filter, where offering New note
              // would create an untagged note that the current filter immediately hides.
              activeTag === null ? (
                <EmptyState
                  title={copy.notes.empty.title}
                  description={copy.notes.empty.description}
                  action={<NewNoteButton />}
                />
              ) : (
                <EmptyState title={copy.notes.empty.filtered} />
              )
            ) : (
              // Three columns at 1280 (SPEC Block E) — but measured against the width
              // LEFT BY the sidebar, not the viewport, which is why the third column
              // now arrives at `xl` rather than `lg`. At `lg` the remaining ~700 px
              // makes two comfortable cards instead of three cramped ones.
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {notes.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
