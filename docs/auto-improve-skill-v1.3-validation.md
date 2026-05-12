# v1.3 validation — deferred to operator

**Date:** 2026-05-12
**Status:** implementation complete, end-to-end orchestrator dispatch
deferred to operator's next session.

## What's already validated (in this implementation session)

The smoke check at `skills/auto-improve-orchestrator/.smoke-check.mjs`
passes 36/36 structural checks:

- `SKILL.md` frontmatter parses (gray-matter); `name` and `description` present
- All 4 prompt files exist in `prompts/` (orchestrator + 3 sub-subagents)
- All required template variables present in each prompt
- `references/workflow.md`, `references/lessons.md`, `references/contexts/` exist
- Old wrapper files (`tools/auto-improve-skill.mjs`,
  `tools/auto-improve-skill-prompt.md`) are deleted
- Lessons + contexts at new paths (moved from `tools/`)

`workflow.md` has 14 section headings (Setup, Phase 0, Phase 3, 3.5,
4, 5, 6, Cost tracking, Return summary, Rules of engagement, plus
sub-sections).

The orchestrator prompt (`prompts/orchestrator.md`, 321 lines) embeds
the full algorithm with all 7 phases and dispatch instructions for
sub-subagents.

## What's deferred (operator-driven, ~30-60 min wall-clock)

End-to-end dispatch of the orchestrator subagent on the supabase
skill (re-run of #4 from the v1.2.1 PR-prep session). The supabase
workbench has been imported into this branch
(`examples/workbench/supabase-postgres-best-practices/`) and the
context file is at the new path. The operator can dispatch:

```
Agent({
  description: "auto-improve supabase-postgres-best-practices",
  subagent_type: "general-purpose",
  isolation: "worktree",
  run_in_background: true,
  prompt: <load skills/auto-improve-orchestrator/prompts/orchestrator.md,
           substitute:
             ${SLUG} = "supabase/agent-skills/supabase-postgres-best-practices"
             ${MAIN_REPO_PATH} = "/home/yuqing/Documents/Code/skill-optimizer"
             ${REFRESH_CONTEXT} = "false">
})
```

### Expected behavior

- **Phase 0:** finds existing context file at `skills/auto-improve-orchestrator/references/contexts/supabase-postgres-best-practices.md` — no re-research dispatched.
- **Phase 3:** no `.results/` exists (gitignored, didn't carry over from the v2 worktree). Runs fresh baseline. Cost: ~$3 (matching the v2 pilot's prior `$3.15` for 45 trials).
- **Phase 3.5:** computes per-case-min from the new baseline. Expect close to the v2 result (overall ~0.97, with `update-without-where` case at ~0.78). Per-case-min ≈ 0.78 — in `(0.50, 0.95)`, NO eval iteration; proceed to skill iteration.
- **Phase 4:** dispatches `skill-iterate` sub-subagent with target file `references/supabase-postgres-best-practices/references/monitor-two-pass-review.md` (from context). The sub-subagent applies a recipe (likely Recipe D — BAD/GOOD example for `update-without-where`), re-runs the suite (~$3 more), computes uplift on the weak case.
- **Phase 5/6:** packages + commits to `eval/auto-pilot/supabase-postgres-best-practices` branch with status `success` (if uplift ≥ +0.05 on the weak case) or `uplift-too-small` (otherwise). Total cost: ~$6.

### Acceptance criteria

After the orchestrator returns:

```bash
# A new branch exists
git branch | grep eval/auto-pilot/supabase-postgres-best-practices

# A commit on it
git log -1 eval/auto-pilot/supabase-postgres-best-practices --oneline

# analysis.md has a real status
git show eval/auto-pilot/supabase-postgres-best-practices:examples/workbench/supabase-postgres-best-practices/analysis.md | head -10
```

Expected: branch exists, commit message includes status, analysis
frontmatter has `status: success` or `status: uplift-too-small`
(NOT `pending` or `blocked-by-error`).

If validation passes, append to this file with the actual numbers.
If validation reveals a bug in the orchestrator, file an issue and
patch.

## Why deferred

The v1.3 implementation session this validates was already long
(brainstorm + spec + plan + 11 implementation tasks) and the operator
had several other background pilots in flight. Dispatching the
orchestrator end-to-end requires:

1. Switching the operator's main worktree to `feat/auto-improve-skill-v1.3` (so the dispatched orchestrator's auto-created worktree branches from a tip that has the v1.3 prompts), OR
2. Operator can fire from any worktree on the `feat/auto-improve-skill-v1.3` branch (this v1.3-impl worktree works).

The dispatch + ~30-60 min wait + post-run verification is best done as
a focused next session.
