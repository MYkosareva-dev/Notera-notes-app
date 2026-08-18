Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx

# Querying Postgres with filters (.eq, .contains) from server code

Fetched via Context7 from `/supabase/supabase`.
Content below is pasted as returned. Annotations are ours.

> **ANNOTATION (applies to this whole file):** CLAUDE.md rules 1–5 override anything in
> these docs, and for queries **rule 7** is the one that governs: *every* notes query
> filters by the signed-in user's id (`.eq('user_id', user.id)`). RLS is the second
> fence; the explicit filter is still mandatory. All of these queries live in
> `lib/notes.ts` (rule 3b) — no page, component or Server Action queries the `notes`
> table directly.

---

## Add explicit filters to queries in JavaScript

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx

Pass explicit filters matching policy conditions in client queries. This helps PostgreSQL construct more efficient query plans even if the filter duplicates policy rules.

```javascript
const { data } = supabase
  .from('table')
  .select()
  .eq('user_id', userId)
```

> **ANNOTATION — this is the shape of every query in `lib/notes.ts`.** Note *why* the
> official docs recommend the duplicate filter: query planning. Rule 7 requires it for a
> second reason — defense in depth, so a missing or mis-scoped RLS policy is not the only
> thing standing between two users' notes.
>
> Two adaptations:
> 1. `userId` must come from `await supabase.auth.getUser()` inside the DAL — never from
>    a Server Action parameter or any client input (rule 3b).
> 2. Destructure and handle `error`, not just `data`. supabase-js resolves with
>    `{ data, error }` and does **not** throw on a Postgres error; `data` is `null` and an
>    unchecked read looks like "no notes" instead of "the query failed" (rule 13).
> 3. The snippet omits `await`. `.select()` returns a thenable builder — without `await`
>    you get the builder, not the rows.

---

## Query without client-side filters in JavaScript

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx

Relies entirely on implicit RLS where clauses without client-provided filters. This pattern can lead to suboptimal PostgreSQL query execution plans.

```javascript
const { data } = supabase
  .from('table')
  .select()
```

> **ANNOTATION — PROHIBITED IN THIS PROJECT.** The docs call this merely "suboptimal";
> rule 7 makes it a hard error. A bare `.select()` on `notes` is exactly the query that
> returns every user's notes the moment an RLS policy is dropped, renamed, or disabled
> during a schema change. If you see one in a review, it is a finding.

---

## Eq filter composing with order and limit

Source: https://github.com/supabase/supabase/blob/master/apps/www/data/contribute/index.ts

Demonstrates the general composition pattern: `.eq()` filter followed by `.order()` on a timestamp column and `.limit()`

```typescript
  const { data: threads, error: threadsError } = await supabase
    .from('v_contribute_threads')
    .select(
      'thread_id, subject, status, author, external_activity_url, created_at, source, product_areas, stack, category, sub_category, summary, first_msg_time, message_count, thread_key'
    )
    .eq('author', author)
    .order('first_msg_time', { ascending: false })
    .limit(50)
```

> **ANNOTATION — the composition and error handling here are what to copy:**
> `await`, an explicit column list in `.select()` rather than `*`, `.eq()` before
> `.order()`, and `error` destructured alongside `data`.
>
> For the notes list: name the columns explicitly so a later schema addition cannot
> silently start shipping a new column to the client, and derive any `.limit()` from
> `LIMITS` in code — never a typed-out number (rules 10 and 11 — import constants, never
> redeclare them).

---

## Advanced Query Examples

Source: https://github.com/supabase/supabase/blob/master/apps/www/_blog/2021-03-11-using-supabase-replit.mdx

Examples demonstrating 'or', 'is', 'in', and 'neq' filters in Supabase queries.

```javascript
// or
const { data, error } = await supabase
  .from('cities')
  .select('name, country_id')
  .or('id.eq.20,id.eq.30')

// is
const { data, error } = await supabase.from('cities').select('name, country_id').is('name', null)

// in
const { data, error } = await supabase
  .from('cities')
  .select('name, country_id')
  .in('name', ['Rio de Janeiro', 'San Francisco'])

// neq (not equal to)
const { data, error } = await supabase
  .from('cities')
  .select('name, country_id')
  .neq('name', 'The shire')

// full docs here: /docs/reference/javascript/filter
```

> **ANNOTATION — `.or()` is the one filter that can defeat rule 7.** `.or()` takes a
> raw PostgREST filter string, and it applies to the *whole* `where` clause at its
> nesting level — so `.eq('user_id', user.id).or('a.eq.1,b.eq.2')` still scopes
> correctly, but putting a user-scoping term *inside* an `.or()` string does not. Never
> interpolate user input into an `.or()` string; if a search or multi-condition filter is
> needed, keep `.eq('user_id', user.id)` as its own top-level call and use
> `.or(..., { referencedTable })`/`.and()` nesting deliberately.

---

## Documentation snippet showing .in() filter syntax

Source: https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Docs/Snippets.ts

Canonical documentation example from the Supabase API docs showing the .in() filter syntax for matching a column against an array of values.

```typescript
  .in('column', ['Array', 'Values'])
```

---

## `.contains()` — what Context7 returned

