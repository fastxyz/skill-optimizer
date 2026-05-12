# auto-improve-orchestrator v1.3 — design spec

**Status:** approved (brainstormed 2026-05-12)
**Replaces:** the v1.2.1 wrapper (`tools/auto-improve-skill.mjs`) and its
embedded 5-phase prompt template.
**Empirical basis:** four pilots run in the v1.2.1 PR-prep session
(web-design-guidelines, agent-browser, supabase v1+v2). The lessons
distilled from those pilots are documented in `docs/auto-improve-skill-v1.3-design.md`
(the design draft preceding this spec).

## Goal

Convert the auto-improve-skill workflow from a wrapper-spawned `claude -p`
autonomous pilot into a Claude Code skill (`auto-improve-orchestrator`)
that an operator's CC session invokes via the Agent tool. Each
orchestrator subagent owns one skill end-to-end, runs in its own
worktree, and dispatches sub-subagents for research / eval-iteration /
skill-iteration tasks. Multiple orchestrators can run in parallel for
batch operation.

The orchestrator subagent layer captures the operator's workflow logic
(when to research, when to iterate eval, when to iterate skill, when
to package). The skill-optimizer itself stays lean — it ships the
eval engine (`run-suite`, `run-case`, graders, Docker harness) and
nothing else.

## Motivation

Two structural lessons from v1.2.1 motivate this design (full evidence
in `docs/auto-improve-skill-v1.3-design.md`):

1. **Research-first context is mandatory.** The auto-pilot is good at
   finding what to change but bad at fitting upstream conventions
   (frontmatter schemas, file-location norms, prefix taxonomies).
   Without an upstream-research-derived context file, output requires
   manual reformulation before submission.
2. **Two-loop iteration on eval AND skill.** v1.2.1 only iterates the
   skill (Phase 4). When baseline saturates at the ceiling (≥0.95) or
   floors (<0.50), the optimizer can't escape — we manually built
   harder/simpler eval suites via subagent dispatches twice this
   session.

Plus two implementation-detail bugs found during v1.2.1 work:

1. **Per-case-minimum threshold.** The auto-pilot's `baseline ≥ 0.95
   → exit success` logic uses the OVERALL average, masking weak cases.
   Supabase v2 had `update-without-where` at 77.8% but exited because
   overall was 0.97.
2. **Resume-on-timeout.** When the wrapper's 90-min hard cap killed
   the agent-browser pilot mid-baseline (50/54 trials done), 30+ min
   of model work was discarded because nothing knew to pick up where
   it left off.

In v1.3's orchestrated architecture, all four are addressed naturally:
research becomes a sub-subagent, eval-iteration becomes a sub-subagent,
per-case-min is computed by the orchestrator from `suite-result.json`,
and resume-on-timeout falls out for free because every phase's
artifacts are persistent on disk and the orchestrator is resume-aware.

## Architecture overview

**Skill-optimizer (the tool) ships:**

- `src/cli.ts`, `src/workbench/` — the eval engine (`run-suite`,
  `run-case`, Docker harness, graders, `suite-result.json` aggregation)
- `examples/workbench/` — example evals
- `skills/skill-optimizer/SKILL.md` — the existing canonical skill
- `skills/auto-improve-orchestrator/` — **NEW** Claude Code skill
  (the v1.3 deliverable)
- `docker/`, plugin manifests — unchanged

**Skill-optimizer no longer ships:**

- `tools/auto-improve-skill.mjs` — DELETED
- `tools/auto-improve-skill-prompt.md` — DELETED

**Skill-optimizer file moves:**

- `tools/auto-improve-skill-lessons.md` → `skills/auto-improve-orchestrator/references/lessons.md`
- `tools/auto-improve-contexts/` → `skills/auto-improve-orchestrator/references/contexts/`

**The new skill `skills/auto-improve-orchestrator/`:**

```text
skills/auto-improve-orchestrator/
  SKILL.md                      # discovery + invocation guide
  prompts/
    orchestrator.md             # orchestrator subagent prompt template
                                # (operator dispatches this via Agent tool)
    research-upstream.md        # sub-subagent prompt template (Phase 0)
    eval-iterate.md             # sub-subagent prompt template (Phase 3.5)
    skill-iterate.md            # sub-subagent prompt template (Phase 4)
  references/
    workflow.md                 # human-readable doc of the orchestration algorithm
    lessons.md                  # recipes A-E + grader patterns G1-G6
                                # (read by skill-iterate sub-subagent)
    contexts/                   # per-skill context library
      vercel-web-interface-guidelines.md
      vercel-agent-browser.md
      supabase-postgres-best-practices.md
      <future skills>...
