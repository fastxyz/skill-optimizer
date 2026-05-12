# Orchestrator subagent: end-to-end auto-improve for one skill

You are dispatched as an autonomous orchestrator for a single public
agent skill: `${SLUG}`. You own this skill end-to-end. You make
decisions about when to research, when to iterate the eval, when to
iterate the skill, and when to package. You are running in your own
git worktree (created by `isolation: "worktree"`).

## Inputs (templated)

- `${SLUG}` — `<owner>/<repo>/<skill-id>`. Example: `supabase/agent-skills/supabase-postgres-best-practices`.
- `${MAIN_REPO_PATH}` — absolute path to the operator's main repo (your worktree's parent). Example: `/home/yuqing/Documents/Code/skill-optimizer`. Used for `.env` access.
- `${REFRESH_CONTEXT}` — optional flag, default `false`. If `true`, force re-research even if cached context file exists.

## Setup

1. Parse `${SLUG}` into `OWNER`, `REPO`, `SKILL_ID`:

   ```bash
   IFS=/ read -r OWNER REPO SKILL_ID <<< "${SLUG}"
   ```

2. Verify you're in a git worktree (not the main repo):

   ```bash
   GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
   GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
   if [ "$GIT_DIR" = "$GIT_COMMON" ]; then
     echo "ERROR: not running in a worktree. The orchestrator requires isolation:'worktree'." >&2
     exit 1
   fi
   ```

3. Verify the skill's workbench exists:

   ```bash
   WORKBENCH=examples/workbench/${SKILL_ID}/
   if [ ! -d "$WORKBENCH" ]; then
     # Write analysis.md with status:blocked-by-missing-workbench, then exit
     mkdir -p "$WORKBENCH"
     cat > "${WORKBENCH}analysis.md" <<EOF
   ---
   skill: ${SLUG}
   status: blocked-by-missing-workbench
   ---

   Initial workbench at examples/workbench/${SKILL_ID}/ does not exist.
   v1.3 only iterates existing workbenches; building initial workbenches
   is out of scope (deferred to v1.4).
   EOF
     # No commit needed since the workbench dir was just created
     exit 1
   fi
   ```

4. Define paths:

   ```bash
   CONTEXT_FILE=skills/auto-improve-orchestrator/references/contexts/${OWNER}-${SKILL_ID}.md
   LESSONS=skills/auto-improve-orchestrator/references/lessons.md
   ```

5. Source `.env` from the main repo (provides `OPENROUTER_API_KEY`):

   ```bash
   if [ -f "${MAIN_REPO_PATH}/.env" ]; then
     set -a; . "${MAIN_REPO_PATH}/.env"; set +a
   fi
   if [ -z "${OPENROUTER_API_KEY:-}" ]; then
     echo "ERROR: OPENROUTER_API_KEY not set" >&2
     # Write analysis.md with status:blocked-by-error and exit
     exit 1
   fi
   ```

6. Initialize cost tracker:

   ```bash
   CUMULATIVE_COST=0
   ```

## Phase 0: Research

```bash
if [ -f "$CONTEXT_FILE" ] && [ "${REFRESH_CONTEXT:-false}" != "true" ]; then
  echo "Phase 0: using cached context at $CONTEXT_FILE"
else
  echo "Phase 0: dispatching research-upstream subagent for ${SLUG}"
  # Dispatch via Agent tool (load skills/auto-improve-orchestrator/prompts/research-upstream.md,
  # substitute ${SLUG} and ${OUTPUT_PATH}=${CONTEXT_FILE}).
  # Wait for completion. Verify CONTEXT_FILE was written.
fi

# Read CONTEXT_FILE; extract: target_file, packaging_dir, additive_only_constraint
```

When dispatching the research subagent, use:

- `subagent_type: "general-purpose"`
- `description: "research <slug>"`
- (no `isolation`) — research subagent runs in YOUR worktree (writes the context file)
- `prompt`: load `skills/auto-improve-orchestrator/prompts/research-upstream.md` and substitute `${SLUG}` and `${OUTPUT_PATH}`

## Phase 3: Baseline measurement

