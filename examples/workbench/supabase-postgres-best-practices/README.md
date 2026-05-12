# supabase-postgres-best-practices eval

Eval suite for
[`supabase/agent-skills/supabase-postgres-best-practices`](https://github.com/supabase/agent-skills) —
Postgres performance optimization and best practices from Supabase.

## Cases

### `review-schema` — Schema design & security

Sample: `workspace/schema.sql`

| Line | Violation | Rule |
|---|---|---|
| 15 | Missing index on `customer_id` FK column | schema-foreign-key-indexes |
| 23 | `ADD CONSTRAINT IF NOT EXISTS` invalid syntax | schema-constraints |
| 26 | Full index on `email` — should be partial with `WHERE deleted_at IS NULL` | query-partial-indexes |
| 29 | Composite index with range column first (`created_at, status`) — wrong order | query-composite-indexes |
| 31-33 | `orders` table has no `ENABLE ROW LEVEL SECURITY` | security-rls-basics |

### `review-rls` — RLS & index quality

Sample: `workspace/rls_policies.sql`

| Line | Violation | Rule |
|---|---|---|
| 6 | `ENABLE ROW LEVEL SECURITY` without `FORCE ROW LEVEL SECURITY` | security-rls-basics |
| 13 | `auth.uid()` in USING clause — should use `(select auth.uid())` to prevent per-row calls | security-rls-performance |
| 16-19 | `user_id` policy column has no supporting index | security-rls-performance |
| 23 | Index on `status` without `INCLUDE (customer_id, total)` — misses covering-index | query-covering-indexes |

### `review-multi-table-rls` — multi-table RLS enumeration (deeper-v1)

Sample: `workspace/multi_table_schema.sql` (~90 lines, 6 tables)

Mixes 4 user-data tables (need RLS) with 2 reference tables (don't). The
agent must enumerate every CREATE TABLE and decide per table.

| Line | Violation | Type | Rule |
|---|---|---|---|
| 35 | `posts` has `ENABLE` but no `FORCE ROW LEVEL SECURITY` | absence | security-rls-basics |
| 44 | `comments` table never calls `ENABLE ROW LEVEL SECURITY` | absence | security-rls-basics |
| 68 | `messages` table never calls `ENABLE ROW LEVEL SECURITY` | absence | security-rls-basics |

Grader requires the model to name the **specific** offending table (not just
"RLS missing somewhere"). Reference tables `countries` and `currencies` are
correct decoys — flagging them does not earn credit and does not lose
credit either, but spending attention on them displaces the real misses.

### `review-fk-index-audit` — FK-index enumeration (deeper-v1)

Sample: `workspace/migrations.sql` (~80 lines, 7 ALTER-TABLE-add-FK statements)

Half the foreign keys have a follow-up `CREATE INDEX`; half don't. The
agent must walk every ALTER, track which FK columns have indexes, and
report each one without an index.

| Line | Violation | Type | Rule |
|---|---|---|---|
| 18-20 | `order_items.order_id` FK has no supporting index | absence | schema-foreign-key-indexes |
| 38-40 | `invoices.order_id` FK has no supporting index | absence | schema-foreign-key-indexes |
| 54-56 | `shipments.carrier_id` FK has no supporting index | absence | schema-foreign-key-indexes |

Grader requires the model to name the specific FK column (e.g. `carrier_id`)
and a `index`/`idx` stem, within ±8 lines of the offending ALTER.

### `review-update-without-where` — mutation safety (deeper-v1)

Sample: `workspace/data_migration.sql` (~42 lines, 6 DML statements)

Six UPDATE/DELETE statements wrapped in a single transaction. Five have a
`WHERE` clause; one does not. The agent must enumerate every DML and check
each for an unfiltered mutation.

| Line | Violation | Type | Rule |
|---|---|---|---|
| 22-23 | `update orders set total = ...` has no `WHERE` clause; mutates every row | absence | mutation-safety / monitor-two-pass-review |

Grader requires the model to name the `orders` table and a `WHERE`-related
stem (e.g. "missing WHERE", "unfiltered", "all rows").

## Vendored snapshot

The skill normally reads rule files from the local `references/` directory. For deterministic eval we vendor all reference files at `references/supabase-postgres-best-practices/references/` and point `SKILL.md` to them. Diff vs upstream: none (SKILL.md is unmodified).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`