```

## Invocation flow

```text
Operator (in their CC session):
  "auto-improve supabase/agent-skills/supabase-postgres-best-practices"
   (or for batch: "auto-improve all 10 skills from the top-N list")

My CC session:
  Read skills/auto-improve-orchestrator/SKILL.md to confirm invocation pattern.
  For each skill in the request, dispatch one Agent call:
    Agent({
      description: "auto-improve <skill-id>",
      subagent_type: "general-purpose",
      isolation: "worktree",   # auto-creates per-orchestrator worktree
      run_in_background: true,
      prompt: <load prompts/orchestrator.md, substitute ${SLUG}>
    })
  All N dispatches happen in a single message → parallel execution.

Each orchestrator subagent:
  1. Owns its own worktree (isolation: "worktree")
  2. Owns its own skill end-to-end
  3. Follows the algorithm in its loaded prompt (workflow.md mirror)
  4. Dispatches its own sub-subagents for research / eval / skill iteration
  5. Commits to its own branch (eval/auto-pilot/<skill-id>)
  6. Returns final summary report

My CC session:
  Receives N completion notifications (async).
  Reports each result to operator with branch name + summary.
```

## Sub-subagent designs

### `prompts/research-upstream.md`

- **Inputs (templated):** `${SLUG}` (`<owner>/<repo>/<skill-id>`)
- **Tools:** Bash (gh CLI), WebFetch, Read, Write, Glob
- **What it does:**
  - Reads CONTRIBUTING.md, AGENTS.md, .github/workflows/*.yml, CODEOWNERS
  - Reads skill-specific convention files (`_contributing.md`,
    `_template.md`, `_sections.md` if present)
  - Reads sanity-test source code (don't trust prior assumptions about
    what CI validates)
  - Samples last 10 merged PRs to the target skill (or repo) for shape
  - Samples last 5 closed-without-merge PRs for rejection signals
  - Identifies other consumers (gh search for raw URL refs, install
    scripts, repo's own README for distribution channels)
- **Output:** Writes
  `skills/auto-improve-orchestrator/references/contexts/<owner>-<skill>.md`
  with verbatim-pastable context block. Returns under-400-word report
  covering: target file, risk profile, frontmatter spec, content shape
  template, pre-submit checklist.
- **Commit:** `docs(contexts): research upstream for <slug>` on the
  orchestrator's worktree branch.

### `prompts/eval-iterate.md`

- **Inputs (templated):** `${SKILL_ID}`, `${SUITE_RESULT_PATH}`,
  `${DIRECTION}` ∈ {`add-harder`, `simplify`, `fix-graders`}
- **Tools:** Read, Edit, Write, Bash, Glob
- **What it does:**
  - `add-harder`: writes 2–3 new workspace files seeded with
    absence-type violations the existing graders don't catch; writes
    corresponding graders; updates `suite.yml`; runs smoke check
  - `simplify`: removes ambiguous violations from existing workspace
    files; tightens task descriptions; runs smoke check
  - `fix-graders`: applies recipes G1–G6 from `references/lessons.md`
    to grader files (line-tolerance, fuzzy keywords); runs smoke check
- **Output:** modified workbench files + smoke-check verification.
  Returns under-300-word report: cases added/changed, predicted
  baseline impact, blockers.
- **Commit:** `feat(eval): <direction> for <skill_id> (cases: <names>)`
  on the orchestrator's worktree branch.

### `prompts/skill-iterate.md`

- **Inputs (templated):** `${SKILL_ID}`, `${SUITE_RESULT_PATH}`,
  `${TARGET_FILE}` (from context's "optimization target" directive),
  `${ITERATION}` (1 or 2)
- **Tools:** Read, Edit, Bash, Glob
- **What it does:**
  - Diagnoses missed rules from `suite-result.json` (per-case, per-rule)
  - Reads `references/lessons.md` and
    `references/contexts/<owner>-<skill>.md`
  - Applies one recipe (A/B/C/D/E) to the target file — additive only
  - Runs `npx tsx src/cli.ts run-suite ./suite.yml --trials 3` to
    re-measure
  - Computes uplift using **per-case-minimum**, not overall mean
- **Output:** modified target file + new `.results/<ts>/` dir. Returns
  under-300-word report: which recipe applied, diff summary, baseline
  → final per-case-min, success/uplift-too-small verdict.
- **Commit:** `feat(<skill_id>): iterate <iteration> — <recipe>` on the
  orchestrator's worktree branch.

## Orchestrator algorithm (`prompts/orchestrator.md`)

The orchestrator subagent's prompt embeds this algorithm. Resume-aware
at every phase.

```text
ORCHESTRATOR(slug, options):

  ────── Setup ──────
  Parse SLUG = <owner>/<repo>/<skill-id>
  workbench_dir = examples/workbench/<skill-id>/
  context_file = skills/auto-improve-orchestrator/references/contexts/<owner>-<skill>.md

  Assert workbench_dir exists.
    (v1.3 scope: initial workbench is operator-built; orchestrator
     only iterates existing ones. workbench-build sub-subagent is
     out of scope — see "Out of scope" below.)

  ────── Phase 0: Research ──────
  IF context_file exists AND not --refresh-context:
    use it
  ELSE:
    dispatch prompts/research-upstream.md with SLUG
      → writes context_file, commits
  Read context_file. Extract: target_file, packaging_dir,
  additive_only_constraint.

  ────── Phase 3: Baseline ──────
  latest_results = most recent .results/<ts>/suite-result.json in
                   workbench_dir
  IF latest_results exists AND its case set matches current suite.yml:
    read it (resume — no re-run needed)
  ELSE:
    run `npx tsx src/cli.ts run-suite ./suite.yml --trials 3`
    read the new suite-result.json

  ────── Phase 3.5: Eval-readiness loop ──────
  per_case_min = min(per-case mean scores in suite-result.json results[])
  eval_iter = 0

  WHILE per_case_min OUTSIDE (0.50, 0.95) AND eval_iter < 3:
    IF per_case_min >= 0.95:
      direction = "add-harder"
    ELSE IF per_case_min < 0.50:
      direction = "fix-graders" if grader-vs-skill check shows grader bug
                  else "simplify"
    dispatch prompts/eval-iterate.md with (SKILL_ID, suite-result path,
                                           direction)
      → modifies workbench (new cases or grader fixes), commits
    re-run `run-suite`, read new suite-result.json
    per_case_min = recompute
    eval_iter += 1

  IF per_case_min still >= 0.95 after 3 iterations:
    exit "skill-genuinely-good" — no PR proposed
  IF per_case_min still < 0.50 after 3 iterations:
    exit "blocked-by-skill-shape"

  ────── Phase 4: Skill iteration ──────
  baseline_per_case_min = per_case_min
  iter = 0

  WHILE iter < 2:
    iter += 1
    dispatch prompts/skill-iterate.md with (SKILL_ID, suite-result path,
                                            target_file from context,
                                            iter)
      → applies one recipe (A-E) additively to target_file, re-runs
        suite, commits if uplift, returns report with new per-case-min
    new_per_case_min = read new suite-result.json
    IF new_per_case_min - baseline_per_case_min >= 0.05:
      success — break

  IF no iteration cleared +0.05:
    exit "uplift-too-small"

  ────── Phase 5: Package ──────
  Compose workbench_dir/proposed-upstream-changes/<packaging_dir>/
    - before-<target_file_basename>
    - after-<target_file_basename>
    - README.md (description + evidence + per-case breakdown)
  Write workbench_dir/analysis.md with full report
  Commit on a branch eval/auto-pilot/<skill-id>

  ────── Done ──────
  Return summary to caller (my CC session): branch name, commit SHA,
  baseline → final per-case-min, per-case breakdown, draft PR location,
  exit status.
