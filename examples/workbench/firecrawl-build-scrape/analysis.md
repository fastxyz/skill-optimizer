---
skill: firecrawl/skills/firecrawl-build-scrape
status: uplift-too-small
classification: code-patterns
baseline_rule_coverage: 0.84
final_rule_coverage: 0.89
modifications_tried: 2
total_cost_usd: 0.17
---

# Auto-pilot run for `firecrawl/skills/firecrawl-build-scrape`

- Classified as **code-patterns**: the skill prescribes how to integrate Firecrawl `/scrape` — markdown default, `onlyMainContent` for articles, no unnecessary `waitFor`, escalate to search when URL is unknown, keep contracts narrow.
- Seeded `ScrapeService.ts` with 5 violations: missing `onlyMainContent` in article scraper (absence), wrong `html` format (presence), unnecessary `waitFor` (presence), query-not-URL escalation (escalation), too-many-formats (design). Each maps directly to an explicit skill rule.
- Baseline: 38/45 = 0.844 — V1 (missing onlyMainContent) was the highest-miss rule (44%), V4 (escalation) at 22%.
- Iteration 1: Added per-pattern integration checklist (Recipe C) and BAD/GOOD escalation example (Recipe E). Improved sonnet fully; gemini already perfect. gpt-4o-mini unchanged. 39/45 = 0.867 (+0.022).
- Iteration 2: Added BAD/GOOD code example for V1 (missing onlyMainContent) directly in the checklist. Marginal improvement for gpt-4o-mini. 40/45 = 0.889 (+0.044 from baseline — below +0.05 threshold).
- gpt-4o-mini consistently emits only 3–4 findings instead of 5, skipping scrapeArticle. Remaining gap is model-capability, not skill-wording — modifications are additive and benefit sonnet/gemini fully.
