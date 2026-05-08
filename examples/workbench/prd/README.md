# PRD eval

Eval suite for
[`github/awesome-copilot/prd`](https://github.com/github/awesome-copilot) —
a skill that generates comprehensive, production-grade Product Requirements
Documents through a Discovery → Analysis → Technical Drafting workflow.

## Cases

### `write-prd-ai-search` — AI feature PRD completeness

Sample: `workspace/brief-ai-search.md`

| Check | Expected element | Rule |
|---|---|---|
| exec-summary | Executive Summary section present | Mandatory PRD Structure §1 |
| kpi-numeric | KPIs with numeric targets (%, ms, etc.) | Quality Standards — measurable requirements |
| user-personas | User personas or user types defined | Mandatory PRD Structure §2 (User Experience) |
| acceptance-criteria | Acceptance criteria for user stories | Mandatory PRD Structure §2 |
| non-goals | Non-goals or out-of-scope section | Mandatory PRD Structure §2 |
| ai-requirements | AI/ML Requirements section with eval strategy | Mandatory PRD Structure §3 |
| risk-roadmap | Risk analysis and/or phased roadmap | Mandatory PRD Structure §5 |

### `write-prd-api-gateway` — API gateway PRD completeness

Sample: `workspace/brief-api-gateway.md`

| Check | Expected element | Rule |
|---|---|---|
| exec-summary | Executive Summary section present | Mandatory PRD Structure §1 |
| kpi-numeric | KPIs with numeric targets (uptime %, latency ms) | Quality Standards — measurable requirements |
| security-privacy | Security/privacy requirements (SOC2, auth, PII) | Mandatory PRD Structure §4 (Technical Specs) |
| user-stories | User stories with acceptance criteria | Mandatory PRD Structure §2 |
| non-goals | Non-goals or out-of-scope section | Mandatory PRD Structure §2 |
| technical-specs | Technical architecture or integration specs | Mandatory PRD Structure §4 |
| risk-roadmap | Risk analysis and/or phased roadmap | Mandatory PRD Structure §5 |

## Vendored snapshot

The skill normally resides at
`https://github.com/github/awesome-copilot/skills/prd/SKILL.md`. For
deterministic eval we vendor it at `references/prd/SKILL.md`. The skill
contains no remote WebFetch calls so the diff vs upstream is zero.

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`
