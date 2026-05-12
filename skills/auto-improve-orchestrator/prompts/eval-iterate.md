# Sub-subagent prompt: iterate the eval workbench

You are a sub-subagent dispatched to make a focused change to one
skill's eval workbench so that downstream skill-iteration has real
headroom (baseline lands in `(0.50, 0.95)`).

## Inputs (templated)

- `${SKILL_ID}` — leaf id, e.g. `supabase-postgres-best-practices`.
- `${WORKBENCH_DIR}` — `examples/workbench/${SKILL_ID}/`.
- `${SUITE_RESULT_PATH}` — path to the most recent `.results/<ts>/suite-result.json`.
- `${DIRECTION}` — one of:
  - `add-harder` — add 2-3 new cases that surface absence-type
    violations the existing graders don't catch
  - `simplify` — remove ambiguous violations from existing workspace
    files; tighten task descriptions
  - `fix-graders` — apply recipes G1-G6 from `references/lessons.md`
    (line-tolerance, fuzzy keywords, etc.)
- `${LESSONS_PATH}` — `skills/auto-improve-orchestrator/references/lessons.md`. Read this for grader-pattern recipes G1-G6 (relevant for `fix-graders`) and the load-bearing prior on absence-type rules (relevant for `add-harder`).

## What to do (per direction)

### `add-harder`

1. Read the current `${SUITE_RESULT_PATH}` to identify which rules are
   ALREADY at ceiling (per-case score == 1.00). New cases should
   target absence-type variants of these rules that the existing
   workspace files don't exercise.
2. Read `${LESSONS_PATH}` § "The load-bearing prior" — absence-type
   rules are 5-10× harder than presence-type. New cases should force
   enumeration (multi-statement files, mixed correct + incorrect
   patterns, invariants that span statements).
3. Write 2-3 NEW workspace files under `${WORKBENCH_DIR}/workspace/`.
   Each file = one new case. Realistic content (not contrived).
   Lowercase SQL keywords if applicable; semantic table/column names.
4. Write 2-3 NEW grader files under `${WORKBENCH_DIR}/checks/`. Each
   grader = one new case. Use `_grader-utils.mjs` helpers
   (`looseRange`, `fuzzyKeyword`, `tolerantKeyword`).
5. Update `${WORKBENCH_DIR}/suite.yml` to include the new cases. Don't
   touch existing cases.
6. Run a smoke check at `${WORKBENCH_DIR}/checks/smoke-graders.mjs`:
   - Hand-craft GOOD `findings.txt` per new grader → assert
     `pass=true score=1`
   - Hand-craft BAD `findings.txt` (missing 1-2 violations) → assert
     `pass=false score<1`
   - Hand-craft EMPTY → assert `pass=false score=0`
   - Run: `node ${WORKBENCH_DIR}/checks/smoke-graders.mjs`
   - All assertions must pass.

### `simplify`

1. Read `${SUITE_RESULT_PATH}` to identify which cases are scoring
   `< 0.50`. Read failed trials' `findings.txt` to understand WHY:
   ambiguous tasks, contrived violations, multiple valid answers.
2. Edit existing workspace files to remove ambiguity (clearer task
   description, fewer red-herring statements, tighter line ranges).
3. Update graders if the violations themselves changed.
4. Run the smoke check (same shape as `add-harder`).

### `fix-graders`

1. Read failed trials' `findings.txt` (paths in `${SUITE_RESULT_PATH}`'s
   `results[].trials[].resultPath`). If models DID find the violations
   but the grader scored wrong (line off by ±5, keyword mismatch,
   format variant), this is a grader bug.
2. Apply recipes G1-G6 from `${LESSONS_PATH}`:
   - G1: widen `looseRange` from default 8 to 10-12 if line drift is
     systematic
   - G2: replace hand-written keyword regex with `fuzzyKeyword`
   - G4: replace `/exact-stem/i` with `tolerantKeyword('stem')`
   - G6: split per-finding-line check (don't credit cross-finding keyword matches)
3. Run the smoke check.

## Tools allowed

Read, Edit, Write, Bash, Glob.

## Constraints

- Additive ONLY for `add-harder` (no changes to existing cases or
  graders unless their helpers need extension).
- Edits ONLY for `simplify` and `fix-graders` (no new cases).
- Smoke check MUST pass before commit.
- DO NOT run `npx tsx ../../../src/cli.ts run-suite` (that's the
  orchestrator's job; you just modify the workbench).
- DO NOT modify the `references/` (vendored skill content) — those are
  fixed inputs.

## Commit

After smoke check passes:

```bash
git add ${WORKBENCH_DIR}
git commit -m "feat(eval): ${DIRECTION} for ${SKILL_ID} (cases: <list>)"
```

DO NOT push.

## Return report

Return to caller (orchestrator subagent) under 300 words:

- Direction: `add-harder` | `simplify` | `fix-graders`
- Cases added/modified (names + 1-line description each)
- Predicted baseline impact (rough: "frontier models will likely miss
  X% of new checks because Y")
- Smoke-check result (N/N assertions pass)
- Blockers, if any
- Branch + commit SHA
