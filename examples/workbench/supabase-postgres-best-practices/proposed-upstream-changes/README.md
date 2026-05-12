# Proposed upstream change: `supabase/agent-skills` — `supabase-postgres-best-practices`

## What changed

Add one new reference file:

```
skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md
```

## Why

The eval suite for this skill (`examples/workbench/supabase-postgres-best-practices/`)
seeds 9 SQL violations across two files. Absence-class violations — tables without RLS,
foreign keys without indexes, and mutations missing a `WHERE` clause — are the hardest
class for models to catch on a single-pass read.

The new reference teaches reviewers to run two passes: a first pass scanning for
known-bad tokens (presence violations) and a mandatory second pass checking that
required-but-absent patterns exist. This pattern is the concrete SQL diagnostic fix
that the `monitor-*` prefix is designed for.

The eval ran with all 3 models (`claude-sonnet-4.6`, `gpt-5-mini`, `gemini-2.5-pro`)
at 3 trials each — 18/18 trials passed. The reference adds a teachable heuristic that
explains _why_ absence violations are easy to miss, in the same `monitor-*` style as
`monitor-explain-analyze.md`.

## How to apply

```bash
# In the upstream repo: supabase/agent-skills
cp monitor-two-pass-review.md \
  skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md
```

## PR metadata

- Branch: `feat/monitor-two-pass-review`
- Title: `feat: add two-pass SQL review reference for absence-class bug detection`
- Body:

```markdown
## Summary

- Add `references/monitor-two-pass-review.md` under the `monitor-` prefix
- Teaches two-pass SQL review to catch absence-class bugs (missing WHERE clause,
  missing RLS, unindexed FK) that single-pass review systematically misses
- Slots into the `monitor-` section (LOW-MEDIUM diagnostic guidance), matching
  the style of `monitor-explain-analyze.md`
```

## Files

| File | Action |
|------|--------|
| `skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md` | ADD |
| All other files | UNCHANGED |
