# skill-optimizer v0.1 — Design Spec

**Date:** 2026-04-12
**Branch:** `feat/unify-benchmark-optimizer-projects`
**Target state:** Merge to `main` as first OSS-ready release.

---

## 1. Overview & Goals

Build on the existing `feat/unify-benchmark-optimizer-projects` PR to close the gap between the current implementation and the stated vision:

> A developer tool where you can throw an SDK / MCP / CLI at it, and it tells you whether the tool is optimized for agents, then self-optimizes it by running multiple models and iterating until all models can use it.

The PR already delivers unified config, multi-surface discovery, task generation, a benchmark-driven mutation loop, and safety invariants (git checkpoints, allowed-path scoping). This spec extends it along six axes so the repository can be merged and open-sourced confidently:

1. Acceptance criteria that target **per-model universality**, not just aggregate averages.
2. A concrete, user-facing **PASS / FAIL verdict** with exit code.
3. Deterministic **feedback extraction** — no self-diagnosis by failing models.
4. **Scoped coverage**: developers choose what to test; within that scope, coverage is guaranteed.
5. Actionable **recommendations** rendered at the end of every FAIL run.
6. **OSS-ready polish**: README, examples, CI, error hygiene, rebrand cleanup.

**Out of scope for this release:**

- Live verification (actually invoking MCP tools or CLI commands under test).
- LLM providers beyond OpenRouter.
- Web UI for reports.
- npm publishing — consumption remains clone-and-run.

---

## 2. Config Schema Changes

`skill-optimizer.json` (renamed from `skill-benchmark.json`) gets four additive sections. Existing configs load with defaults filling new fields.

### 2.1 Scope filter on `target`

```json
"target": {
  "surface": "mcp",
  "repoPath": ".",
  "skill": "./SKILL.md",
  "discovery": { "mode": "auto", "sources": ["./src/server.ts"] },
  "scope": {
    "include": ["*"],
    "exclude": []
  }
}
```

Scope resolves once after discovery, before task generation. Globs match against fully-qualified action names.

**Glob semantics:** single operator `*` matches any sequence of characters, including separators like `.`. No `**`, no regex, no case variants.

Examples:
- `["*"]` → all discovered actions
- `["Wallet.*"]` → `Wallet.send`, `Wallet.receive`, etc.
- `["*.send"]` → any action ending in `.send`
- `["*deprecated*"]` → any action containing `deprecated`
- `exclude: ["*.internal*"]` → drops internal-marked actions

### 2.2 Model weights + verdict under `benchmark`

```json
"benchmark": {
  "models": [
    { "id": "openrouter/openai/gpt-5.4", "name": "GPT-5.4", "tier": "flagship", "weight": 1.0 },
    { "id": "openrouter/anthropic/claude-sonnet-4.6", "name": "Claude 4.6", "tier": "mid" },
    { "id": "openrouter/google/gemini-3-flash", "name": "Gemini 3 Flash", "tier": "low" }
  ],
  "verdict": {
    "perModelFloor": 0.6,
    "targetWeightedAverage": 0.7
  }
}
```

- `weight` defaults to `1.0` per model, collapsing weighted average to arithmetic mean.
- `verdict` lives under `benchmark` because both `benchmark` and `optimize` commands consult it.
- Omitting `verdict` entirely uses defaults (`0.6` / `0.7`).

### 2.3 Feedback is not configurable

All feedback is deterministic aggregation over benchmark results (see §5): structured failure details, cross-task patterns, passing/failing diffs. These are free to compute and always useful, so there is no user-facing toggle. No new fields under `optimize` for feedback.

Self-critique was considered and rejected — weak models are unreliable at self-diagnosis.

The only optimize-level knob changing default value is `minImprovement`: `0.01` → `0.02`.

### 2.4 Recommendations are implicit

No config surface for recommendations. When verdict is `FAIL`, a single critic pass runs automatically using `optimize.model` if configured, or the highest-tier benchmark model otherwise.

### 2.5 Default changes

- `optimize.minImprovement` default: `0.01` → `0.02`.
- New defaults: `perModelFloor: 0.6`, `targetWeightedAverage: 0.7`, `scope.include: ["*"]`, `scope.exclude: []`.

---

## 3. Rebrand: `skill-benchmark` → `skill-optimizer`

Most of the rebrand is already landed in the PR (`package.json` name, binary, homepage, CLAUDE.md). Remaining work:

### 3.1 Renames

