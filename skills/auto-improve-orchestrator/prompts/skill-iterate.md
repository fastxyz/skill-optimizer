# Sub-subagent prompt: iterate the skill content

You are a sub-subagent dispatched to apply ONE additive recipe to a
target file in a skill's vendored content, then re-measure to see if
the change moves per-case-min by ≥+0.05.

## Inputs (templated)

- `${SKILL_ID}` — leaf id (e.g. `supabase-postgres-best-practices`).
- `${WORKBENCH_DIR}` — `examples/workbench/${SKILL_ID}/`.
- `${SUITE_RESULT_PATH}` — path to the most recent `.results/<ts>/suite-result.json`.
- `${TARGET_FILE}` — path to the file to edit (extracted from the
  `${CONTEXT_FILE}`'s "Optimization target file" directive). Example:
  `${WORKBENCH_DIR}/references/<skill-id>/<file>.md`.
- `${CONTEXT_FILE}` — `skills/auto-improve-orchestrator/references/contexts/<owner>-<skill-id>.md`.
- `${LESSONS_PATH}` — `skills/auto-improve-orchestrator/references/lessons.md`.
- `${ITERATION}` — `1` or `2`.

## What to do

1. **Read the inputs.** Read `${SUITE_RESULT_PATH}`, `${CONTEXT_FILE}`,
   `${LESSONS_PATH}`, `${TARGET_FILE}`.

2. **Diagnose missed rules.** From `${SUITE_RESULT_PATH}`, identify:
   - Per-case scores (group `results[]` by `caseName`, average trial
     scores per case).
   - Per-rule miss frequency (read failed trials' `findings.txt`,
     identify which violation IDs were missed across trials/models).
   - Categorize each missed rule: visible-pattern / absence-of-attribute /
     state-machine / subjective.

3. **Match to a recipe.** From `${LESSONS_PATH}` § "Optimization
   patterns":
   - **Recipe A** (two-pass workflow) — code-reviewer skills with mixed
     presence/absence rules
   - **Recipe B** (verify-tool-installed nudge) — tool-use skills where
     models fall back to `curl`/`npm i`
   - **Recipe C** (per-element checklists) — skills with rules grouped
     by element type
   - **Recipe D** (BAD/GOOD examples) — anti-patterns where the bad
     pattern looks idiomatic
   - **Recipe E** (rationale + bug-story) — state-machine violations

   Pick the recipe that best matches the dominant failure mode for
   THIS iteration. If iteration 2 and recipe X was tried in iteration
   1 with insufficient uplift, pick a DIFFERENT recipe.

4. **Apply the recipe ADDITIVELY to `${TARGET_FILE}`.** Read
   `${CONTEXT_FILE}`'s "Hard constraints" — your edit must comply
   (e.g., additive-only, terse imperative bullets, specific style).
   Match the surrounding voice in `${TARGET_FILE}`.

5. **Re-run the suite from `${WORKBENCH_DIR}`:**

   ```bash
   cd ${WORKBENCH_DIR}
   set -a; . ../../../.env; set +a
   npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3 \
     2>&1 | tee /tmp/skill-iter-${ITERATION}-${SKILL_ID}.log
   ```

   Wait for completion (~30-60 min depending on suite size).

6. **Compute new per_case_min.** Read the new `.results/<latest>/suite-result.json`. Group by `caseName`. Per-case mean. Min across cases.

7. **Compare to baseline.** The orchestrator passed you `${SUITE_RESULT_PATH}` (the previous result). Compute:
   - `prev_per_case_min` from `${SUITE_RESULT_PATH}`
   - `new_per_case_min` from the new run
   - `uplift = new_per_case_min - prev_per_case_min`

8. **Commit if uplift OR final iteration.** Even if uplift is small,
   commit (the orchestrator may want the additive change as
   `uplift-too-small` packaging):

   ```bash
   git add ${TARGET_FILE}
   git commit -m "feat(${SKILL_ID}): iterate ${ITERATION} — Recipe <X>"
   ```

   Skip pushing.

## Tools allowed

Read, Edit, Bash, Glob.

## Constraints

- Additive ONLY. No deletions, no rewording of existing target-file
  content. The `${CONTEXT_FILE}` may specify additional constraints
  (e.g., specific frontmatter fields, prefix restrictions); honor all
  of them.
- DO NOT touch `${WORKBENCH_DIR}/checks/`, `${WORKBENCH_DIR}/workspace/`,
  `${WORKBENCH_DIR}/suite.yml` — those are eval harness, not skill
  content. (Eval changes are the eval-iterate subagent's job.)
- DO NOT modify `${LESSONS_PATH}` or other reference material outside
  `${TARGET_FILE}`.

## Cost guard

If the suite re-run fails or takes longer than the wrapper's default
timeout, exit with status `blocked-by-error` and a brief explanation.

## Return report

Return to caller (orchestrator subagent) under 300 words:

- Recipe applied (A/B/C/D/E)
- Diff summary (what was added, ~lines)
- Per-case scores: prev → new (table)
- per_case_min: prev → new
- uplift: ±N.NN
- Verdict: `success` (uplift ≥ +0.05) | `uplift-too-small` (less)
- Branch + commit SHA + new `.results/<ts>/` path
