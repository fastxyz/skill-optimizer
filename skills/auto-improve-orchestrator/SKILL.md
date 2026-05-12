---
name: auto-improve-orchestrator
description: Use when an operator wants to auto-improve a public agent skill — research upstream conventions, iterate the eval if it's saturated/floored, iterate the skill itself, and package proposed upstream changes. Dispatch the orchestrator subagent via the Agent tool with isolation:"worktree" for one or more skills (parallel-safe).
---

# auto-improve-orchestrator

This skill manages the end-to-end auto-improvement workflow for one public
agent skill: research the upstream repo's conventions, measure baseline
on an existing eval workbench, iterate the eval if it's saturated/floored,
iterate the skill content with measured uplift, and package the proposed
upstream change.

The skill-optimizer stays lean — it ships the eval engine (`run-suite`,
`run-case`, graders, Docker harness). This orchestrator skill contains
the *workflow* logic that uses the engine.

## When to use

- Operator says "auto-improve <slug>" or "improve <skill-id>"
- Operator says "run auto-improve on these N skills" (batch)
- Operator wants to extend the orchestration logic itself

## How to invoke

The operator's CC session dispatches the orchestrator subagent via the
Agent tool. For a single skill:

```
Agent({
  description: "auto-improve <skill-id>",
  subagent_type: "general-purpose",
  isolation: "worktree",
  run_in_background: true,
  prompt: <load skills/auto-improve-orchestrator/prompts/orchestrator.md,
           substitute ${SLUG}>
})
```

The orchestrator also accepts an optional `${REFRESH_CONTEXT}` template variable. Set to `"true"` (default `"false"`) to force the research sub-subagent to re-fetch upstream conventions even if a cached context file exists. Use when upstream conventions have changed (e.g., new sanity-test rules, new prefix taxonomy).

For a batch of N skills, dispatch N Agent calls in a single message —
they run in parallel, each in its own worktree.

The orchestrator subagent:

1. Reads/dispatches research subagent (Phase 0) → produces context file
2. Measures baseline via `run-suite` (Phase 3) — resume-aware
3. Iterates eval via dispatch (Phase 3.5) until baseline ∈ (0.50, 0.95)
4. Iterates skill via dispatch (Phase 4) until uplift ≥ +0.05 or 2 iters
5. Packages `proposed-upstream-changes/` + `analysis.md`, commits to
   `eval/auto-pilot/<skill-id>` branch, returns summary

## Sub-subagent prompts

- `prompts/research-upstream.md` — Phase 0 research subagent template
- `prompts/eval-iterate.md` — Phase 3.5 eval-iteration subagent template
- `prompts/skill-iterate.md` — Phase 4 skill-iteration subagent template

## Reference material

- `references/workflow.md` — human-readable description of the algorithm
- `references/lessons.md` — recipes A-E + grader patterns G1-G6 (the
  skill-iterate subagent reads this)
- `references/contexts/` — per-skill upstream-research outputs (the
  skill-iterate subagent reads these; the research subagent writes them)

## Pre-conditions

- The skill's eval workbench must already exist at
  `examples/workbench/<skill-id>/`. Building initial workbenches is
  out of scope for v1.3 — operator builds them manually.
- `OPENROUTER_API_KEY` must be set in `.env` at the repo root.
- Worktree must be created via `isolation: "worktree"` for parallelism
  - isolation. Do NOT run the orchestrator subagent on the main
  worktree.

## Out of scope (deferred)

- Initial workbench construction (v1.4)
- Autonomous CI mode (no operator session)
- Automatic PR submission (operator-driven)

See `docs/auto-improve-skill-v1.3-spec.md` for the full design.
