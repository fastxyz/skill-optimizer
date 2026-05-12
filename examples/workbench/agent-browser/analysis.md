---
skill: vercel-labs/agent-browser/agent-browser
status: success
classification: tool-use
baseline_rule_coverage: 0.97
final_rule_coverage: 0.97
modifications_tried: 0
total_cost_usd: 0.73
---

# Auto-pilot run for `vercel-labs/agent-browser/agent-browser`

- Classified as **tool-use / mcp-driver**: SKILL.md is a discovery stub that directs the agent to run `agent-browser skills get core` to load the actual workflow content; the skill's value is steering agents toward the `agent-browser` CLI instead of curl/playwright fallbacks.
- Eval shape: two cases (`navigate-and-report`, `screenshot-capture`) with a fake `bin/agent-browser` CLI that logs all invocations to `/work/ab-calls.log`; vendored core skill at `references/agent-browser/agent-browser-core.md` (SKILL.md modified to `cat` the local file instead of calling the CLI).
- Grader calibration: initial grader only checked `ab-calls.log` for `skills get core`; fixed to also accept `cat agent-browser-core.md` in trace.jsonl (Gemini was correctly reading the vendored file via `cat` but was being marked as V2-failing).
- Baseline 0.97 (97/100 behavioral checks passed across 3 models × 3 trials × 2 cases) — above the 0.95 threshold; no skill modifications needed.
- The 3 missed checks were all in a single gemini trial that loaded the core skill but then used `curl` for HTTP fetching instead of `agent-browser navigate` (reaches-for-fallback pattern, Recipe B). Minor additive Pre-flight section proposed upstream.
- Proposed upstream change: add 5-line `## Pre-flight` section discouraging curl/wget fallback; see `proposed-upstream-changes/`.
