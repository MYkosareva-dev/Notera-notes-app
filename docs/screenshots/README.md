# Screenshots

Five images, all referenced from `README.md`. Two halves, split by who may take them.

## Taken through the app (agent, real Chrome over CDP)

| File | Viewport | What it shows |
| --- | --- | --- |
| `notes.png` | 1280 × 800 | The signed-in workspace: seven notes in the three-column grid with the tag sidebar at the right. Account A. |
| `sign-in.png` | 1280 × 760 | `/sign-in`, signed out, both fields empty and no error text. Captured in a second, never-signed-in Chrome profile so the signed-in session was not disturbed. |

Both were captured against `npm run dev` with the Next dev indicator hidden for the
capture only — a one-line injected `nextjs-portal{display:none}`, no source change. The
pointer is parked off-grid in `notes.png`, because a card under the cursor shows its
hover border and its `⋮` button and then reads as one card styled unlike the other six.

## Taken in the Supabase dashboard (owner)

The dashboard is outside the agent's remit, so these three are the owner's own captures.
They replaced the placeholder PNGs that shipped in the first commit on this branch.

| File | Size | Where | What it shows |
| --- | --- | --- | --- |
| `auth-users.png` | 1902 × 891 | Authentication → Users | Both test accounts, their UIDs, Created at and Last sign in. The evidence that accounts are made in the dashboard — the app has no sign-up flow. |
| `table-user-id.png` | 1910 × 861 | Table Editor → `public.notes` | All nine rows with the `user_id` column populated by two distinct uuids, the `tags` array alongside, and the table's "4 RLS policies" badge. |
| `sql-scoping.png` | 1231 × 746 | SQL Editor | `select user_id, count(*) … group by user_id` and its result: 7 notes for one owner, 2 for the other. |

The three cross-check each other: the two UIDs in `auth-users.png` are the two `user_id`
values in `table-user-id.png`, and the 7 + 2 split in `sql-scoping.png` accounts for
every row visible there.

Checked before committing: no API key, no service-role key and no personal address is in
frame, and both test accounts are synthetic `@example.com` ones. Anything
re-captured later should be checked the same way, since a Settings → API screen would
put a key in the repo.