| Thing | Old | New |
|---|---|---|
| Config filename | `skill-benchmark.json` | `skill-optimizer.json` |
| README H1 + body copy | `skill-benchmark` references | `skill-optimizer` |
| `src/benchmark/init.ts` scaffold output | `skill-benchmark.json` | `skill-optimizer.json` |
| Mock repo configs | `mock-repos/*/skill-benchmark.json` | `skill-optimizer.json` |

`src/benchmark/` directory stays — it names the benchmark *module* within the optimizer, not the tool.

### 3.2 package.json stripping

This project is not published to npm. Remove fields that only make sense for published packages:

- Remove: `bin`, `main`, `types`, `exports`, `files`, `prepack` script.
- Keep: `name`, `version`, `description`, `license`, `author`, `homepage`, `bugs`, `repository`, `keywords`, `type: "module"`, `engines`, all `scripts`, all deps.
- Fix inconsistency: change `"optimize": "tsx src/optimizer/main.ts"` → `"optimize": "tsx src/cli.ts optimize"` so the CLI is the single source of truth.

### 3.3 Backward compatibility

Pre-1.0; break cleanly. Config loader:
- Loads `skill-optimizer.json`.
- If it finds only `skill-benchmark.json` in cwd, errors with: *"Rename skill-benchmark.json to skill-optimizer.json — see CHANGELOG for migration notes."*

### 3.4 CHANGELOG entry

New `CHANGELOG.md` documents the rename plus all other breaking changes in this release.

---

## 4. Scoring & Verdict Logic

### 4.1 Per-model pass rate

For each model `m`:

```
passRate(m) = tasks_passed(m) / tasks_in_scope
```

A task passes for a model when all expected actions are called AND all required args match (existing `src/benchmark/evaluator.ts` logic).

### 4.2 Weighted average

```
weightedAvg = Σ (passRate(m) × weight(m)) / Σ weight(m)
```

With default weights of 1.0, this equals the arithmetic mean.

### 4.3 Acceptance gates (optimizer loop)

A mutation is accepted only if **both** gates pass:

```ts
function accept(before: Report, after: Report, policy: Policy): boolean {
  // Gate 1: no per-model regression below floor
  for (const model of after.models) {
    const afterRate = after.passRate(model.id);
    if (afterRate < policy.perModelFloor) {
      const beforeRate = before.passRate(model.id);
      if (afterRate <= beforeRate) return false;
    }
  }
  // Gate 2: weighted average improves by at least minImprovement
  return (after.weightedAvg - before.weightedAvg) >= policy.minImprovement;
}
```

Gate 1 encodes "below-floor but improving is OK." Concretely:
- Model at 30% → 40%: accepted (below floor, improving).
- Model at 80% → 70%: accepted (still above floor).
- Model at 80% → 55%: rejected (crossed below floor).
- Model at 40% → 35%: rejected (still below floor, regressing).

### 4.4 Verdict computation

```ts
function computeVerdict(report: Report, policy: Policy): "PASS" | "FAIL" {
  const allModelsAboveFloor = report.models.every(
    m => report.passRate(m.id) >= policy.perModelFloor
  );
  const weightedAvgHitsTarget = report.weightedAvg >= policy.targetWeightedAverage;
  return allModelsAboveFloor && weightedAvgHitsTarget ? "PASS" : "FAIL";
}
```

Applied at:
- End of `optimize` loop → sets CLI exit code (0 / 1).
- End of any `benchmark` run → rendered as advisory verdict.

### 4.5 Files

- **New:** `src/benchmark/scoring.ts` — `computePerModelPassRates`, `computeWeightedAverage`, `computeVerdict`.
- **Modified:** `src/optimizer/loop.ts` — replace `minOverallPassDelta` comparison with two-gate `accept()`.
- **Modified:** `src/benchmark/types.ts` — extend report with `perModelPassRates`, `weightedAverage`, `verdict`.
- **Modified:** `src/benchmark/reporter.ts` — render per-model table + verdict line.

---

## 5. Feedback & Recommendations Pipeline

All feedback is deterministic — no asking models to self-diagnose. Only the end-of-run recommendations step invokes an LLM.

### 5.1 Structured per-failure analysis

For every `(task, model)` failure, compute a detail record from the existing benchmark results:

```ts
type FailureDetail = {
  task_id: string;
  model_id: string;
  kind: "missing-tool" | "bad-args" | "hallucination" | "error";
  expected_action: string;
  expected_args: Record<string, unknown>;
  actual_calls: Array<{ action: string; args: Record<string, unknown> }>;
  mismatch_detail: string;
};
```

