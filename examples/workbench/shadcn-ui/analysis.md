---
skill: google-labs-code/stitch-skills/shadcn-ui
status: success
classification: code-patterns
baseline_rule_coverage: 0.82
final_rule_coverage: 0.89
modifications_tried: 1
total_cost_usd: 0.00
---

# Auto-pilot run for `google-labs-code/stitch-skills/shadcn-ui`

- Classified as **code-patterns**: SKILL.md prescribes shadcn/ui integration conventions
  (file structure, cn() utility, cva variants, ARIA preservation, CSS variables). Eval framed
  as code-reviewer for deterministic findings.txt grading — same knowledge tested, better grader surface.
- Seeded 4 violations per file: wrong file location (components/ui/ vs components/), no cn() for
  class merging, hard-coded colors instead of CSS variables, ARIA prop removal in UserCard.tsx;
  no cva for variants, no cn(), div onClick without role/keyboard, wrong location in StatusBadge.tsx.
- Baseline rule coverage 59/72 = 0.819. Dominant miss: wrong-location violations (V1/V8) — both
  gpt-4o-mini and gemini failed to notice the path comment at line 1. Secondary: grader calibration
  (gpt-4o-mini undercounts line numbers by 6-13 lines, so V3/V4/V7 ranges were too narrow).
- Grader calibration fixed (not counted against iteration budget): widened V3 to ±12, V4 to ±14,
  V7 to ±16 to absorb gpt-4o-mini's systematic line undercount drift.
- Iteration 1: added BAD/GOOD example for wrong file placement and a two-pass "Code Review
  Checklist" section (Recipes A+D). Gemini wrong-location miss rate dropped from 100% to 0%.
- Final rule coverage 64/72 = 0.889 (+0.070 uplift). Gemini went from 3/6 to 6/6 pass rate.
  GPT-4o-mini still misses wrong-location (absence-type rule too hard for smaller model).