```

## Parallelism guarantees

| Concern | Mitigation |
|---|---|
| File conflicts | Each orchestrator gets own worktree (`isolation: "worktree"`) |
| Git ref races | Different branches per skill (`eval/auto-pilot/<skill-id>`); ref updates atomic |
| OpenRouter rate limits | Each `run-suite` may queue; observable but not a correctness issue |
| Docker resource pressure | Each `run-suite` spawns containers; OS handles; soft cap recommendation: max 5 concurrent orchestrators if running on a typical dev machine |
| `lessons.md` updates from siblings | Each writes to its OWN worktree's lessons.md; operator merges manually post-batch (or skip lessons-update if running in parallel mode) |
| Context-file conflicts | Different skill = different context file; no conflict |

## Cost model

- Sub-subagent dispatches (research / eval-iterate / skill-iterate)
  use the operator's Claude Code session under their plan (Opus Max,
  zero marginal cost).
- `run-suite` calls use OpenRouter for the trial models — paid.
- Per-orchestrator soft warning at $5 cumulative `metrics.cost.total`,
  hard stop at $10. Orchestrator tracks the running total across all
  `run-suite` invocations in its lifecycle.
- Batch of N orchestrators: total OpenRouter cost ≤ N × $10. Operator
  visibility via per-orchestrator summary reports.

## Cleanup of v1.2.1 artifacts

**Files to delete (with `git rm`):**

- `tools/auto-improve-skill.mjs`
- `tools/auto-improve-skill-prompt.md`

**Files to move (with `git mv`):**

- `tools/auto-improve-skill-lessons.md` →
  `skills/auto-improve-orchestrator/references/lessons.md`
- `tools/auto-improve-contexts/` (entire dir) →
  `skills/auto-improve-orchestrator/references/contexts/`

**Files to update:**

- `CLAUDE.md` — remove references to the old wrapper, add a brief note
  pointing at `skills/auto-improve-orchestrator/SKILL.md` for the new
  workflow.

## Validation / acceptance criteria

For v1.3 to be considered done:

1. **Skill is discoverable.** `skills/auto-improve-orchestrator/SKILL.md`
   exists with valid frontmatter and is invocable via the Skill tool.
2. **Sub-subagent prompts are self-contained.** Each prompt template
   in `prompts/` runs cleanly when dispatched via Agent tool with the
   templated inputs substituted.
3. **End-to-end test on a real skill.** Re-run #4 supabase
   (`supabase/agent-skills/supabase-postgres-best-practices`) using
   the new orchestrator. Expected outcome:
   - Phase 0 finds existing context file (already on disk from v1.2.1
     work) — no re-research
   - Phase 3 reads existing `.results/` from `supabase-pilot-v2`
     worktree's recent baseline — no re-run (resume)
   - Phase 3.5 detects per-case-min at 0.778 (the
     `update-without-where` case), proceeds to skill iteration
   - Phase 4 dispatches skill-iterate sub-subagent which adds an
     additive Recipe-D BAD/GOOD example to the existing
     `monitor-two-pass-review.md` reference
   - Re-runs suite, computes uplift on the weak case
   - Packages + commits
4. **Cleanup is complete.** `tools/auto-improve-skill.mjs` and
   `tools/auto-improve-skill-prompt.md` are gone; lessons.md and
   contexts/ are at the new paths; CLAUDE.md updated.
5. **Documentation matches reality.** `docs/auto-improve-skill-v1.3-design.md`
   (the predecessor design doc) gets a note pointing at this spec.
   This spec is committed.

## Out of scope (deferred to v1.4 or later)

- **Workbench-build sub-subagent.** v1.3 assumes the workbench at
  `examples/workbench/<skill-id>/` already exists. Building initial
  workbenches from scratch (as the v1.2.1 wrapper's Phase 2 did) is
  deferred — the v1.2.1 work this session built four workbenches
  manually + via subagents and that's a reasonable starting library.
  When operators want to auto-pilot a NEW skill (not in
  `examples/workbench/`), they manually build the workbench first
  (or invoke a future `workbench-build.md` sub-subagent).
- **Autonomous batch wrapper.** No CI-style "fire 10 pilots from
  command line, walk away, come back to results" mode. The v1.3 model
  requires an operator's CC session to dispatch orchestrators. If a
  CI use case emerges, add a thin `tools/auto-improve-batch.mjs` later
  that just dispatches via the Agent SDK programmatically.
- **PR submission automation.** v1.3 stops at packaging
  (proposed-upstream-changes/ + analysis.md + commit). The fork-clone-
  push-create-PR step remains operator-driven per v1.2.1 convention.
- **Skill-classification-aware sub-subagent prompts.** All three
  sub-subagents use uniform prompts for all skill types. If empirical
  evidence shows skill-type branching is needed (e.g. tool-use evals
  need different "harder case" templates than code-reviewer evals),
  add classification branching in v1.4.

## Open questions (deferred but worth tracking)

1. **Lessons.md merge strategy** when multiple parallel orchestrators
   want to append run-record entries. v1.3: each writes to its own
   worktree; operator merges post-batch. v1.4 might want a structured
   append-only log.
2. **Cost ceiling escalation.** Should the orchestrator pause at $7.50
   and ping the operator for confirmation before continuing? v1.3:
   no, just hard-stop at $10 and exit.
3. **Sub-subagent retry on transient failures.** v1.3: if a
   sub-subagent fails (e.g., `gh` CLI unavailable, OpenRouter outage),
   the orchestrator surfaces the failure and exits. No automatic
   retry. v1.4 might add bounded retry.

## Provenance

- Predecessor design draft:
  [`docs/auto-improve-skill-v1.3-design.md`](../../auto-improve-skill-v1.3-design.md)
- Brainstorming session: 2026-05-12 (this spec is the output)
- Empirical basis: v1.2.1 PR-prep session (4 pilots) and the lessons
  doc at `tools/auto-improve-skill-lessons.md` (to be moved to
  `references/lessons.md`)
