# Proposed upstream changes — `github/awesome-copilot/prd`

## Summary

No changes are proposed to the upstream `prd/SKILL.md`.

## Evidence

Baseline eval (3 models × 2 cases × 3 trials = 18 total, 12 valid):

| Case | Model | Rule-coverage |
|---|---|---|
| write-prd-ai-search | gpt-5-mini | 1.00 (3/3 trials, 7/7 checks) |
| write-prd-ai-search | gemini-2.5-pro | 1.00 (3/3 trials, 7/7 checks) |
| write-prd-api-gateway | gpt-5-mini | 1.00 (3/3 trials, 7/7 checks) |
| write-prd-api-gateway | gemini-2.5-pro | 1.00 (3/3 trials, 7/7 checks) |

**Overall rule-coverage: 1.00** — exceeds the 0.95 success threshold.

The `claude-sonnet-4-6` model (6 trials) failed with network errors due to an
invalid OpenRouter model ID; these trials are excluded from coverage calculation.

## Why no changes

The skill's mandatory PRD structure (Executive Summary, User Experience,
AI Requirements, Technical Specs, Risks & Roadmap) is clear and complete.
Models consistently produce all required structural elements. No modifications
to the skill are needed for these eval cases.

## How to apply

No upstream diff to apply. `before-SKILL.md` and `after-SKILL.md` are identical.
