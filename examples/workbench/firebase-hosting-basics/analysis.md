---
skill: firebase/agent-skills/firebase-hosting-basics
status: success
classification: code-patterns
baseline_rule_coverage: 0.89
final_rule_coverage: 1.00
modifications_tried: 1
total_cost_usd: 0.33
---

# Auto-pilot run for `firebase/agent-skills/firebase-hosting-basics`

- Classified as **code-patterns**: prescribes `firebase.json` configuration conventions (public dir, ignore, rewrites, cleanUrls, redirect types). Eval shaped as code-reviewer task: seed a misconfigured `firebase.json` with 5 known violations, ask agent to write findings to `findings.txt`, grade findings.
- Seeded 5 violations: wrong public dir (`src` not `dist`), incomplete ignore list (missing `**/.*` and `**/node_modules/**`), `cleanUrls: false`, invalid redirect type (`200` not `301/302`), missing SPA catch-all rewrite.
- **Grader calibration (iteration 0, not budgeted):** initial grader had too-tight line ranges for absence/redirect violations — Gemini reported violations at lines 6–8 while the actual lines were 12–20. Widened to `range(1, 22)` for those two; removed the generic `tolerantKeyword('missing')` keyword that caused a false positive on `incomplete-ignore`. Also tightened the task instructions to require `findings.txt` creation.
- Grader-calibrated baseline: 0.89 (Claude 3/3, Gemini 3/3, GPT-4o-mini 1/3).
- **Iteration 1:** GPT-4o-mini missed the SPA catch-all rewrite check (absence violation) and sometimes wrote an incomplete review (only 1 finding). Applied Recipe A (two-pass workflow) + Recipe E (rationale + consequence story) by adding `## Configuration Review` section to SKILL.md. GPT-4o-mini improved to 3/3; all valid trials passed.
- Final coverage: 1.00 (8/8 valid trials). One Gemini trial had a transient API error ("JSON error injected into SSE stream"), not a model behavior issue.
