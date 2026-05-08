---
skill: anthropics/skills/pdf
status: success
classification: document-producer
baseline_rule_coverage: 1.00
final_rule_coverage: 1.00
modifications_tried: 0
total_cost_usd: 0.00
---

# Auto-pilot run for `anthropics/skills/pdf`

- Skill classified as **document-producer**: guides agents to read/extract
  PDFs, create PDFs with reportlab, and split/merge/rotate with pypdf.
- REFERENCE.md and FORMS.md referenced in upstream SKILL.md are 404 —
  skill is self-contained; vendored copy is essentially identical.
- Cases seeded from demo-snapshot: extract-pdf-facts, split-customer-packet,
  build-briefing-pdf, no-pdf-skill-needed.
- Input PDFs generated via `node _pdf.mjs write-inputs` in setup (no
  binary files committed).
- Baseline: 36/36 trials passed (4 cases × 3 models × 3 trials, pass
  rate = 1.00). Skill already guides all models to correct behavior.
- No modifications needed; phase 4 skipped per ≥0.95 exit condition.
- No upstream changes proposed; before/after SKILL.md are identical.