`mismatch_detail` is kind-specific:
- **missing-tool:** lists what was called instead.
- **bad-args:** names the specific wrong arg and expected pattern.
- **hallucination:** reports Levenshtein distance to nearest real actions.
- **error:** raw error message.

### 5.2 Cross-task pattern detection

Pure aggregation over `FailureDetail[]`:
- Naming mismatches (many models calling similar-but-wrong names).
- Arg-type confusion (string vs number, enum value confusion).
- Systematic hallucinations (same fake method called by multiple models).

### 5.3 Passing/failing diff

For each task where some models passed and some failed, assemble a structured contrast showing what each group produced. Pure data — no LLM calls.

### 5.4 Mutation context assembly

The mutator LLM receives three inputs, byte-budgeted within `reportContextMaxBytes: 16000`:

- **30%** — structured failure details
- **40%** — cross-task patterns
- **30%** — passing/failing diffs

Overflow drops lowest-priority items from each bucket; all three signals remain present.

### 5.5 Recommendations pipeline (end-of-run only)

**Trigger:** `FAIL` verdict on `benchmark` or `optimize`.
**LLM calls:** one total, not per-task.

Critic prompt inputs: full final report + all deterministic feedback artifacts. Output: JSON array of `{ priority, area, action, rationale }`. Rendered in the final markdown report and console.

Model resolution: `optimize.model` if configured, otherwise the highest-tier benchmark model. Reuses the same API key environment variable.

### 5.6 Cost profile

Zero feedback-time LLM calls. One critic call per run on FAIL. Loop cost stays dominated by mutation + re-benchmark, as today.

### 5.7 Files

- **New:** `src/optimizer/feedback/failure-details.ts`
- **New:** `src/optimizer/feedback/patterns.ts`
- **New:** `src/optimizer/feedback/passing-failing-diff.ts`
- **New:** `src/optimizer/feedback/mutation-context.ts` (replaces current `report-context.ts`)
- **New:** `src/verdict/recommendations.ts`
- **New:** `src/verdict/render.ts`

---

## 6. Scope & Coverage

### 6.1 Scope resolution

After discovery, a scope step filters the surface:

```ts
function resolveScope(
  discovered: DiscoveredAction[],
  scope: { include: string[]; exclude: string[] }
): { inScope: DiscoveredAction[]; outOfScope: DiscoveredAction[] }
```

Out-of-scope actions are tracked and reported so nothing is silently hidden.

### 6.2 Coverage guarantee within scope

`tasks.generated.json` contains at least one task per in-scope action.

**Pre-flight:** `project/validate.ts` errors at resolve time if `taskGeneration.maxTasks < inScope.length` — suggests raising `maxTasks` or tightening `exclude`.

**Generation flow:**

1. Iteration 1 (existing one-shot prompt): generate up to `maxTasks` tasks covering as much surface as possible.
2. Parse. Compute `uncovered = inScope - covered`.
3. If `uncovered` non-empty, iteration 2 runs a focused prompt: *"Generate tasks specifically for these N actions."*
4. After 2 iterations, if uncovered remains → error listing the uncovered action names. Developer either fixes the prompt / SKILL.md or excludes the problematic actions.

**Dedup:** iterations de-dupe by action coverage. Duplicates don't count against the `maxTasks` budget.

### 6.3 Coverage reporting

```
Surface coverage:
  In scope:      14 actions (target.scope.include/exclude applied)
  Out of scope:   3 actions (Wallet.deprecatedSend, Token.internalMint, ...)
  Covered:       14 / 14 (100%)
  Tasks:         18 (spread: 1–3 per action)
```

If `covered < inScope.length` somehow slips past (defense in depth), the report's `coverageViolation: true` flag forces a FAIL verdict regardless of scores.

### 6.4 Interaction with surface-changing optimizer mode

When the surface changes mid-loop, scope filters re-apply to the new discovered set. Existing epoch mechanism handles regeneration; scope narrows what gets regenerated.

### 6.5 Files

- **New:** `src/tasks/scope.ts`
- **New:** `src/tasks/coverage.ts`
- **Modified:** `src/tasks/generate.ts`
- **Modified:** `src/project/validate.ts`
- **Modified:** `src/project/resolve.ts`
- **Modified:** `src/benchmark/reporter.ts`
- **Modified:** `src/benchmark/types.ts`