Find the most recent `.results/<ts>/suite-result.json`:

```bash
LATEST_RESULTS=$(ls -td ${WORKBENCH}.results/*/ 2>/dev/null | head -1)
LATEST_SUITE_JSON=${LATEST_RESULTS}suite-result.json
```

If `LATEST_SUITE_JSON` exists AND its `cases` field matches the current `${WORKBENCH}suite.yml`'s case names:

- Read it (resume — skip baseline run).

Else:

```bash
cd ${WORKBENCH}
set -a; . ${MAIN_REPO_PATH}/.env; set +a
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3 \
  2>&1 | tee /tmp/orchestrator-baseline-${SKILL_ID}.log
cd -
LATEST_RESULTS=$(ls -td ${WORKBENCH}.results/*/ | head -1)
LATEST_SUITE_JSON=${LATEST_RESULTS}suite-result.json
```

Read `LATEST_SUITE_JSON` (use `node -e "console.log(JSON.parse(...))"` or `jq`).

Compute `per_case_min`:

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$LATEST_SUITE_JSON', 'utf-8'));
const byCase = {};
for (const r of data.results) {
  if (!byCase[r.caseName]) byCase[r.caseName] = [];
  byCase[r.caseName].push(r.meanScore);
}
const perCaseMeans = Object.entries(byCase).map(([c, scores]) => ({
  case: c,
  mean: scores.reduce((a, b) => a + b, 0) / scores.length,
}));
perCaseMeans.sort((a, b) => a.mean - b.mean);
console.log(JSON.stringify({
  perCaseMin: perCaseMeans[0].mean,
  perCaseMinName: perCaseMeans[0].case,
  perCaseBreakdown: perCaseMeans,
}, null, 2));
"
```

Track the cost:

```bash
COST_THIS_RUN=$(node -e "
const data = JSON.parse(require('fs').readFileSync('$LATEST_SUITE_JSON', 'utf-8'));
const sum = (data.metrics?.cost?.total) || 0;
console.log(sum);
")
CUMULATIVE_COST=$(node -e "console.log($CUMULATIVE_COST + $COST_THIS_RUN)")
if (( $(echo "$CUMULATIVE_COST > 10" | bc -l) )); then
  echo "ERROR: cumulative cost \$$CUMULATIVE_COST > \$10 hard cap" >&2
  # Write analysis.md status:budget-exceeded and exit
  exit 1
fi
if (( $(echo "$CUMULATIVE_COST > 5" | bc -l) )); then
  echo "WARN: cumulative cost \$$CUMULATIVE_COST > \$5 soft warning" >&2
fi
```

## Phase 3.5: Eval-readiness loop

```bash
EVAL_ITER=0
while [ "$EVAL_ITER" -lt 3 ]; do
  if (( $(echo "$PER_CASE_MIN >= 0.95" | bc -l) )); then
    DIRECTION="add-harder"
  elif (( $(echo "$PER_CASE_MIN < 0.50" | bc -l) )); then
    # Run grader-vs-skill check: read failed trials' findings.txt;
    # if models DID find the violations but grader scored wrong,
    # DIRECTION="fix-graders"; else "simplify".
    DIRECTION="..."
  else
    break  # in (0.50, 0.95) — proceed to skill iteration
  fi

  # Dispatch eval-iterate subagent (load prompts/eval-iterate.md, substitute vars)
  # Wait. Verify it committed.

  # Re-run baseline (no resume — case set changed)
  # Recompute PER_CASE_MIN
  EVAL_ITER=$((EVAL_ITER + 1))
done

# Exit conditions
if (( $(echo "$PER_CASE_MIN >= 0.95" | bc -l) )); then
  # Write analysis.md status:skill-genuinely-good and commit
  exit 0
fi
if (( $(echo "$PER_CASE_MIN < 0.50" | bc -l) )); then
  # Write analysis.md status:blocked-by-skill-shape and commit
  exit 0
fi
```

When dispatching eval-iterate, use:

- `subagent_type: "general-purpose"`
- `description: "eval-iterate ${DIRECTION} ${SKILL_ID}"`
- `prompt`: load `prompts/eval-iterate.md` and substitute `${SKILL_ID}`, `${WORKBENCH_DIR}`, `${SUITE_RESULT_PATH}`, `${DIRECTION}`, `${LESSONS_PATH}`

## Phase 4: Skill iteration

```bash
BASELINE_PER_CASE_MIN=$PER_CASE_MIN
ITER=0
SUCCESS=false

while [ "$ITER" -lt 2 ]; do
  ITER=$((ITER + 1))

  # Dispatch skill-iterate subagent
  # Wait. Verify it committed.

  # Find the new latest .results/<ts>/suite-result.json
  # Recompute NEW_PER_CASE_MIN

  UPLIFT=$(node -e "console.log($NEW_PER_CASE_MIN - $BASELINE_PER_CASE_MIN)")
  if (( $(echo "$UPLIFT >= 0.05" | bc -l) )); then
    SUCCESS=true
    break
  fi

  # Track cost again — re-run-suite happened
  # If cost > 10, exit budget-exceeded
done
```

When dispatching skill-iterate:

- `subagent_type: "general-purpose"`
- `description: "skill-iterate ${ITER} ${SKILL_ID}"`
- `prompt`: load `prompts/skill-iterate.md` and substitute all 7 inputs

## Phase 5: Package

If `SUCCESS=true` or `uplift-too-small` (the additive change is still
worth packaging):

```bash
# Read CONTEXT_FILE for packaging_dir
PACKAGING_DIR="${WORKBENCH}proposed-upstream-changes/${PACKAGING_DIR_FROM_CONTEXT}"
mkdir -p "$PACKAGING_DIR"

# Read the original target file (before any v1.3 mods).
# This is the version on the FIRST commit on this orchestrator's branch.
git show HEAD~${ITER}:${TARGET_FILE} > "${PACKAGING_DIR}/before-$(basename ${TARGET_FILE})"

# Current target file is the after version
cp "${TARGET_FILE}" "${PACKAGING_DIR}/after-$(basename ${TARGET_FILE})"

# Write a packaging README
cat > "${PACKAGING_DIR}/README.md" <<EOF
# Proposed upstream change for ${SLUG}

[summary, evidence per-case breakdown, how to apply]
EOF
```

Write `${WORKBENCH}analysis.md`:

```markdown
---
skill: ${SLUG}
status: success | uplift-too-small | skill-genuinely-good | blocked-by-skill-shape | blocked-by-error
classification: <from CONTEXT_FILE>
baseline_per_case_min: 0.NN
final_per_case_min: 0.NN
iterations: eval=N, skill=N
total_cost_usd: NN.NN
---

# Auto-pilot run for ${SLUG}

[3-6 short bullets covering: what was done, why, evidence, judgment calls]
```

## Phase 6: Final commit

```bash
git checkout -b eval/auto-pilot/${SKILL_ID} 2>/dev/null || git checkout eval/auto-pilot/${SKILL_ID}
git add ${WORKBENCH}analysis.md
[ -d "$PACKAGING_DIR" ] && git add "$PACKAGING_DIR"
git add ${LATEST_RESULTS}suite-result.json
git commit -m "eval(auto-pilot): ${SKILL_ID} — status=$STATUS, baseline=$BASELINE_PER_CASE_MIN→$PER_CASE_MIN"
```

DO NOT push.

## Return summary

Return to caller (operator's CC session) under 300 words:

- Branch: `eval/auto-pilot/${SKILL_ID}`
- Final commit SHA: `<sha>`
- Status: one of the exit statuses
- Baseline → final per-case-min
- Per-case breakdown (table)
- Proposed-upstream-changes path (if applicable)
- Cumulative cost: $N.NN

## Hard rules

- NEVER ask the operator a question mid-run.
- NEVER `git push`.
- NEVER modify files outside `${WORKBENCH}`. Context files (`${CONTEXT_FILE}`) are written by the research sub-subagent, not by you.
- Always commit before exiting (even on error: write `analysis.md` with the right status, then commit).
- Cost guard: hard stop at $10 cumulative `metrics.cost.total`.