> **ANNOTATION — GAP, READ THIS BEFORE USING `.contains()`.** Three separate Context7
> queries did **not** return the supabase-js `.contains()` reference page. What came back
> instead is the underlying Postgres/pg_graphql containment material, reproduced below,
> plus SQL-level equivalents. Nothing below is a verified supabase-js code example, so do
> not paste a `.contains()` call from memory into `lib/notes.ts` on the strength of this
> file — confirm the exact signature against
> <https://supabase.com/docs/reference/javascript/contains> (or the installed
> `@supabase/postgrest-js` type definitions in `node_modules`) first.
>
> Also note: **SPEC.md is the source of truth for whether Notera has tags at all.** If
> the `notes` table has no array or `jsonb` column this sprint, `.contains()` has no
> caller and adding one would be inventing scope (rules 17 and "do not invent"). Check
> SPEC.md Block B before writing any containment query, and remember any column that
> would need one is a schema change that goes through `supabase/schema.sql` (rule 8).

### Filtering array column types

Source: https://github.com/supabase/supabase/blob/master/apps/www/_blog/2024-08-16-pg-graphql-1-5-7.mdx

From `1.5.6` pg_graphql has added `contains`, `containedBy`, `overlaps` filter operators for scalar array fields like `text[]` or `int[]`.

### Filtering `tags` array column

Source: https://github.com/supabase/supabase/blob/master/apps/www/_blog/2024-08-16-pg-graphql-1-5-7.mdx

GraphQL query to filter `blogCollection` where the `tags` column contains both 'tech' and 'innovation'.

```graphql
{
  blogCollection(filter: { tags: { contains: ["tech", "innovation"] } }) {
    edges {
      cursor
      node {
        name
        tags
        createdAt
      }
    }
  }
}
```

> **ANNOTATION:** This is **pg_graphql**, not supabase-js. Notera uses the PostgREST
> client (`supabase.from(...)`), not the GraphQL endpoint, and adding pg_graphql would be
> a new dependency requiring owner approval. The transferable fact is only the *semantics*
> — `contains` means "the column contains **all** of these values", i.e. Postgres `@>`,
> whereas `overlaps` means "any of". Those semantics do carry over to `.contains()`.

### Filter by `jsonb` Metadata in SQL

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai/semantic-search.mdx

Apply a filter using the `jsonb` `@>` containment operator within a SQL function to match documents based on their metadata column.

```sql
where documents.metadata @> filter_metadata
  and documents.embedding <=> query_embedding < 1 - match_threshold
```

> **ANNOTATION:** `@>` is the operator `.contains()` compiles down to — useful for
> reasoning about behavior and for indexing (a containment filter wants a **GIN** index to
> avoid a sequential scan). If a containment query ever lands in `lib/notes.ts`, the index
> belongs in `supabase/schema.sql` in the same change (rule 8). Also: a SQL-function
> approach like this bypasses `lib/notes.ts` unless the RPC is called *from* the DAL —
> keep the single entry point (rule 3b).

### Querying JSONB data

Source: https://github.com/supabase/supabase/blob/master/apps/www/_blog/2021-02-27-cracking-postgres-interview.mdx

Example of querying JSONB data stored in a 'grades' column to find students with a specific grade in 'geography'.

```sql
-- grades = {'geography': 'A', 'history': 'B', 'postgres': 'A++'}
select * from students where grades->>'geography' = 'A';
```

> **ANNOTATION:** `->>` (extract as text, equality) is a *different* operation from `@>`
> (containment) and is not what `.contains()` does. Raw SQL like this runs in the SQL
> Editor with elevated rights and **bypasses RLS**; anything schema-shaped that gets run
> there must be mirrored into `supabase/schema.sql` (rule 8), and a bare `select *` with
> no `user_id` predicate must never become an app query (rule 7).

---

## Filter Supabase Vector Store Similarity Search by Metadata in Node.js

Source: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai/langchain.mdx

This snippet shows how to perform a similarity search with an additional metadata filter. The filter uses the Postgres JSONB Containment operator to narrow down search results based on specified metadata field values.

```js
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { OpenAIEmbeddings } from '@langchain/openai'
import { createClient } from '@supabase/supabase-js'

// First, follow set-up instructions above

const privateKey = process.env.SUPABASE_SECRET_KEY
if (!privateKey) throw new Error(`Expected env var SUPABASE_SECRET_KEY`)

const url = process.env.SUPABASE_URL
if (!url) throw new Error(`Expected env var SUPABASE_URL`)

export const run = async () => {
  const client = createClient(url, privateKey)

  const vectorStore = await SupabaseVectorStore.fromTexts(
    ['Hello world', 'Hello world', 'Hello world'],
    [{ user_id: 2 }, { user_id: 1 }, { user_id: 3 }],
    new OpenAIEmbeddings(),
    {
      client,
      tableName: 'documents',
      queryName: 'match_documents',
    }
  )

  const result = await vectorStore.similaritySearch('Hello world', 1, {
    user_id: 3,
  })

  console.log(result)
}
```

> **ANNOTATION — IRRELEVANT AND DANGEROUS AS A TEMPLATE. Do not copy any of it.**
> Flagged because Context7 surfaced it under a containment-filter query:
> 1. `SUPABASE_SECRET_KEY` passed to `createClient` is the **service-role key** — rule 4
>    forbids it from this repo entirely. A client built with it **bypasses RLS**, so the
>    `user_id: 3` filter here is the *only* thing scoping the data. That is the exact
>    single-fence failure mode rule 7 exists to prevent.
> 2. `@langchain/community`, `@langchain/openai` and vector search are new dependencies
>    and out of scope — no other dependencies without explicit owner approval.
> 3. The `user_id` is a literal passed by the caller, not derived from `getUser()`.
>
> This file's only usable lesson from this snippet is the one already stated above:
> containment maps to Postgres `@>`.