---

## 7. OSS-Readiness Items

### 7.1 README rewrite

One-page skimmable doc organized for the GitHub-arrival developer:

1. One-paragraph pitch.
2. Quickstart (3 commands).
3. How it works (loop diagram + stage summaries).
4. Configuration reference (all fields, defaults, examples).
5. Interpreting the verdict.
6. Scope & coverage.
7. Cost notes (rough LLM spend table).
8. `pi-coding-agent` dependency explanation.
9. Troubleshooting.
10. Pointer to CONTRIBUTING.md.

### 7.2 Example repos

Two working examples under `mock-repos/`:

- **`mcp-tracker-demo/`** (existing) — polish, current config, add proper README.
- **`sdk-counter-demo/`** (new) — small TS SDK with intentionally-ambiguous docs. First run FAILs, recommendations show the fix, second run PASSes.

Each example ships `SKILL.md`, `skill-optimizer.json`, `README.md`, and source files.

No CLI demo — scope stays tight; CLI extraction covered by smoke tests.

### 7.3 `CONTRIBUTING.md`

Short doc (< 100 lines):
- Local test workflow (`npm test`, `npm run typecheck`, `npm run build`).
- Project layout summary.
- Pre-submit expectations.
- How to add a surface type or LLM provider (file-pointer level).
- Commit style from existing history.

### 7.4 CI workflow

`.github/workflows/ci.yml` runs on PRs and main pushes: install, typecheck, test, build. Node 20.x + 22.x matrix. No secrets (smoke tests use mock LLM).

### 7.5 `--dry-run` flag

Truly dry — zero LLM calls, zero side effects.

On `optimize --dry-run` (and `benchmark` / `run --dry-run`):
- Discovery runs (free, AST only).
- Scope resolves.
- Prints: discovered surface, in-scope / out-of-scope lists, coverage plan, pre-flight errors (e.g., `maxTasks < scope_size`).
- Does **not** generate tasks, benchmark, or mutate.

Intermediate step ("generate tasks + baseline, no optimization") is covered by the existing granular commands:

```bash
skill-optimizer generate-tasks --config ./skill-optimizer.json
skill-optimizer run --config ./skill-optimizer.json
```

README documents this composition.

### 7.6 Error message hygiene

Audit every error path (validate, resolve, run, optimize). Each error names:
- What went wrong.
- What to do next (config field, env var, URL, next command).

Estimated 15–25 sites. Covered by dedicated tests (§8.6).

### 7.7 `CHANGELOG.md`

Top-level changelog, `0.1.0` entry summarizing:
- Rebrand (config filename, package cleanup).
- Config schema additions (scope, verdict, feedback).
- Scoring & verdict behavior change.
- All new CLI commands / flags.

### 7.8 License

MIT, already present in `LICENSE` file.

### 7.9 New files summary

```
README.md                          (rewrite)
CONTRIBUTING.md                    (new)
CHANGELOG.md                       (new)
.github/workflows/ci.yml           (new)
mock-repos/sdk-counter-demo/       (new directory)
  ├── README.md
  ├── SKILL.md
  ├── skill-optimizer.json
  └── src/counter.ts
```

---

## 8. Testing Strategy

### 8.1 Existing smoke tests

Keep all existing `tests/smoke-*.ts` tests. Extend several to cover new behavior.

### 8.2 New smoke tests

- `tests/smoke-scoring.ts` — `computePerModelPassRates`, `computeWeightedAverage`, `computeVerdict` with synthetic reports. Covers equal-weights-collapse-to-mean, per-model floor rejection, below-floor-but-improving acceptance, weighted-average correctness.
- `tests/smoke-scope.ts` — `resolveScope` with various include/exclude combos.
- `tests/smoke-coverage.ts` — coverage enforcement (iteration retry, error after 2 residual).
- `tests/smoke-feedback.ts` — structured failure details, cross-task patterns, passing/failing diffs.
- `tests/smoke-verdict.ts` — recommendations pipeline end-to-end with mock LLM. FAIL triggers critic; PASS skips.
- `tests/smoke-dry-run.ts` — no LLM calls made (fail-fast mock), coverage preview output, `maxTasks < scope_size` error.

### 8.3 Fixture-based integration test

`tests/smoke-e2e.ts`: full optimize loop against deterministic mock LLM. Two iterations; first mutation fixes 1 of 2 failures, second fixes the remaining one. Final verdict PASS. Uses existing `__setPiImplementationsForTest` hook.

