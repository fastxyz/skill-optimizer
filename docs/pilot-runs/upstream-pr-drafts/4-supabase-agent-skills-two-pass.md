# PR #4 — supabase/agent-skills: monitor-two-pass-review reference

**Target:** `supabase/agent-skills`
**File:** `skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md` (NEW file, additive)
**Base branch:** `main`
**Title:** `feat: add monitor-two-pass-review reference for absence-class SQL bugs`

## Summary

Single additive reference file under the existing `monitor-` prefix
(diagnostic workflow). Frames a two-pass SQL-review pattern around a
concrete anti-pattern (`UPDATE` missing `WHERE`) using the repo's
required `**Incorrect**` / `**Correct**` SQL-block convention.

The reference is the v1.2.1 auto-pilot's reshaping of a more abstract
"two-pass review" concept. The auto-pilot read the upstream context
file (`tools/auto-improve-contexts/supabase-postgres-best-practices.md`,
encoded from gh-CLI research of CONTRIBUTING.md, `_template.md`,
`_contributing.md`, `_sections.md`, plus the last 10 merged PRs) and
produced a file that conforms exactly to the existing 28-reference
convention: 4-field frontmatter, `monitor-` prefix, single rule,
`**Incorrect**`/`**Correct**` SQL blocks, trailing `Reference:` link,
~50 lines.

## PR body (terse, per supabase convention)

```markdown
## Summary

- Adds a new reference under the `monitor-` prefix that teaches a two-pass SQL review pattern catching absence-class bugs (missing `WHERE`, missing RLS, missing FK index) that single-pass review systematically misses.
- Slots into the existing 28-reference convention: same frontmatter (`title`, `impact`, `impactDescription`, `tags`), same `**Incorrect**` / `**Correct**` SQL-block shape, same trailing `Reference:` link.
- Purely additive — no existing files modified. `metadata.version` left to Release Please.
```

## File to add

**Path:** `skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md` (NEW file)

````markdown
---
title: Run Two Passes on Generated SQL Reviews
impact: MEDIUM
impactDescription: Catch absence-class bugs (missing WHERE, missing index) that single-pass review skips
tags: review, diagnostics, code-review, sql-review
---

## Run Two Passes on Generated SQL Reviews

Single-pass SQL review catches tokens that should not be there (presence violations) but
systematically misses required elements that are absent (absence violations). The most
dangerous SQL bugs — mutations without `WHERE`, tables without RLS, foreign keys without
indexes — all fall into the absence class and survive single-pass review undetected.

**Incorrect (single-pass review approves unsafe mutation):**

```sql
-- Single pass: scanned for SELECT *, OFFSET, subqueries — none found
-- Reviewer approves the following as safe:

update orders set status = 'archived';
-- Absence violation missed: no WHERE clause — this archives ALL rows, not just old ones
```

**Correct (two-pass review catches the absence violation):**

```sql
-- Pass 1 (presence): scan for known-bad tokens
--   SELECT *? No.  OFFSET? No.  auth.uid() direct? No.  IF NOT EXISTS on ALTER? No.
--   Passed.

-- Pass 2 (absence): verify required patterns exist on every mutation and user table
--   UPDATE/DELETE without WHERE? YES — absence violation caught

-- Fix: add WHERE clause before approving
update orders set status = 'archived'
  where created_at < now() - interval '1 year';
-- Now only rows older than one year are archived — safe and intentional
```

Pass 2 absence checklist — verify these exist:

```sql
-- UPDATE/DELETE must have a WHERE clause
update users set is_active = false where last_login < now() - interval '1 year';

-- User-data tables must have RLS enabled
alter table messages enable row level security;

-- FK columns must have a supporting index
create index posts_author_id_idx on posts (author_id);
```

Reference: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
````

## Evidence (honest framing)

**This pilot did not produce measured uplift.** Two reasons up-front:

1. The v2 auto-pilot baseline on a 5-case eval (45 trials × 3 frontier
   models) hit **0.97 overall** — above the 0.95 "skill needs no
   changes" threshold. No iteration loop fired.
2. The `monitor-two-pass-review.md` reference itself was therefore
   produced as a packaging-only output (per upstream context constraint
   "add EXACTLY ONE additive file"), not as a response to measured
   failures.

**Per-case breakdown reveals one weak case the reference targets:**

