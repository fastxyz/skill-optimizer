# Changelog

## 0.1.0 — unreleased

First OSS-ready release.

### Breaking

- **Config filename:** `skill-benchmark.json` → `skill-optimizer.json`. The loader emits a migration error if it finds only the old filename.
- **`optimize.minImprovement` default:** `0.01` → `0.02`.
- **Acceptance gates:** The optimizer now requires both (a) no per-model regression below `benchmark.verdict.perModelFloor` and (b) weighted-average improvement ≥ `optimize.minImprovement`. The previous single-delta aggregate check is removed.

### Added

- `target.scope.{include,exclude}` with single-`*` glob semantics.
- `benchmark.verdict.{perModelFloor,targetWeightedAverage}` with defaults `0.6` / `0.7`.
- `benchmark.models[].weight` — weights weighted average; defaults to `1.0` (arithmetic mean).
- Per-model pass rate + weighted average in every report.
- `scopeCoverage` block in reports (in-scope / out-of-scope / uncovered).
- 2-iteration coverage-guaranteed task generation.
- Deterministic feedback: structured per-failure details, cross-task patterns, passing/failing diffs.
- Byte-budgeted mutation context (30/40/30% split across the three signals).
- FAIL-only recommendations critic (single LLM call; JSON output).
- PASS/FAIL verdict rendered in console + markdown; exit code 1 on FAIL.
- `skill-optimizer --dry-run` — discovery + scope preview with zero LLM calls.
- CI workflow (Node 20.x + 22.x matrix, typecheck + test + build).
- New smoke tests: `smoke-scoring`, `smoke-scope`, `smoke-coverage`, `smoke-feedback`, `smoke-verdict`, `smoke-dry-run`, `smoke-errors`.

### Changed

- README fully rewritten as a one-page OSS entry.
- Error messages audited to always name the next step.
- `repoPath` validated at load time with a clear actionable error.
- API key absence detected before any LLM call with a clear actionable error.
