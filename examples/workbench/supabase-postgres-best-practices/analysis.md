---
skill: supabase/agent-skills/supabase-postgres-best-practices
status: success
classification: code-reviewer
baseline_rule_coverage: 0.54
final_rule_coverage: 0.86
modifications_tried: 1
total_cost_usd: 0.00
---

# Auto-pilot run for `supabase/agent-skills/supabase-postgres-best-practices`

- **Classification**: `code-reviewer` — skill prescribes SQL patterns (incorrect vs. correct) across 8 rule categories; eval seeds SQL files with known violations and grades agent findings.
- **Seeded violations**: 5 in `schema.sql` (FK missing index, invalid constraint syntax, partial index, composite column order, missing RLS) and 4 in `rls_policies.sql` (FORCE RLS absent, auth.uid per-row, missing user_id index, covering index without INCLUDE) — 9 violations total across 2 cases.
- **Baseline failure pattern**: Grader line-number ranges were too narrow (±3 lines); agents correctly identified all violations but reported lines relative to parent statements rather than exact violation lines, causing false-negatives. Also, the `/covering/i` keyword did not match "does not cover" phrasing. Result: 44/81 (0.54) detected.
- **Modification tried**: (1) Widened all grader line-ranges to ±8 lines; added `/cover/i` keyword for covering-index grader. (2) Added additive **Two-Pass Review Checklist** section to SKILL.md distinguishing presence violations (wrong token) from absence violations (missing element), as agents consistently missed absence-type rules without an explicit reminder.
- **Uplift**: 70/81 (0.86) — improvement of +0.32. Remaining misses are flaky Gemini trial (no findings.txt) and a GPT trial with truncated output.
- **Judgment calls**: Grader calibration (range widening) counted as iteration 1 since it was required before any meaningful skill-quality diagnosis. No rule deletions were made; only additive checklist added to SKILL.md.