| Case | Coverage | Notes |
|---|---|---|
| `review-schema` (5 violations) | 100% | Calibrated baseline from prior pilot |
| `review-rls` (4 violations) | 97.2% | Calibrated baseline |
| `review-multi-table-rls` (3 violations) — NEW | 100% | Frontier models handled enumeration cleanly |
| `review-fk-index-audit` (3 violations) — NEW | 96.3% | Gemini missed 1 trial |
| **`review-update-without-where` (1 violation) — NEW** | **77.8%** | **2/9 trials missed by gpt-5-mini + gemini** |

The `update-without-where` case at 77.8% is the failure mode the
reference directly addresses. The 0.97 overall average masks it
because the auto-pilot's exit-on-≥0.95 logic uses overall average
rather than per-case minimum (a known v1.2.1 limitation; addressed in
the v1.3 design proposal).

**Earlier evidence (batch-1 pilot, 2026-05-08):** the same two-pass
concept (then in less polished form) showed an uncalibrated baseline
of 0.54 → 0.86 with grader-fixes-plus-skill-change bundled. We never
cleanly separated the grader-calibration uplift from the skill-change
uplift, so this number is **not** clean evidence either.

**Net pitch:** the reference is structurally sound and convention-perfect.
It addresses an observed failure pattern (update-without-where at
77.8%) that single-pass review systematically misses. We don't have
clean v1.2.1 measurement that quantifies its effect because frontier
models on the rest of the suite are at ceiling. Maintainer decides if
that's worth merging.

## Caveats

1. **Convention compliance.** Filename uses existing `monitor-` prefix
   (no new prefix added; would have required modifying `_sections.md`
   which is not additive). Frontmatter has all 4 required fields per
   `_template.md`. Body has `**Incorrect (...)**` + `**Correct (...)**`
   blocks per `_contributing.md` Key Principle #1 ("Show exact SQL
   rewrites. Avoid philosophical advice."). Code blocks tagged `sql`
   with lowercase keywords. Trailing `Reference:` link.
2. **No SKILL.md changes.** Per `release-please-config.json`, the
   `metadata.version: "1.1.1"` field is auto-managed by Release
   Please's `extra-files` regex. Manual edits would conflict with the
   bot's release PR.
3. **No `_sections.md`, `_template.md`, or `_contributing.md` changes.**
   Those are infrastructure files; CONTRIBUTING.md treats touching them
   as a "major change requiring prior Discussion".
4. **Discussion-first gate.** PR #48 (qvad's "Add YugabyteDB write
   throughput optimization skill", 13 reference files, no prior
   Discussion) was closed without merge. Single additive reference
   files under existing prefixes do NOT trigger this gate per recent
   merged PRs (PR #71 from gregnr, PR #55 from external `staaldraad`
   both merged within hours).
5. **`pnpm test:sanity` does NOT validate frontmatter.** Confirmed by
   reading `test/sanity.test.ts` directly — it only runs
   `npx skills add` to verify install. Convention is enforced by
   maintainer review only.

## Operator steps to submit

```bash
# 1. Clone fork
git clone git@github.com:fastxyz/agent-skills-supabase.git \
  /tmp/upstream-supabase-agent-skills
cd /tmp/upstream-supabase-agent-skills
git remote add upstream https://github.com/supabase/agent-skills.git
git fetch upstream
git checkout -b feat/monitor-two-pass-review upstream/main

# 2. Add the reference file (paste the content above)
mkdir -p skills/supabase-postgres-best-practices/references
# Paste content into:
# skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md

# 3. Run sanity tests
pnpm install
pnpm test:sanity

# 4. Commit + push
git add skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md
git commit -m "feat: add monitor-two-pass-review reference for absence-class SQL bugs"
git push -u origin feat/monitor-two-pass-review

# 5. Open PR (terse body per repo convention)
gh pr create --repo supabase/agent-skills --base main \
  --title "feat: add monitor-two-pass-review reference for absence-class SQL bugs" \
  --body-file path/to/this-draft-body.md
```

## Provenance

- v2 auto-pilot run: branch `eval/auto-pilot/supabase-postgres-best-practices-v2`,
  commit `59c3e85`, status `success`, baseline 0.97, final 0.97 (no iteration; per-case
  breakdown shows update-without-where at 77.8%).
- v1 auto-pilot run: branch `eval/auto-pilot/supabase-postgres-best-practices--v1-shallow`,
  commit `7721534`, status `success`, baseline 1.00, same proposed file.
- Batch-1 (older models, uncalibrated graders): branch
  `eval/auto-pilot/supabase-postgres-best-practices--v1`, commit `94659af`,
  status `success`, baseline 0.54, final 0.86 (uplift conflated with grader-fix).
- Context file: `tools/auto-improve-contexts/supabase-postgres-best-practices.md`
- Total v2 pilot cost: $3.15