### 8.4 Type & build gates

`npm run typecheck` and `npm run build` must pass — enforced in CI.

### 8.5 Test output convention

Unchanged: smoke tests print PASS / FAIL per test with exit code; no framework dependency.

### 8.6 Prerequisite / sequencing error tests

`tests/smoke-errors.ts` — explicit tests that misuse produces clear errors, not crashes. Each case verifies exit code and presence of next-step guidance:

- `run` / `benchmark` with no tasks file and `taskGeneration.enabled: false` → points at config.
- `run` without `OPENROUTER_API_KEY` → points at setup docs.
- `optimize` against dirty git → points at `git status`.
- `optimize` with empty `allowedPaths` → points at config field.
- `optimize` with `scope.include` resolving to zero actions.
- Discovery sources referencing nonexistent files.
- Config file not found.
- Invalid JSON with line/column.
- `maxTasks < scope_size` pre-flight error.
- `repoPath` nonexistent.

These tests double as executable documentation of the error surface. Changing an error message is a conscious decision, not an accident.

---

## 9. File Touch Summary

### New files

```
src/benchmark/scoring.ts
src/optimizer/feedback/failure-details.ts
src/optimizer/feedback/patterns.ts
src/optimizer/feedback/passing-failing-diff.ts
src/optimizer/feedback/mutation-context.ts
src/verdict/recommendations.ts
src/verdict/render.ts
src/tasks/scope.ts
src/tasks/coverage.ts
tests/smoke-scoring.ts
tests/smoke-scope.ts
tests/smoke-coverage.ts
tests/smoke-feedback.ts
tests/smoke-verdict.ts
tests/smoke-dry-run.ts
tests/smoke-e2e.ts
tests/smoke-errors.ts
README.md                        (full rewrite)
CONTRIBUTING.md
CHANGELOG.md
.github/workflows/ci.yml
mock-repos/sdk-counter-demo/     (full directory)
```

### Modified files

```
package.json                     (strip bin/main/exports/files/prepack; fix optimize script)
src/optimizer/loop.ts            (two-gate accept)
src/benchmark/types.ts           (per-model + weighted + verdict + coverage fields)
src/benchmark/reporter.ts        (new report sections)
src/project/types.ts             (scope, verdict, feedback fields)
src/project/validate.ts          (scope + coverage + prereq checks)
src/project/resolve.ts           (defaults for new fields)
src/project/load.ts              (old-filename error)
src/project/adapters.ts          (scope propagation)
src/tasks/generate.ts            (2-iter coverage loop)
src/tasks/freeze.ts              (scope metadata)
src/discovery/*.ts               (pass through to scope filter)
src/benchmark/init.ts            (scaffold new config filename)
src/cli.ts                       (--dry-run flag, verdict exit code, error message hygiene)
CLAUDE.md                        (minor updates)
mock-repos/mcp-tracker-demo/     (rename config file, polish)
```

### Renamed files

```
mock-repos/mcp-tracker-demo/skill-benchmark.json → skill-optimizer.json
(any other skill-benchmark.json files in repo → skill-optimizer.json)
```

---

## 10. Invariants (carried forward from current CLAUDE.md)

- Benchmark evaluation remains static. No execution of model-produced code.
- Path resolution relative to config file, not cwd.
- `allowedPaths` is the optimizer safety boundary.
- `requireCleanGit` remains enforced.
- Task-generation output dir is never counted as a target-repo mutation.
- Materialized mock repos remain isolated from tracked templates.
- Stable-surface mode: surface paths must not change. Surface-changing mode: regeneration epoch on surface change.

---

## 11. Acceptance Criteria for Merge

The PR is merge-ready when all of the following hold:

1. `npm run typecheck` passes.
2. `npm run build` passes.
3. `npm test` passes — including all new smoke tests.
4. CI workflow runs green on Node 20.x and 22.x.
5. Both example repos (`mcp-tracker-demo`, `sdk-counter-demo`) run end-to-end from clone → `optimize` and produce expected verdicts.
6. README covers §7.1's 10 sections.
7. `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, `.github/workflows/ci.yml` all present.
8. No `skill-benchmark` references remain in user-facing docs or configs.
9. Manual smoke: `skill-optimizer optimize --dry-run --config mock-repos/mcp-tracker-demo/skill-optimizer.json` runs with zero LLM calls and prints scope + coverage preview.
