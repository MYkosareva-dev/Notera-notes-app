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

## Taken in the Supabase dashboard (owner only)

The dashboard is outside the agent's remit, so these three ship as 1280 × 720 **placeholder PNGs**
that say so. Save the real capture over the placeholder under the same filename and
every `README.md` link keeps working — no README edit needed.

| File | Where | What the real capture must show |
| --- | --- | --- |
| `auth-users.png` | Authentication → Users | Both test accounts, with Created at / Last sign in. Evidence the accounts are dashboard-created — the app has no sign-up flow. |
| `table-user-id.png` | Table Editor → `notes` | The `user_id` column in frame and populated, two distinct uuids. That column is what every query in `lib/notes.ts` filters on. |
| `sql-scoping.png` | SQL Editor | A query grouping `notes` by `user_id` with its result — each account's rows counted separately, no row without an owner. |

Addresses are visible in the dashboard's own UI. Nothing in this repo's *code* holds an
email (CLAUDE.md rule 5) and these images are not code, but blur or crop anything you
would rather not commit.
