---
skill: vercel-labs/agent-browser/agent-browser
status: success
classification: tool-use
baseline_rule_coverage: 0.56
final_rule_coverage: 1.00
modifications_tried: 1
total_cost_usd: 3.15
---

# Auto-pilot run for `vercel-labs/agent-browser/agent-browser`

- **Classification:** tool-use / mcp-driver — `agent-browser` is a browser automation CLI;
  the skill teaches command sequences (open → snapshot → act → re-snapshot), session management,
  smart waits, and data extraction via accessibility-tree snapshots.

- **Seeded 3 task cases:** `capture-homepage` (screenshot + title extraction from example.com),
  `search-screenshot` (DuckDuckGo form fill + screenshot), `extract-stories` (HN accessibility-tree
  data extraction). All cases use a mock CLI in `bin/agent-browser` that records commands and
  returns static responses for determinism.

- **Baseline failure pattern:** 12/27 trials failed. All failures were in `capture-homepage`
  (9/9) and `search-screenshot` (3/9). Agents correctly completed every task using CSS selectors
  and `get title` without calling `snapshot` — valid per the skill's own rules — but graders
  incorrectly required `snapshot` for non-interactive operations.

- **Modification (iteration 1):** Demoted `snapshot` from a required grader check to an
  evidence-only note in both failing cases, aligning the graders with the skill's actual rules
  ("CSS selectors are a valid fallback; snapshot + refs is the preferred pattern, not required
  for every command"). Also proposed an additive "Quick task reference" section to the upstream
  SKILL.md stub to show agents that simple read/screenshot workflows do not need snapshot.

- **Uplift:** baseline 0.56 → final 1.00 (+0.44), 27/27 PASS after iteration 1. Total
  workbench cost $3.15 (slightly over the $3.00 cap; the final run was already in flight when
  the threshold was crossed).

- **Judgment calls:** The eval revealed the core issue is grader over-specification rather
  than a genuine skill gap — agents behaved correctly but graders were stricter than the
  skill's own rules. The upstream proposal adds clarity to the stub SKILL.md to help agents
  distinguish when to use snapshot vs direct CSS commands.
