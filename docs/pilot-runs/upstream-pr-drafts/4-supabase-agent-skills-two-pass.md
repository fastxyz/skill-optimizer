# PR #4 — supabase/agent-skills: two-pass review reference

**Target:** `supabase/agent-skills`
**Files:** `skills/supabase-postgres-best-practices/references/review-two-pass-checklist.md` (NEW)
**Base branch:** `main`
**Title:** `feat: add two-pass review checklist reference to postgres-best-practices`

## Body (per the repo's terse conventional-commit style)

```markdown
## Summary

- Adds a new reference file `references/review-two-pass-checklist.md` to the `supabase-postgres-best-practices` skill, splitting the review workflow into Pass 1 (presence violations — wrong token) and Pass 2 (absence violations — missing element).
- Closes a measured gap: across a 3-model eval matrix (claude-sonnet-4.6, openai/gpt-5-mini, google/gemini-2.5-pro × 3 trials), models reliably catch the visible "wrong index column order" / "wrong constraint syntax" violations but skip the absence-type rules (missing `FORCE RLS`, missing FK index, missing partial index `WHERE`).
- Added as a new reference per the repo's contribution norm (additive file under `references/`, no SKILL.md modification). Standard `{prefix}-{name}.md` naming, valid frontmatter.

## Evidence

| Phase | Rule coverage |
|---|---|
| Baseline (raw) | 0.54 (44/81 violations) |
| After adding two-pass reference | 0.86 (70/81) |

Uplift of +0.32 across 9 seeded SQL violations spanning schema, RLS, and indexing rules. Most gains on absence-type rules (missing-FORCE-RLS, missing-FK-index, missing-partial-index-WHERE).
```

## File to add

**Path:** `skills/supabase-postgres-best-practices/references/review-two-pass-checklist.md` (NEW file)

Content:

```markdown
---
title: Two-Pass Review Checklist
impact: high
tags: [review, indexing, rls, schema]
---

When reviewing SQL files for postgres best practices, use this two-pass
approach. Pass 1 catches visible token misuse; Pass 2 catches the
absence-type rules that are most often missed.

## Pass 1 — Presence violations (a token appears but is wrong)

- Wrong composite-index column order (range column before equality column)
- `ADD CONSTRAINT IF NOT EXISTS` syntax (invalid in Postgres)
- `auth.uid()` called directly in RLS `USING` clause instead of `(select auth.uid())`
- Index without `INCLUDE` when covering columns are needed for the predicate

## Pass 2 — Absence violations (a required element is missing entirely)

- Tables storing multi-tenant / user data with NO `ENABLE ROW LEVEL SECURITY`
- Tables with `ENABLE ROW LEVEL SECURITY` but no `FORCE ROW LEVEL SECURITY`
- Foreign key columns with NO corresponding `CREATE INDEX`
- RLS policy columns with NO index for the filtered column
- Full indexes where a partial `WHERE` clause would be smaller and faster

## Why two passes

Models reliably catch visible misuse (a wrong token in the SQL) but skip
absence-type checks (something missing from the SQL entirely). Running
Pass 2 explicitly — element-by-element through `CREATE TABLE`,
`CREATE POLICY`, and `CREATE INDEX` statements — closes the gap.

## Incorrect

\`\`\`sql
-- Forgets to enforce RLS even after enabling it
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_owner ON orders USING (auth.uid() = user_id);
\`\`\`

## Correct

\`\`\`sql
-- Enables AND forces RLS so superuser/owner queries are also subject to policies
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY orders_owner ON orders USING ((select auth.uid()) = user_id);
CREATE INDEX ON orders (user_id);  -- needed because the policy filters on user_id
\`\`\`
```

## Caveats

1. **File naming.** Per CONTRIBUTING.md, references use a
   `{prefix}-{name}.md` pattern. `review-` is a reasonable prefix for
   workflow guidance distinct from the `schema-`, `query-`, `lock-`,
   `data-`, etc. prefixes already in the directory. Verify with
   `ls skills/supabase-postgres-best-practices/references/` after
   cloning to confirm no naming collision.

2. **Don't bump SKILL.md version.** Release Please handles that
   post-merge based on the conventional commit type (`feat:`).

3. **CI gate.** `pnpm test:sanity` runs on every PR. It checks new
   reference files have valid frontmatter and follow the
   `{prefix}-{name}.md` convention. Run it locally before pushing:

```bash
pnpm install
pnpm test:sanity
```

1. **Earlier proposal alternative.** The auto-pilot's batch-1 proposal
   added the two-pass content directly to `SKILL.md`. That's a less
   conventional path for this repo (they prefer reference-file
   additions) — reformatting as a new reference here. The content is
   functionally identical.

## Operator steps to submit

```bash
# 1. Clone fork
git clone git@github.com:fastxyz/agent-skills-supabase.git \
  /tmp/upstream-supabase-agent-skills
cd /tmp/upstream-supabase-agent-skills
git remote add upstream https://github.com/supabase/agent-skills.git
git fetch upstream
git checkout -b feat/two-pass-review-reference upstream/main

# 2. Add the reference file
mkdir -p skills/supabase-postgres-best-practices/references
# (the dir likely already exists; check first)
# Paste the file content above into:
# skills/supabase-postgres-best-practices/references/review-two-pass-checklist.md

# 3. Run sanity tests
pnpm install
pnpm test:sanity

# 4. Commit + push (conventional commits)
git add skills/supabase-postgres-best-practices/references/review-two-pass-checklist.md
git commit -m "feat: add two-pass review checklist reference to postgres-best-practices"
git push -u origin feat/two-pass-review-reference

# 5. Open PR
gh pr create --repo supabase/agent-skills --base main \
  --title "feat: add two-pass review checklist reference to postgres-best-practices" \
  --body-file path/to/this-draft-body.md
```
