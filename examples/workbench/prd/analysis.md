---
skill: github/awesome-copilot/prd
status: success
classification: document-producer
baseline_rule_coverage: 1.00
final_rule_coverage: 1.00
modifications_tried: 0
total_cost_usd: 0.42
---

# Auto-pilot run for `github/awesome-copilot/prd`

- Classified as **document-producer**: skill generates structured PRDs through Discovery → Analysis → Technical Drafting; eval shape is graders inspecting the produced markdown file.
- No remote WebFetch calls in skill; vendored references unchanged from upstream.
- Seeded 2 workspace briefs (AI-powered search feature, API gateway); each grader checks 7 structural requirements (exec summary, KPIs with numeric targets, personas/stories, acceptance criteria, non-goals, domain-specific section, risk/roadmap).
- Baseline (12 valid trials across gpt-5-mini + gemini-2.5-pro × 2 cases × 3 trials): 1.00 rule-coverage — all 7 checks passed on every trial.
- claude-sonnet-4-6 (6 trials) returned "Network connection lost." — model ID is not valid on OpenRouter for this account; excluded from coverage.
- Baseline ≥ 0.95 → exit success with no skill modifications. Upstream skill is production-ready.
