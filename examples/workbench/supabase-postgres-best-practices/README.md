# supabase-postgres-best-practices eval

Eval suite for
[`supabase/agent-skills/supabase-postgres-best-practices`](https://github.com/supabase/agent-skills) —
Postgres performance optimization and best practices from Supabase.

## Cases

### `review-schema` — schema design & query performance

Sample: `workspace/schema.sql`

| Line | Violation | Rule |
|---|---|---|
| 15 | `customer_id` FK column has no index | `schema-foreign-key-indexes` |
| 23 | `ADD CONSTRAINT IF NOT EXISTS` is invalid Postgres syntax | `schema-constraints` |
| 26 | Full index on `email` without `WHERE deleted_at IS NULL` partial filter | `query-partial-indexes` |
| 29 | Composite index column order: range `created_at` before equality `status` | `query-composite-indexes` |
| 31 | `orders` table stores user data but has no RLS enabled | `security-rls-basics` |

### `review-rls` — Row-Level Security policies

Sample: `workspace/rls_policies.sql`

| Line | Violation | Rule |
|---|---|---|
| 6  | `ENABLE ROW LEVEL SECURITY` without `FORCE`; table owner can bypass | `security-rls-basics` |
| 13 | `auth.uid()` called per row in `USING` clause without `SELECT` wrapper | `security-rls-performance` |
| 17 | `user_id` column used in RLS policy has no index | `security-rls-performance` |
| 23 | `status` index without `INCLUDE (customer_id, total)` forces heap fetch | `query-covering-indexes` |

## Vendored snapshot

The skill reads rule files from a local `references/` directory relative to
`SKILL.md`. For deterministic eval we vendor a full snapshot at
`references/supabase-postgres-best-practices/references/` and place `SKILL.md`
at `references/supabase-postgres-best-practices/SKILL.md`. The relative paths
in `SKILL.md` resolve correctly under the workbench's `/work` layout.
Diff vs upstream is zero (no path changes needed).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-5`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/google/gemini-2.5-flash`
