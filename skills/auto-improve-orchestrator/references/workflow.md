# auto-improve-orchestrator workflow

This is a human-readable description of the algorithm the orchestrator
subagent follows. The same logic is embedded in
`../prompts/orchestrator.md` (the AI-targeted prompt template).

## Inputs

- `${SLUG}`: `<owner>/<repo>/<skill-id>` (e.g. `supabase/agent-skills/supabase-postgres-best-practices`)
- `${REFRESH_CONTEXT}`: optional flag, default false. If true, force re-research even if cached context file exists.

## Setup

1. Parse `SLUG` into `OWNER`, `REPO`, `SKILL_ID`.
2. Verify the orchestrator is running in a git worktree (the `isolation: "worktree"` requirement).
3. Verify the skill's workbench exists at `examples/workbench/<SKILL_ID>/`. If not, exit `blocked-by-missing-workbench`.
4. Define paths:
   - `WORKBENCH = examples/workbench/<SKILL_ID>/`
   - `CONTEXT_FILE = skills/auto-improve-orchestrator/references/contexts/<OWNER>-<SKILL_ID>.md`
5. Verify `OPENROUTER_API_KEY` is set (source `.env` from the main repo if needed).

## Phase 0: Research

If `CONTEXT_FILE` exists AND not `REFRESH_CONTEXT`:

- Read `CONTEXT_FILE`. Use it.

Else:

- Dispatch sub-subagent `prompts/research-upstream.md` with input `${SLUG}`.
- Wait for completion. Verify `CONTEXT_FILE` was written.
- Read it.

Extract from `CONTEXT_FILE`:

- `target_file` (the file the skill-iterate subagent will edit)
- `packaging_dir` (where `proposed-upstream-changes/` subdir should go)
- `additive_only_constraint` and any other hard constraints

## Phase 3: Baseline measurement

Look for the most recent `.results/<ts>/suite-result.json` in `WORKBENCH`.

If found AND its case set matches current `suite.yml`:

- Read it (resume — skip baseline run).

Else:

- Run from `WORKBENCH`: `npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3`
- Wait for completion (long-running, ~30-60 min depending on suite size).
- Read the new `suite-result.json`.

Compute `per_case_min` from `suite-result.json`:

- Group `results[]` by `caseName`.
- Per-case mean = average of trial scores for that case (across all models and trials).
- `per_case_min = min(per-case means across all cases)`.

## Phase 3.5: Eval-readiness loop

```text
EVAL_ITER = 0
While per_case_min OUTSIDE (0.50, 0.95) AND EVAL_ITER < 3:
  If per_case_min >= 0.95:
    DIRECTION = "add-harder"
  Else if per_case_min < 0.50:
    Run grader-vs-skill check:
      - Read failed trials' findings.txt
      - If models DID find the violations but grader scored wrong:
        DIRECTION = "fix-graders"
      - Else: DIRECTION = "simplify"

  Dispatch sub-subagent prompts/eval-iterate.md with:
    SKILL_ID, latest suite-result path, DIRECTION
  Wait for completion. Verify it committed workbench changes.

  Re-run baseline measurement (Phase 3, no resume — case set changed).
  EVAL_ITER += 1
```

Exit conditions:

- Still `per_case_min >= 0.95` after 3 iterations: exit `skill-genuinely-good`.
- Still `per_case_min < 0.50` after 3 iterations: exit `blocked-by-skill-shape`.

## Phase 4: Skill iteration

```text
baseline_per_case_min = per_case_min
ITER = 0

While ITER < 2:
  ITER += 1
  Dispatch sub-subagent prompts/skill-iterate.md with:
    SKILL_ID, latest suite-result path, target_file from context, ITER
  Wait for completion. Verify it committed changes.

  Read the new suite-result.json from the latest .results/<ts>/.
  new_per_case_min = recompute

  If new_per_case_min - baseline_per_case_min >= 0.05:
    Success — break.
```

Exit if no iteration cleared +0.05: status `uplift-too-small`. Still package the changes (they're additive — the operator can decide whether to ship).

## Phase 5: Package

Compose `WORKBENCH/proposed-upstream-changes/<packaging_dir>/`:

- `before-<target_file_basename>` — original target file (read from upstream's vendored copy, before any v1.3 modifications)
- `after-<target_file_basename>` — current target file content
- `README.md` — description, evidence (per-case breakdown table), how to apply

Write `WORKBENCH/analysis.md`:

```markdown
---
skill: <SLUG>
status: success | uplift-too-small | skill-genuinely-good | blocked-by-skill-shape | blocked-by-error
classification: <from CONTEXT_FILE>
baseline_per_case_min: 0.NN
final_per_case_min: 0.NN
iterations: eval=N, skill=N
total_cost_usd: NN.NN
---

# Auto-pilot run for <SLUG>

[3-6 short bullets covering: classification, what the eval surfaced,
what was changed and why, uplift result, any judgment calls.]
```

## Phase 6: Commit

```bash
git checkout -b eval/auto-pilot/<SKILL_ID>
git add WORKBENCH/analysis.md
git add WORKBENCH/proposed-upstream-changes/  # if exists
git add WORKBENCH/.results/<latest>/suite-result.json
# Skill modifications were committed by the skill-iterate subagent already
git commit -m "eval(auto-pilot): <SKILL_ID> — status=<S>, baseline=<B>→<F>"
```

DO NOT `git push`.

## Cost tracking

The orchestrator tracks cumulative `metrics.cost.total` from each `run-suite` invocation.

- Soft warning at $5: print to stderr but continue.
- Hard stop at $10: write `analysis.md` immediately with `status: budget-exceeded` and exit.

Sub-subagent dispatches (research / eval-iterate / skill-iterate) use the operator's Claude Code session under their plan and have no marginal cost.

## Return summary

The orchestrator returns to the caller (operator's CC session):

- `branch`: `eval/auto-pilot/<SKILL_ID>`
- `commit`: `<SHA>`
- `status`: one of the exit statuses above
- `baseline_per_case_min` → `final_per_case_min`
- per-case breakdown table
- `proposed-upstream-changes/` path (if status is `success` or `uplift-too-small`)

## Rules of engagement

- NEVER ask the operator a question mid-run. Decide based on the algorithm.
- NEVER `git push` to a remote.
- NEVER modify files outside `WORKBENCH` or `references/contexts/` (the research subagent writes context files; the orchestrator never modifies them directly).
- Always commit before exiting (atomic with `analysis.md` write — write analysis, then commit, then exit).
- Cost guard: track cumulative cost from each `run-suite`'s `metrics.cost.total`.
