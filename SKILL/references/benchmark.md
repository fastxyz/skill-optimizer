# Running & Interpreting Benchmarks

This guide covers running benchmarks, reading results, diagnosing failures, and comparing runs.

## 1. Pre-flight Check

Before running a benchmark, verify:

```bash
# Config is valid
npx skill-optimizer doctor --config <config-path>

# API key is set
echo $OPENROUTER_API_KEY  # should print sk-or-...

# Git is clean (if requireCleanGit is true, which is the default)
git status  # should show "nothing to commit, working tree clean"
```

## 2. Dry Run First

Always start with a dry run to check scope and estimate cost:

```bash
npx skill-optimizer run --dry-run --config <config-path>
```

This shows:
- How many actions were discovered
- How many are in scope after filtering
- How many tasks would be generated
- Which models would be called

No LLM calls are made. Use this to verify your scope and estimate cost (N models x M tasks = total calls).

## 3. Run the Benchmark

```bash
npx skill-optimizer run --config <config-path>
```

Optional run flags:

| Flag | Effect | Note |
|------|--------|------|
| `--tier <name>` | Only run models whose tier matches. | Valid values: `flagship`, `mid`, `budget`. Flag is `--tier`, not `--model-tier`. |
| `--model <id>` | Run a single specific model. | Pass the full model ID. |
| `--task <id>` | Run a single task by ID. | Stable IDs from `tasks.generated.json`. |
| `--no-cache` | Force fresh skill fetch. | |
| `--dry-run` | Preview scope without making LLM calls. | |

```bash
# Run only flagship models
npx skill-optimizer run --config <config-path> --tier flagship

# Debug a single task
npx skill-optimizer run --config <config-path> --task <task-id>
```

What happens at each stage:

1. **Discover** — find callable actions via tree-sitter or manifest
2. **Scope** — apply `include`/`exclude` filters
3. **Generate tasks** — create one prompt per in-scope action (coverage-guaranteed: every action gets at least one task)
4. **Call models** — each configured model attempts each task
5. **Extract** — pull action calls from model responses via pattern matching
6. **Evaluate** — compare extracted actions against expected actions
7. **Verdict** — PASS or FAIL based on two gates

## 4. Reading the Output

The benchmark produces:

- **Per-model score table** — each model's pass rate as a fraction (e.g., `Claude Sonnet: 18/20 (0.90)`)
- **Weighted average** — computed from individual scores and model weights
- **Verdict** — `PASS` (both gates satisfied) or `FAIL` (at least one gate missed)
- **Exit code** — `0` for PASS, `1` for FAIL

## 5. Verdict Gates

Two gates must **both** pass for a PASS verdict:

**`perModelFloor`** (default: `0.6`)
Every model must individually score at or above this threshold. If any single model scores below, the entire benchmark fails — regardless of how well other models did. This prevents one weak model from hiding behind a strong average.

**`targetWeightedAverage`** (default: `0.7`)
The weighted mean across all models must reach this threshold. Models with higher `weight` values count more. This ensures overall quality, not just per-model minimums.

**Model `weight`** (default: `1.0`)
Controls how much each model influences the weighted average. Set flagship models to `2.0` and budget models to `0.5` if you care more about flagship performance.

## 6. Diagnosing Failures

When a benchmark fails, look at the per-task breakdown to identify patterns:

**Hallucinated actions** — the model calls functions that don't exist in your API.
- *Cause:* SKILL.md describes features ambiguously or mentions non-existent methods
- *Fix:* Tighten your docs. Remove references to deprecated methods. Be explicit about what exists.

**Missing arguments** — the model calls the right action but with wrong or missing arguments.
- *Cause:* Documentation doesn't clearly specify required parameters or their types
- *Fix:* Add explicit parameter sections with types, defaults, and examples

**Wrong tool selection** — the model calls a related but incorrect action (e.g., `deleteTask` instead of `removeTask`).
- *Cause:* Action names are ambiguous or the docs don't distinguish between similar actions
- *Fix:* Add disambiguation notes or rename actions to be more distinct

**One model fails, others pass** — a specific model consistently underperforms.
- *Cause:* That model may need more explicit guidance or has known weaknesses with your API style
- *Fix:* Consider adjusting its `weight`, adding model-specific notes to your docs, or accepting the floor as-is

## 7. Comparing Runs

After making changes to your SKILL.md, compare before and after:

```bash
npx skill-optimizer compare --baseline report-before.json --current report-after.json
```

This shows:
- Per-model score deltas (e.g. `Claude Sonnet: 0.75 → 0.90 (+0.15)`)
- Per-task deltas — which tasks improved, which regressed
- Overall weighted average change

**Finding the report files:** The benchmark writes its report JSON to the `output.dir` configured in your `skill-optimizer.json` (default: `benchmark-results/`). Each run creates a timestamped file there.

## 8. Cost Awareness

Each benchmark run makes `N models x M tasks` LLM calls. To minimize cost while iterating:

- **Start narrow** — use `scope.include` to benchmark only your most important actions first
- **Few models first** — start with 2-3 models, expand after the skill stabilizes
- **Dry run** — always check scope size with `--dry-run` before committing to a full run
- **Iterate on docs first** — fix obvious SKILL.md gaps before re-running. Each run costs real money.

## 9. CI Integration

The exit code (`0` = PASS, `1` = FAIL) makes skill-optimizer suitable for CI pipelines:

```bash
# In a CI script or Makefile
npx skill-optimizer run --config <config-path>
# Exits 0 on PASS, 1 on FAIL — use as a gate step
```

This lets you catch regressions in documentation quality as part of your CI workflow.

## Next Steps

If the benchmark fails and the issues are scattered (not one obvious fix), read `references/optimize.md` to run the automatic optimization loop.

If you need to adjust config (models, scope, thresholds), read `references/config.md`.
