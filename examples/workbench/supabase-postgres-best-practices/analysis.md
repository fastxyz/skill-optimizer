---
skill: supabase/agent-skills/supabase-postgres-best-practices
status: success
classification: code-reviewer
baseline_rule_coverage: 0.97
final_rule_coverage: 0.97
modifications_tried: 0
total_cost_usd: 3.15
---

# Auto-pilot run for `supabase/agent-skills/supabase-postgres-best-practices`

- **Classification**: `code-reviewer` — skill prescribes SQL patterns (incorrect vs. correct) across 8 rule categories; eval seeds SQL files with known violations and grades agent findings.
- **Seeded violations**: 5-case suite (16 total violations) — `schema.sql` (5 violations), `rls_policies.sql` (4), `multi_table_schema.sql` (3 absence-class: missing ENABLE RLS, missing FORCE RLS), `migrations.sql` (3 absence-class: FK columns without supporting index), `data_migration.sql` (1 absence-class: UPDATE without WHERE). Cases 3-5 are specifically designed to stress absence-type rules (5-10× harder than presence rules).
- **Baseline**: 140/144 violations identified across 45 trials (97.2% rule coverage). Per-case breakdown: `review-schema` 100%, `review-rls` 97.2%, `review-multi-table-rls` 100%, `review-fk-index-audit` 96.3%, `review-update-without-where` 77.8% (2 missed trials from gpt-5-mini + gemini on the single-violation case). Overall coverage ≥ 0.95 → Phase 3 exit condition met.
- **Modification**: Phase 4 iteration loop skipped (baseline ≥ 0.95). Per upstream constraints, the additive reference `monitor-two-pass-review.md` was created in v1 to teach the two-pass SQL review pattern that addresses the root cause of absence-class violations. No new edits were needed.
- **Upstream packaging**: New reference `skills/supabase-postgres-best-practices/references/monitor-two-pass-review.md` proposed as an additive PR. SKILL.md, `_sections.md`, `_template.md`, `_contributing.md`, `release-please-config.json`, and `package.json` are all UNCHANGED. `metadata.version` remains "1.1.1".
- **Judgment calls**: The v2 suite adds three harder absence-type cases that saturate at 97.2% with the existing `monitor-two-pass-review.md` reference already in the vendored snapshot. The update-without-where case (77.8%) is the weakest; 2 of 9 trials miss the single violation. This is above the 0.50 blocking threshold and matches the expected hard-case behavior for absence-type rules. The proposed reference directly targets this failure pattern.

---

## v2 — `eval/auto-pilot/supabase-postgres-best-practices-v2`

Extends the original 2-case suite (review-schema, review-rls) with 3 harder absence-type cases
from `eval/supabase-deeper-v1`:

- **`review-multi-table-rls`** (`workspace/multi_table_schema.sql`, 6 tables, 3 violations) — mixed
  user-data and reference-table schema. 2 user-data tables silently lack `ENABLE ROW LEVEL SECURITY`;
  1 has `ENABLE` but no `FORCE`. All 3 models pass 9/9 trials at 100%.
- **`review-fk-index-audit`** (`workspace/migrations.sql`, 7 FKs, 3 missing indexes) — forces the
  model to track which FK columns have a supporting index across the full file. All 3 models pass
  8/9 trials (96.3%). Gemini missed 1 trial.
- **`review-update-without-where`** (`workspace/data_migration.sql`, 6 DML statements, 1 dangerous
  UPDATE) — single-violation case testing the hardest absence class. 7/9 trials pass (77.8%). The
  `monitor-two-pass-review.md` reference is the targeted upstream fix for this failure mode.

**Baseline**: 97.2% overall rule coverage. **Final**: 97.2% (no iteration needed).
**Total model cost**: $3.15 USD across 45 trials.
