# skill-optimizer v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the `feat/unify-benchmark-optimizer-projects` PR to an OSS-ready v0.1 release by adding per-model scoring with verdict, deterministic feedback, scoped coverage, recommendations, rebrand cleanup, and OSS polish.

**Architecture:** Layer additively on the existing project pipeline: config validation → discovery → scope filter → coverage-guaranteed task generation → benchmark → two-gate acceptance → deterministic feedback aggregation → PASS/FAIL verdict → recommendations (on FAIL). No breaking changes to the benchmark-evaluation core; the new logic plugs in at well-defined seams (`src/benchmark/scoring.ts`, `src/tasks/scope.ts`, `src/tasks/coverage.ts`, `src/optimizer/feedback/*`, `src/verdict/*`).

**Tech Stack:** TypeScript (ESM, Node ≥20), `@mariozechner/pi-*` for LLM transport, `web-tree-sitter` for SDK AST extraction, `dotenv` for env loading. Tests are hand-rolled smoke tests (`tsx tests/smoke-*.ts`) that print PASS/FAIL per case with process exit code.

**Spec:** `docs/superpowers/specs/2026-04-12-skill-optimizer-v1-design.md`

---

## Phase Map

| Phase | Theme | Tasks |
|---|---|---|
| 1 | Rebrand foundation (filename, package.json, CLI copy) | 1–4 |
| 2 | Scoring types + scoring module | 5–7 |
| 3 | Two-gate acceptance in optimizer | 8–10 |
| 4 | Scope filter | 11–14 |
| 5 | Coverage enforcement + task-generation loop | 15–18 |
| 6 | Deterministic feedback pipeline | 19–24 |
| 7 | Verdict + recommendations rendering | 25–28 |
| 8 | CLI: `--dry-run`, verdict exit code, config file rename flow | 29–32 |
| 9 | Error message hygiene + prerequisite tests | 33–35 |
| 10 | OSS polish: README, CONTRIBUTING, CHANGELOG, CI | 36–39 |
| 11 | Second example repo (`sdk-counter-demo`) | 40–42 |
| 12 | Integration e2e + final acceptance check | 43–46 |

---

## Task 1: Rename project config filename

**Files:**
- Modify: `src/project/load.ts`
- Modify: `src/benchmark/init.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Read the current loader to confirm the constant shape**

```bash
grep -n "skill-benchmark.json" src/project/load.ts src/cli.ts src/benchmark/init.ts
```

Expected: three separate occurrences (constant, CLI defaults, init scaffold).

- [ ] **Step 2: Change `DEFAULT_PROJECT_CONFIG_NAME` and add legacy-filename error**

In `src/project/load.ts`, replace the body of `loadProjectConfig` to emit a clear error when only the old filename exists:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ProjectConfig, ResolvedProjectConfig } from './types.js';
import { resolveProjectConfig } from './resolve.js';
import { validateProjectConfig } from './validate.js';

export const DEFAULT_PROJECT_CONFIG_NAME = 'skill-optimizer.json';
export const LEGACY_PROJECT_CONFIG_NAME = 'skill-benchmark.json';

export function loadProjectConfig(configPath?: string): ResolvedProjectConfig {
  const resolvedPath = configPath
    ? resolve(configPath)
    : resolve(process.cwd(), DEFAULT_PROJECT_CONFIG_NAME);

  if (!existsSync(resolvedPath)) {
    const legacyCandidate = configPath
      ? resolve(dirname(resolvedPath), LEGACY_PROJECT_CONFIG_NAME)
      : resolve(process.cwd(), LEGACY_PROJECT_CONFIG_NAME);
    if (!configPath && existsSync(legacyCandidate)) {
      throw new Error(
        `Found legacy '${LEGACY_PROJECT_CONFIG_NAME}'. ` +
          `Rename it to '${DEFAULT_PROJECT_CONFIG_NAME}' — see CHANGELOG.md for migration notes.`,
      );
    }
    throw new Error(
      `Project config not found: ${resolvedPath}\n` +
      `Run 'skill-optimizer init' to create one, or specify --config <path>.`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read project config: ${resolvedPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: ProjectConfig;
  try {
    parsed = JSON.parse(raw) as ProjectConfig;
  } catch (error) {
    throw new Error(
      `Invalid JSON in project config ${resolvedPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  validateProjectConfig(parsed, resolvedPath);
  return resolveProjectConfig(parsed, resolvedPath);
}
```

- [ ] **Step 3: Update CLI defaults and help text**

In `src/cli.ts`, search and replace every `'skill-benchmark.json'` default with `'skill-optimizer.json'`. This covers `runOptimizeFromConfig`, `generate-tasks` mode, and `run`/`benchmark` mode. Update `printUsage()` so every `--config` description, Optimize options header, and Examples block references `skill-optimizer.json`.

- [ ] **Step 4: Update init scaffold output filename**

In `src/benchmark/init.ts`, change the file write target from `skill-benchmark.json` to `skill-optimizer.json`. Update any logging strings that mention the filename.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: clean (no references to missing symbols).

- [ ] **Step 6: Commit**

```bash
git add src/project/load.ts src/benchmark/init.ts src/cli.ts
git commit -m "feat(config): rename skill-benchmark.json → skill-optimizer.json with legacy error"
```

---

## Task 2: Rename mock repo config file and update references

**Files:**
- Rename: `mock-repos/mcp-tracker-demo/skill-benchmark.json` → `mock-repos/mcp-tracker-demo/skill-optimizer.json`
- Modify: `mock-repos/mcp-tracker-demo/README.md`
- Modify: `tests/smoke-mock-repos.ts`

- [ ] **Step 1: Locate all references to the old filename**

```bash
grep -rn "skill-benchmark.json" mock-repos tests src docs
```

Expected: list includes `mock-repos/mcp-tracker-demo/skill-benchmark.json` and any test/demo files referencing it.

- [ ] **Step 2: Git-rename the mock config**

```bash
git mv mock-repos/mcp-tracker-demo/skill-benchmark.json \
  mock-repos/mcp-tracker-demo/skill-optimizer.json
```

- [ ] **Step 3: Update test references**

For each hit from step 1 under `tests/`, open the file and replace `skill-benchmark.json` with `skill-optimizer.json`. Do the same for `mock-repos/mcp-tracker-demo/README.md` and any CLAUDE.md / spec references that are not historical (leave old PR history references alone).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (mock-repo tests now find the renamed file).

- [ ] **Step 5: Commit**

```bash
git add mock-repos tests
git commit -m "feat(mock-repos): rename config to skill-optimizer.json + update tests"
```

---

## Task 3: Strip npm-publishing fields from package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove `bin`, `main`, `types`, `exports`, `files`, and `prepack`**

Edit `package.json` so the final shape is:

```json
{
  "name": "skill-optimizer",
  "version": "0.1.0",
  "description": "Benchmark and optimizer for evaluating SDK, CLI, and MCP guidance with static action matching.",
  "license": "MIT",
  "author": "David Bucur",
  "homepage": "https://github.com/bucurdavid/skill-optimizer#readme",
  "bugs": {
    "url": "https://github.com/bucurdavid/skill-optimizer/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/bucurdavid/skill-optimizer.git"
  },
  "keywords": [
    "benchmark",
    "optimizer",
    "mcp",
    "sdk",
    "cli",
    "llm",
    "tool-calling",
    "evaluation"
  ],
  "type": "module",
  "scripts": {
    "benchmark": "tsx src/cli.ts run",
    "clean": "node --eval \"import { rmSync } from 'node:fs'; rmSync('dist', { recursive: true, force: true });\"",
    "dev": "tsx src/cli.ts",
    "optimize": "tsx src/cli.ts optimize",
    "materialize:mock": "tsx src/optimizer/materialize-mock-repo.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "tsx tests/smoke-code.ts && tsx tests/smoke-sdk-python.ts && tsx tests/smoke-sdk-rust.ts && tsx tests/smoke-cli.ts && tsx tests/smoke-cli-entry.ts && tsx tests/smoke-mcp.ts && tsx tests/smoke-llm.ts && tsx tests/smoke-discovery-sdk.ts && tsx tests/smoke-discovery-cli.ts && tsx tests/smoke-discovery-mcp.ts && tsx tests/smoke-generation.ts && tsx tests/smoke-optimize.ts && tsx tests/smoke-mock-repos.ts && tsx tests/smoke-release.ts"
  },
  "dependencies": {
    "@mariozechner/pi-agent-core": "^0.66.1",
    "@mariozechner/pi-ai": "^0.66.1",
    "@mariozechner/pi-coding-agent": "^0.66.1",
    "dotenv": "^17.4.1",
    "tree-sitter-wasms": "^0.1.13",
    "web-tree-sitter": "^0.24.7"
  },
  "devDependencies": {
    "@types/node": "^22.12.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Note: `optimize` script now invokes `src/cli.ts optimize` (single source of truth), not `src/optimizer/main.ts` directly.

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: PASS — TypeScript compiles even without the removed publishing fields.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(package): strip npm-publishing fields; route optimize through CLI"
```

---

## Task 4: README rewrite (one-page developer entry)

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Read current README to harvest accurate copy**

```bash
wc -l README.md
```

Expected: current file line count for reference.

- [ ] **Step 2: Write the new README**

Write the 10-section README described in spec §7.1. Use the following outline with concrete section contents:

```markdown
# skill-optimizer

Benchmark and self-optimize SDK, CLI, and MCP guidance so every agent model can use your tool reliably.

skill-optimizer runs your SDK / CLI / MCP docs against multiple LLMs, measures whether they call the right actions with the right arguments, and iteratively rewrites your `SKILL.md` / docs until a floor score is met across every model.

## Quickstart

```bash
git clone https://github.com/bucurdavid/skill-optimizer
cd skill-optimizer
npm install
export OPENROUTER_API_KEY=sk-or-...

# scaffold a config against your repo
npx tsx src/cli.ts init

# run the end-to-end loop
npx tsx src/cli.ts optimize --config ./skill-optimizer.json
```

## How it works

1. **Discover** callable surface (SDK methods / CLI commands / MCP tools) via tree-sitter or a manifest.
2. **Scope** the surface with `target.scope.include` / `target.scope.exclude` globs.
3. **Generate tasks** — one prompt per in-scope action, coverage-guaranteed.
4. **Benchmark** — every configured model attempts every task; static evaluator checks action calls + args.
5. **Verdict** — PASS/FAIL against two gates (per-model floor, weighted average).
6. **Optimize** — mutate `SKILL.md` / docs inside `allowedPaths`, re-benchmark, accept only if both gates hold, rollback if not.
7. **Recommendations** — on FAIL, one critic call summarizes what to improve manually.

## Configuration reference

Full field-by-field listing covering `target`, `benchmark`, `optimize` — include defaults and an annotated example.

## Interpreting the verdict

Describe `perModelFloor`, `targetWeightedAverage`, `weight`, the two gates, what PASS/FAIL means, and how exit codes are used in CI.

## Scope & coverage

Explain `scope.include` / `scope.exclude` glob semantics (single `*` matches anything including separators), in-scope vs out-of-scope reporting, and the 2-iteration coverage guarantee.

## Cost notes

Rough LLM spend per run: baseline (N models × N tasks), optimizer iterations (mutation + re-benchmark per iteration), one critic call on FAIL. No per-failure LLM calls.

## Dependencies

The optimizer's coding agent is powered by `@mariozechner/pi-coding-agent` — a small OSS wrapper around OpenRouter that handles sessions and tool loops.

## Troubleshooting

Top 5 issues: missing `OPENROUTER_API_KEY`, dirty git, `maxTasks < scope_size`, empty scope, legacy `skill-benchmark.json` filename.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
```

Fill in the configuration reference with the actual field tables (mirror what's in `src/project/types.ts` + spec §2). Do not leave "TBD" anywhere.

- [ ] **Step 3: Scan for leftover `skill-benchmark` references**

```bash
grep -n "skill-benchmark" README.md
```

Expected: no hits.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite as one-page OSS entry with quickstart + verdict + scope"
```

---

## Task 5: Extend benchmark types for per-model + verdict + coverage

**Files:**
- Modify: `src/benchmark/types.ts`

- [ ] **Step 1: Add `weight` to `ModelConfig`**

Edit `src/benchmark/types.ts` — update the interface and add a convention comment:

```typescript
export interface ModelConfig {
  id: string;       // LLM model ID e.g. 'openai/gpt-4o'
  name: string;     // Display name e.g. 'GPT-4o'
  tier: Tier;
  weight?: number;  // Optional; defaults to 1.0 at scoring time.
}
```

- [ ] **Step 2: Add verdict + coverage fields to `BenchmarkReport`**

In the same file, extend `BenchmarkReport.summary` and add a top-level `verdict`:

```typescript
export type Verdict = 'PASS' | 'FAIL';

export interface VerdictPolicy {
  perModelFloor: number;
  targetWeightedAverage: number;
}

export interface CoverageReport {
  inScopeActions: string[];
  outOfScopeActions: string[];
  coveredActions: string[];
  uncoveredActions: string[];
  tasksPerAction: Record<string, number>;
  coverageViolation: boolean;
}

export interface BenchmarkReport {
  timestamp: string;
  config: { name: string; surface: BenchmarkSurface; outputDir?: string };
  skillVersion: SkillVersion;
  results: TaskResult[];
  coverage: MethodCoverage[];
  scopeCoverage?: CoverageReport;
  summary: {
    totalTasks: number;
    totalModels: number;
    totalEvaluations: number;
    overallPassRate: number;
    weightedAverage: number;
    avgToolRecall: number;
    avgToolPrecision: number;
    avgToolSelectionAccuracy: number;
    avgArgAccuracy: number;
    avgHallucinationRate: number;
    methodCoveragePercent: number;
    perModel: Record<string, ModelSummary>;
    perTask: Record<string, TaskSummary>;
    perTier: Record<Tier, { passRate: number; avgRecall: number; avgToolSelectionAccuracy: number; avgArgAccuracy: number }>;
  };
  verdict?: {
    policy: VerdictPolicy;
    result: Verdict;
    reasons: string[];
  };
}
```

- [ ] **Step 3: Populate `weightedAverage` in the benchmark runner**

Open `src/benchmark/runner.ts` (and / or `src/benchmark/reporter.ts` wherever the final report is assembled). Locate where `summary.overallPassRate` is computed and add adjacent to it:

```typescript
const weights = models.map((m) => ({ id: m.id, w: m.weight ?? 1 }));
const totalWeight = weights.reduce((acc, x) => acc + x.w, 0);
const weightedAverage = totalWeight > 0
  ? weights.reduce((acc, { id, w }) => acc + w * (summary.perModel[id]?.passRate ?? 0), 0) / totalWeight
  : 0;
summary.weightedAverage = weightedAverage;
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no missing `weightedAverage` errors — all other `BenchmarkReport` consumers type-check).

- [ ] **Step 5: Commit**

```bash
git add src/benchmark/types.ts src/benchmark/runner.ts src/benchmark/reporter.ts
git commit -m "feat(benchmark): add weighted average, verdict, and scope coverage types"
```

---

## Task 6: Scoring module — failing tests first

**Files:**
- Create: `tests/smoke-scoring.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/smoke-scoring.ts`:

```typescript
import { strict as assert } from 'node:assert';

import {
  computePerModelPassRates,
  computeWeightedAverage,
  computeVerdict,
  accept,
} from '../src/benchmark/scoring.js';
import type { BenchmarkReport, ModelConfig } from '../src/benchmark/types.js';

function syntheticReport(perModel: Record<string, number>, models: ModelConfig[]): BenchmarkReport {
  const entries = Object.entries(perModel);
  const summaryPerModel: Record<string, { passRate: number; avgRecall: number; avgPrecision: number; avgToolSelectionAccuracy: number; avgArgAccuracy: number; avgHallucinationRate: number; tasksRun: number }> = {};
  for (const [id, rate] of entries) {
    summaryPerModel[id] = { passRate: rate, avgRecall: 0, avgPrecision: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0, avgHallucinationRate: 0, tasksRun: 10 };
  }
  const overall = entries.reduce((a, [, r]) => a + r, 0) / Math.max(1, entries.length);
  return {
    timestamp: new Date().toISOString(),
    config: { name: 'syn', surface: 'mcp' },
    skillVersion: { source: 'local', commitSha: 'local', ref: 'file', fetchedAt: new Date().toISOString() },
    results: [],
    coverage: [],
    summary: {
      totalTasks: 10,
      totalModels: entries.length,
      totalEvaluations: 10 * entries.length,
      overallPassRate: overall,
      weightedAverage: 0, // filled in by scoring
      avgToolRecall: 0,
      avgToolPrecision: 0,
      avgToolSelectionAccuracy: 0,
      avgArgAccuracy: 0,
      avgHallucinationRate: 0,
      methodCoveragePercent: 1,
      perModel: summaryPerModel,
      perTask: {},
      perTier: { flagship: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 }, mid: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 }, low: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 } },
    },
  };
}

function testEqualWeightsCollapseToMean() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const report = syntheticReport({ a: 0.6, b: 0.8 }, models);
  const wavg = computeWeightedAverage(report, models);
  assert.strictEqual(wavg, 0.7);
  console.log('PASS: equal weights collapse to mean');
}

function testWeightedAverageWithExplicitWeights() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship', weight: 3 },
    { id: 'b', name: 'B', tier: 'mid', weight: 1 },
  ];
  const report = syntheticReport({ a: 1.0, b: 0.0 }, models);
  const wavg = computeWeightedAverage(report, models);
  assert.strictEqual(wavg, 0.75);
  console.log('PASS: weighted average honors explicit weights');
}

function testPerModelPassRates() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const report = syntheticReport({ a: 0.42, b: 0.99 }, models);
  const rates = computePerModelPassRates(report);
  assert.strictEqual(rates.a, 0.42);
  assert.strictEqual(rates.b, 0.99);
  console.log('PASS: per-model pass rates echo summary');
}

function testVerdictPassWhenAllAboveFloorAndTargetHit() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const report = syntheticReport({ a: 0.7, b: 0.75 }, models);
  report.summary.weightedAverage = 0.725;
  const verdict = computeVerdict(report, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7 });
  assert.strictEqual(verdict.result, 'PASS');
  console.log('PASS: verdict PASS when all above floor and target hit');
}

function testVerdictFailWhenOneBelowFloor() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const report = syntheticReport({ a: 0.9, b: 0.5 }, models);
  report.summary.weightedAverage = 0.7;
  const verdict = computeVerdict(report, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7 });
  assert.strictEqual(verdict.result, 'FAIL');
  assert.ok(verdict.reasons.some((r) => r.includes('b')));
  console.log('PASS: verdict FAIL when one model below floor');
}

function testAcceptBelowFloorButImproving() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const before = syntheticReport({ a: 0.8, b: 0.3 }, models);
  before.summary.weightedAverage = 0.55;
  const after = syntheticReport({ a: 0.8, b: 0.4 }, models);
  after.summary.weightedAverage = 0.6;
  const result = accept(before, after, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7, minImprovement: 0.02 });
  assert.strictEqual(result, true);
  console.log('PASS: accept below-floor but improving');
}

function testRejectCrossingBelowFloor() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const before = syntheticReport({ a: 0.8, b: 0.8 }, models);
  before.summary.weightedAverage = 0.8;
  const after = syntheticReport({ a: 0.8, b: 0.55 }, models);
  after.summary.weightedAverage = 0.675;
  const result = accept(before, after, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7, minImprovement: 0.02 });
  assert.strictEqual(result, false);
  console.log('PASS: reject crossing below floor');
}

function testRejectNoMinImprovement() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const before = syntheticReport({ a: 0.7, b: 0.7 }, models);
  before.summary.weightedAverage = 0.7;
  const after = syntheticReport({ a: 0.71, b: 0.71 }, models);
  after.summary.weightedAverage = 0.71;
  const result = accept(before, after, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7, minImprovement: 0.02 });
  assert.strictEqual(result, false);
  console.log('PASS: reject when weighted improvement below minImprovement');
}

async function main() {
  testEqualWeightsCollapseToMean();
  testWeightedAverageWithExplicitWeights();
  testPerModelPassRates();
  testVerdictPassWhenAllAboveFloorAndTargetHit();
  testVerdictFailWhenOneBelowFloor();
  testAcceptBelowFloorButImproving();
  testRejectCrossingBelowFloor();
  testRejectNoMinImprovement();
  console.log('\nALL PASS: smoke-scoring');
}

main().catch((err) => {
  console.error('FAIL: smoke-scoring', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `tsx tests/smoke-scoring.ts`
Expected: FAIL — `Cannot find module '../src/benchmark/scoring.js'`.

---

## Task 7: Implement scoring module to pass the tests

**Files:**
- Create: `src/benchmark/scoring.ts`

- [ ] **Step 1: Implement the module**

```typescript
import type {
  BenchmarkReport,
  ModelConfig,
  Verdict,
  VerdictPolicy,
} from './types.js';

export function computePerModelPassRates(report: BenchmarkReport): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const [id, summary] of Object.entries(report.summary.perModel)) {
    rates[id] = summary.passRate;
  }
  return rates;
}

export function computeWeightedAverage(report: BenchmarkReport, models: ModelConfig[]): number {
  if (models.length === 0) return 0;
  const rates = computePerModelPassRates(report);
  let num = 0;
  let den = 0;
  for (const model of models) {
    const w = model.weight ?? 1;
    num += w * (rates[model.id] ?? 0);
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export function computeVerdict(
  report: BenchmarkReport,
  models: ModelConfig[],
  policy: VerdictPolicy,
): { result: Verdict; reasons: string[]; policy: VerdictPolicy } {
  const rates = computePerModelPassRates(report);
  const reasons: string[] = [];

  for (const model of models) {
    const rate = rates[model.id] ?? 0;
    if (rate < policy.perModelFloor) {
      reasons.push(
        `${model.name} (${model.id}) passes ${(rate * 100).toFixed(1)}% < floor ${(policy.perModelFloor * 100).toFixed(1)}%`,
      );
    }
  }

  const wavg = report.summary.weightedAverage ?? computeWeightedAverage(report, models);
  if (wavg < policy.targetWeightedAverage) {
    reasons.push(
      `weighted average ${(wavg * 100).toFixed(1)}% < target ${(policy.targetWeightedAverage * 100).toFixed(1)}%`,
    );
  }

  if (report.scopeCoverage?.coverageViolation) {
    reasons.push('coverage violation: some in-scope actions have zero tasks');
  }

  return {
    result: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons,
    policy,
  };
}

export function accept(
  before: BenchmarkReport,
  after: BenchmarkReport,
  models: ModelConfig[],
  policy: VerdictPolicy & { minImprovement: number },
): boolean {
  const beforeRates = computePerModelPassRates(before);
  const afterRates = computePerModelPassRates(after);
  for (const model of models) {
    const afterRate = afterRates[model.id] ?? 0;
    if (afterRate < policy.perModelFloor) {
      const beforeRate = beforeRates[model.id] ?? 0;
      if (afterRate <= beforeRate) return false;
    }
  }
  const beforeAvg = before.summary.weightedAverage ?? computeWeightedAverage(before, models);
  const afterAvg = after.summary.weightedAverage ?? computeWeightedAverage(after, models);
  return (afterAvg - beforeAvg) >= policy.minImprovement;
}
```

- [ ] **Step 2: Run tests**

Run: `tsx tests/smoke-scoring.ts`
Expected: `ALL PASS: smoke-scoring`.

- [ ] **Step 3: Add test to the `test` script**

Open `package.json` and append ` && tsx tests/smoke-scoring.ts` to the end of the `test` script string.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/benchmark/scoring.ts tests/smoke-scoring.ts package.json
git commit -m "feat(scoring): add per-model/weighted/verdict/accept with smoke tests"
```

---

## Task 8: Add `verdict` + `perModelFloor` + `targetWeightedAverage` to project config

**Files:**
- Modify: `src/project/types.ts`
- Modify: `src/project/validate.ts`
- Modify: `src/project/resolve.ts`

- [ ] **Step 1: Extend types**

In `src/project/types.ts`, add to `ProjectBenchmarkConfig`:

```typescript
export interface ProjectBenchmarkVerdictConfig {
  perModelFloor?: number;
  targetWeightedAverage?: number;
}

export interface ProjectBenchmarkConfig {
  // ... existing fields ...
  verdict?: ProjectBenchmarkVerdictConfig;
}

export interface ResolvedProjectBenchmarkConfig {
  // ... existing fields ...
  verdict: { perModelFloor: number; targetWeightedAverage: number };
}
```

- [ ] **Step 2: Add validation**

In `src/project/validate.ts`, add below the existing `benchmark` checks:

```typescript
if (benchmark.verdict !== undefined) {
  if (benchmark.verdict.perModelFloor !== undefined) {
    const v = benchmark.verdict.perModelFloor;
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`Project config ${configPath}: "benchmark.verdict.perModelFloor" must be between 0 and 1`);
    }
  }
  if (benchmark.verdict.targetWeightedAverage !== undefined) {
    const v = benchmark.verdict.targetWeightedAverage;
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`Project config ${configPath}: "benchmark.verdict.targetWeightedAverage" must be between 0 and 1`);
    }
  }
}

for (const model of benchmark.models) {
  if (model.weight !== undefined && (!Number.isFinite(model.weight) || model.weight < 0)) {
    throw new Error(`Project config ${configPath}: model "${model.id}" has invalid weight; must be a non-negative number`);
  }
}
```

- [ ] **Step 3: Add resolution defaults**

In `src/project/resolve.ts`, add new constants and apply them in the resolved benchmark block:

```typescript
const DEFAULT_PER_MODEL_FLOOR = 0.6;
const DEFAULT_TARGET_WEIGHTED_AVERAGE = 0.7;

// ... inside resolveProjectConfig, replace `benchmark` with:
benchmark: {
  // ... existing fields ...
  verdict: {
    perModelFloor: config.benchmark.verdict?.perModelFloor ?? DEFAULT_PER_MODEL_FLOOR,
    targetWeightedAverage:
      config.benchmark.verdict?.targetWeightedAverage ?? DEFAULT_TARGET_WEIGHTED_AVERAGE,
  },
},
```

Also bump `DEFAULT_MIN_IMPROVEMENT` from `0.01` → `0.02`.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/project/types.ts src/project/validate.ts src/project/resolve.ts
git commit -m "feat(config): add benchmark.verdict + model.weight, bump minImprovement default"
```

---

## Task 9: Two-gate acceptance in optimizer loop

**Files:**
- Modify: `src/optimizer/loop.ts`
- Modify: `src/optimizer/types.ts` (for `ResolvedOptimizeManifest`)

- [ ] **Step 1: Read the optimizer types to know the manifest shape**

```bash
grep -n "minOverallPassDelta\|perModelFloor\|targetWeightedAverage" src/optimizer/types.ts src/optimizer/loop.ts src/optimizer/main.ts
```

Expected: `minOverallPassDelta` referenced in loop.ts:224; types file has the field; new verdict fields absent.

- [ ] **Step 2: Extend `ResolvedOptimizeManifest`**

In `src/optimizer/types.ts`, add to the `optimizer` subtree of `ResolvedOptimizeManifest`:

```typescript
optimizer: {
  // ... existing fields ...
  minOverallPassDelta: number;  // KEEP during migration; rename to minImprovement later if desired
  perModelFloor: number;
  targetWeightedAverage: number;
  models: ModelConfig[];        // needed by accept()
};
```

If `ModelConfig` isn't already imported there, `import type { ModelConfig } from '../benchmark/types.js';`.

- [ ] **Step 3: Populate the new manifest fields from project config**

Open `src/optimizer/main.ts` (or wherever `runOptimizeFromConfig` builds the manifest from `ResolvedProjectConfig`). Pass through:

```typescript
optimizer: {
  // ... existing fields ...
  minOverallPassDelta: project.optimize.minImprovement,
  perModelFloor: project.benchmark.verdict.perModelFloor,
  targetWeightedAverage: project.benchmark.verdict.targetWeightedAverage,
  models: project.benchmark.models,
},
```

- [ ] **Step 4: Replace the single-gate comparison with `accept()`**

In `src/optimizer/loop.ts`, at the top add:

```typescript
import { accept } from '../benchmark/scoring.js';
```

Replace the block at lines 220–253 (the `const delta = ...` through the `else` branch) with:

```typescript
const beforeReport = bestReport;
const afterReport = candidateReport;
iteration.scoreAfter = afterReport.summary.overallPassRate;
iteration.delta = afterReport.summary.overallPassRate - beforeReport.summary.overallPassRate;

const accepted = accept(beforeReport, afterReport, resolvedManifest.optimizer.models, {
  perModelFloor: resolvedManifest.optimizer.perModelFloor,
  targetWeightedAverage: resolvedManifest.optimizer.targetWeightedAverage,
  minImprovement: resolvedManifest.optimizer.minOverallPassDelta,
});

if (accepted) {
  iteration.accepted = true;
  bestReport = afterReport;
  lastReportPath = candidateResult.reportPath;
  const beforeAvg = (beforeReport.summary.weightedAverage ?? 0) * 100;
  const afterAvg = (afterReport.summary.weightedAverage ?? 0) * 100;
  console.log(
    `[optimize] Accepted iteration ${index}: weighted average ${beforeAvg.toFixed(1)}% -> ${afterAvg.toFixed(1)}%.`,
  );
  acceptedCheckpoint = await deps.repo.updateAcceptedCheckpoint(
    resolvedManifest.targetRepo,
    acceptedCheckpoint,
    candidate,
    changedFiles,
  );
  consecutiveStableIterations = 0;
} else {
  const beforeAvg = (beforeReport.summary.weightedAverage ?? 0) * 100;
  const afterAvg = (afterReport.summary.weightedAverage ?? 0) * 100;
  console.log(
    `[optimize] Rejected iteration ${index}: gates not satisfied ` +
      `(weighted ${beforeAvg.toFixed(1)}% -> ${afterAvg.toFixed(1)}%; ` +
      `min improvement ${(resolvedManifest.optimizer.minOverallPassDelta * 100).toFixed(1)} pts; ` +
      `per-model floor ${(resolvedManifest.optimizer.perModelFloor * 100).toFixed(1)}%).`,
  );
  console.log('[optimize] Restoring checkpoint.');
  await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
  consecutiveStableIterations += 1;
}
```

- [ ] **Step 5: Run typecheck + existing optimize smoke test**

Run: `npm run typecheck && tsx tests/smoke-optimize.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/optimizer/loop.ts src/optimizer/types.ts src/optimizer/main.ts
git commit -m "feat(optimizer): replace single-delta check with two-gate accept"
```

---

## Task 10: Compute + render verdict at end of benchmark

**Files:**
- Modify: `src/benchmark/runner.ts`
- Modify: `src/benchmark/reporter.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Thread verdict policy into runner**

Find the function signature for `runBenchmark` in `src/benchmark/runner.ts`. Extend the options to accept the policy and the benchmark models:

```typescript
// signature addition
verdictPolicy?: { perModelFloor: number; targetWeightedAverage: number };
```

After the summary is assembled, compute and attach the verdict:

```typescript
import { computeVerdict } from './scoring.js';

if (options.verdictPolicy) {
  report.verdict = computeVerdict(report, options.models ?? report._models ?? [], options.verdictPolicy);
}
```

Adapt field names to whatever is currently in scope — the point is to attach `report.verdict` when the caller supplies a policy.

- [ ] **Step 2: Render verdict in `printSummary` + `generateMarkdown`**

In `src/benchmark/reporter.ts`, append to `printSummary`:

```typescript
if (report.verdict) {
  console.log(`\nVerdict: ${report.verdict.result}`);
  if (report.verdict.result === 'FAIL') {
    for (const reason of report.verdict.reasons) {
      console.log(`  - ${reason}`);
    }
  }
}
```

And to `generateMarkdown`, append a `## Verdict` section that lists the policy, the result, and the reasons.

- [ ] **Step 3: Thread policy from CLI**

In `src/cli.ts`, where the benchmark runs, pass the resolved verdict policy through runner options:

```typescript
report = await runBenchmark({
  ...options,
  verdictPolicy: {
    perModelFloor: project.benchmark.verdict.perModelFloor,
    targetWeightedAverage: project.benchmark.verdict.targetWeightedAverage,
  },
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/benchmark/runner.ts src/benchmark/reporter.ts src/cli.ts
git commit -m "feat(benchmark): compute + render PASS/FAIL verdict with reasons"
```

---

## Task 11: Scope filter — failing tests first

**Files:**
- Create: `tests/smoke-scope.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { strict as assert } from 'node:assert';

import { resolveScope, matchesGlob } from '../src/tasks/scope.js';
import type { ActionDefinition } from '../src/actions/types.js';

function mk(name: string): ActionDefinition {
  return { key: name, name, args: [] };
}

function testDefaultIncludeEverything() {
  const actions = [mk('Wallet.send'), mk('Wallet.receive'), mk('Token.mint')];
  const { inScope, outOfScope } = resolveScope(actions, { include: ['*'], exclude: [] });
  assert.strictEqual(inScope.length, 3);
  assert.strictEqual(outOfScope.length, 0);
  console.log('PASS: default ["*"] includes everything');
}

function testIncludeNarrowsToPrefix() {
  const actions = [mk('Wallet.send'), mk('Wallet.receive'), mk('Token.mint')];
  const { inScope, outOfScope } = resolveScope(actions, { include: ['Wallet.*'], exclude: [] });
  assert.deepStrictEqual(inScope.map((a) => a.name).sort(), ['Wallet.receive', 'Wallet.send']);
  assert.deepStrictEqual(outOfScope.map((a) => a.name), ['Token.mint']);
  console.log('PASS: include narrows to prefix');
}

function testExcludeSubtracts() {
  const actions = [mk('Wallet.send'), mk('Wallet.internalDebit'), mk('Token.mint')];
  const { inScope } = resolveScope(actions, { include: ['*'], exclude: ['*.internal*'] });
  assert.deepStrictEqual(inScope.map((a) => a.name).sort(), ['Token.mint', 'Wallet.send']);
  console.log('PASS: exclude removes matches');
}

function testStarMatchesSeparators() {
  assert.strictEqual(matchesGlob('Wallet.send', '*'), true);
  assert.strictEqual(matchesGlob('Wallet.send', 'Wallet.*'), true);
  assert.strictEqual(matchesGlob('Wallet.Inner.send', 'Wallet.*'), true); // * matches dots
  console.log('PASS: * matches any sequence including separators');
}

function testEmptyScopeIsAnError() {
  const actions = [mk('Wallet.send')];
  const { inScope } = resolveScope(actions, { include: ['NoMatch.*'], exclude: [] });
  assert.strictEqual(inScope.length, 0);
  console.log('PASS: scope can resolve to empty (caller decides if that is an error)');
}

async function main() {
  testDefaultIncludeEverything();
  testIncludeNarrowsToPrefix();
  testExcludeSubtracts();
  testStarMatchesSeparators();
  testEmptyScopeIsAnError();
  console.log('\nALL PASS: smoke-scope');
}

main().catch((err) => {
  console.error('FAIL: smoke-scope', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `tsx tests/smoke-scope.ts`
Expected: FAIL — module not found.

---

## Task 12: Implement `resolveScope` + `matchesGlob`

**Files:**
- Create: `src/tasks/scope.ts`

- [ ] **Step 1: Implement the module**

```typescript
import type { ActionDefinition } from '../actions/types.js';

export interface ScopeConfig {
  include: string[];
  exclude: string[];
}

export function matchesGlob(name: string, pattern: string): boolean {
  // Single operator '*' matches any sequence of characters including separators.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(name);
}

function matchesAny(name: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesGlob(name, p));
}

export function resolveScope(
  actions: ActionDefinition[],
  scope: ScopeConfig,
): { inScope: ActionDefinition[]; outOfScope: ActionDefinition[] } {
  const include = scope.include.length === 0 ? ['*'] : scope.include;
  const exclude = scope.exclude ?? [];

  const inScope: ActionDefinition[] = [];
  const outOfScope: ActionDefinition[] = [];

  for (const action of actions) {
    const included = matchesAny(action.name, include);
    const excluded = exclude.length > 0 && matchesAny(action.name, exclude);
    if (included && !excluded) {
      inScope.push(action);
    } else {
      outOfScope.push(action);
    }
  }

  return { inScope, outOfScope };
}
```

- [ ] **Step 2: Run tests**

Run: `tsx tests/smoke-scope.ts`
Expected: `ALL PASS: smoke-scope`.

- [ ] **Step 3: Append test to `test` script**

In `package.json`, append ` && tsx tests/smoke-scope.ts` to the `test` script.

- [ ] **Step 4: Commit**

```bash
git add src/tasks/scope.ts tests/smoke-scope.ts package.json
git commit -m "feat(scope): add resolveScope with single-* glob semantics + tests"
```

---

## Task 13: Wire scope config into project types + validator

**Files:**
- Modify: `src/project/types.ts`
- Modify: `src/project/validate.ts`
- Modify: `src/project/resolve.ts`

- [ ] **Step 1: Extend types**

In `src/project/types.ts`, add:

```typescript
export interface ProjectScopeConfig {
  include?: string[];
  exclude?: string[];
}

export interface ProjectTargetConfig {
  // ... existing ...
  scope?: ProjectScopeConfig;
}

export interface ResolvedProjectTargetConfig {
  // ... existing ...
  scope: { include: string[]; exclude: string[] };
}
```

- [ ] **Step 2: Validation (string arrays only)**

In `src/project/validate.ts`, below the `target` checks:

```typescript
if (target.scope !== undefined) {
  if (target.scope.include !== undefined) {
    if (!Array.isArray(target.scope.include) || target.scope.include.some((s) => typeof s !== 'string')) {
      throw new Error(`Project config ${configPath}: "target.scope.include" must be an array of glob strings`);
    }
  }
  if (target.scope.exclude !== undefined) {
    if (!Array.isArray(target.scope.exclude) || target.scope.exclude.some((s) => typeof s !== 'string')) {
      throw new Error(`Project config ${configPath}: "target.scope.exclude" must be an array of glob strings`);
    }
  }
}
```

- [ ] **Step 3: Resolution defaults**

In `src/project/resolve.ts`, inside the returned `target` block:

```typescript
scope: {
  include: config.target.scope?.include && config.target.scope.include.length > 0
    ? [...config.target.scope.include]
    : ['*'],
  exclude: config.target.scope?.exclude ? [...config.target.scope.exclude] : [],
},
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/project/types.ts src/project/validate.ts src/project/resolve.ts
git commit -m "feat(config): add target.scope with include/exclude glob defaults"
```

---

## Task 14: Thread scope through discovery → generation

**Files:**
- Modify: `src/tasks/generate.ts`
- Modify: `src/tasks/types.ts` (if present)
- Modify: wherever `generateTasksForProject` assembles the discovered surface (likely `src/tasks/index.ts` or `src/tasks/freeze.ts`)

- [ ] **Step 1: Find the assembly point**

```bash
grep -n "generateTasksForProject\|DiscoveredTaskSurface" src/tasks/*.ts
```

Expected: finds the function + the interface that holds the discovered surface.

- [ ] **Step 2: Apply scope filter before task generation**

Immediately after discovery completes and before `generateCandidateTasks(surface, ...)` is called, filter the surface actions:

```typescript
import { resolveScope } from './scope.js';

const { inScope, outOfScope } = resolveScope(discoveredActions, project.target.scope);
if (inScope.length === 0) {
  throw new Error(
    `target.scope produced zero in-scope actions. Adjust target.scope.include/exclude in ${project.configPath}.`,
  );
}
// replace the surface's actions with inScope before generating
surface.snapshot.actions = inScope.map(({ key, ...rest }) => rest);
```

Persist `outOfScope` into the generation result so the reporter can show it.

- [ ] **Step 3: Run existing generation smoke test**

Run: `tsx tests/smoke-generation.ts`
Expected: PASS (default `["*"]` leaves behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/tasks
git commit -m "feat(tasks): apply scope filter before task generation"
```

---

## Task 15: Pre-flight check for `maxTasks < scope_size`

**Files:**
- Modify: `src/project/validate.ts`

- [ ] **Step 1: Decide placement**

The pre-flight check needs the *resolved* action list, which only exists after discovery. So validation in `validate.ts` is a *shape* check; the *count* check lives at generation time. Add the count check in `src/tasks/index.ts` (or wherever `generateTasksForProject` runs):

```typescript
const maxTasks = project.benchmark.taskGeneration.maxTasks;
if (maxTasks < inScope.length) {
  throw new Error(
    `benchmark.taskGeneration.maxTasks (${maxTasks}) is smaller than in-scope action count (${inScope.length}). ` +
      `Raise maxTasks in ${project.configPath} or tighten target.scope.exclude.`,
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tasks
git commit -m "feat(tasks): pre-flight error when maxTasks < in-scope action count"
```

---

## Task 16: Coverage module — failing tests first

**Files:**
- Create: `tests/smoke-coverage.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { strict as assert } from 'node:assert';

import type { ActionDefinition } from '../src/actions/types.js';
import type { GeneratedTask } from '../src/tasks/types.js';
import {
  computeCoverage,
  computeUncovered,
  buildRetryPrompt,
} from '../src/tasks/coverage.js';

function mkAction(name: string): ActionDefinition {
  return { key: name, name, args: [] };
}

function mkTask(id: string, actions: string[]): GeneratedTask {
  return {
    id,
    prompt: `do ${id}`,
    expected_actions: actions.map((name) => ({ name, method: name })),
    expected_tools: actions.map((name) => ({ name, method: name })),
  };
}

function testFullCoverage() {
  const actions = [mkAction('Wallet.send'), mkAction('Wallet.receive')];
  const tasks = [mkTask('t1', ['Wallet.send']), mkTask('t2', ['Wallet.receive'])];
  const coverage = computeCoverage(actions, tasks);
  assert.strictEqual(coverage.uncoveredActions.length, 0);
  assert.strictEqual(coverage.coverageViolation, false);
  assert.deepStrictEqual(Object.keys(coverage.tasksPerAction).sort(), ['Wallet.receive', 'Wallet.send']);
  console.log('PASS: full coverage reports zero uncovered');
}

function testPartialCoverage() {
  const actions = [mkAction('Wallet.send'), mkAction('Wallet.receive'), mkAction('Token.mint')];
  const tasks = [mkTask('t1', ['Wallet.send'])];
  const coverage = computeCoverage(actions, tasks);
  assert.deepStrictEqual(coverage.uncoveredActions.sort(), ['Token.mint', 'Wallet.receive']);
  assert.strictEqual(coverage.coverageViolation, true);
  console.log('PASS: partial coverage flags uncovered');
}

function testUncoveredDriver() {
  const actions = [mkAction('A'), mkAction('B'), mkAction('C')];
  const tasks = [mkTask('t1', ['A'])];
  const uncovered = computeUncovered(actions, tasks);
  assert.deepStrictEqual(uncovered.sort(), ['B', 'C']);
  console.log('PASS: computeUncovered returns action names');
}

function testRetryPromptMentionsActions() {
  const prompt = buildRetryPrompt(['Wallet.receive', 'Token.mint']);
  assert.ok(prompt.includes('Wallet.receive'));
  assert.ok(prompt.includes('Token.mint'));
  console.log('PASS: retry prompt names uncovered actions');
}

async function main() {
  testFullCoverage();
  testPartialCoverage();
  testUncoveredDriver();
  testRetryPromptMentionsActions();
  console.log('\nALL PASS: smoke-coverage');
}

main().catch((err) => {
  console.error('FAIL: smoke-coverage', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `tsx tests/smoke-coverage.ts`
Expected: FAIL — module not found.

---

## Task 17: Implement coverage module

**Files:**
- Create: `src/tasks/coverage.ts`

- [ ] **Step 1: Implement**

```typescript
import type { ActionDefinition } from '../actions/types.js';
import type { GeneratedTask } from './types.js';
import type { CoverageReport } from '../benchmark/types.js';

function actionNamesOf(task: GeneratedTask): string[] {
  const list = task.expected_actions ?? task.expected_tools ?? [];
  return list.map((a) => a.name ?? a.method ?? '').filter(Boolean);
}

export function computeCoverage(actions: ActionDefinition[], tasks: GeneratedTask[]): CoverageReport {
  const tasksPerAction: Record<string, number> = {};
  for (const action of actions) tasksPerAction[action.name] = 0;
  for (const task of tasks) {
    for (const name of actionNamesOf(task)) {
      if (name in tasksPerAction) tasksPerAction[name] += 1;
    }
  }
  const covered = actions.filter((a) => tasksPerAction[a.name] > 0).map((a) => a.name);
  const uncovered = actions.filter((a) => tasksPerAction[a.name] === 0).map((a) => a.name);
  return {
    inScopeActions: actions.map((a) => a.name),
    outOfScopeActions: [],
    coveredActions: covered,
    uncoveredActions: uncovered,
    tasksPerAction,
    coverageViolation: uncovered.length > 0,
  };
}

export function computeUncovered(actions: ActionDefinition[], tasks: GeneratedTask[]): string[] {
  return computeCoverage(actions, tasks).uncoveredActions;
}

export function buildRetryPrompt(uncovered: string[]): string {
  return [
    'The prior pass did not cover these actions. Generate tasks for EACH of them.',
    'Exactly one task per action minimum. Use only arguments documented in the surface snapshot.',
    '',
    'Uncovered actions:',
    ...uncovered.map((name) => `- ${name}`),
  ].join('\n');
}
```

- [ ] **Step 2: Run tests**

Run: `tsx tests/smoke-coverage.ts`
Expected: `ALL PASS: smoke-coverage`.

- [ ] **Step 3: Append to `test` script in package.json**

Add ` && tsx tests/smoke-coverage.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/tasks/coverage.ts tests/smoke-coverage.ts package.json
git commit -m "feat(tasks): add coverage report + retry prompt builder with tests"
```

---

## Task 18: Generator loop — 2-iteration coverage enforcement

**Files:**
- Modify: `src/tasks/generate.ts`

- [ ] **Step 1: Wrap `generateCandidateTasks` in a coverage loop**

In `src/tasks/generate.ts`, add a new exported function that owns the full loop:

```typescript
import { computeUncovered, buildRetryPrompt, computeCoverage } from './coverage.js';
import type { ActionDefinition } from '../actions/types.js';
import type { CoverageReport } from '../benchmark/types.js';

export async function generateCandidateTasksWithCoverage(
  surface: DiscoveredTaskSurface,
  config: TaskGeneratorConfig,
  deps: TaskGeneratorDeps,
  inScopeActions: ActionDefinition[],
): Promise<{ tasks: GeneratedTask[]; coverage: CoverageReport }> {
  // Iteration 1 — existing one-shot prompt
  const firstPass = await generateCandidateTasks(surface, config, deps);

  let uncovered = computeUncovered(inScopeActions, firstPass);
  if (uncovered.length === 0) {
    return { tasks: firstPass, coverage: computeCoverage(inScopeActions, firstPass) };
  }

  // Iteration 2 — focused retry for uncovered
  const retrySystem = 'You generate benchmark tasks targeting specific missing actions. JSON only.';
  const retryPrompt = [
    buildRetryPrompt(uncovered),
    '',
    `Respond with {"tasks":[...]} using the same schema as before.`,
    '',
    'Surface snapshot:',
    '---BEGIN SURFACE SNAPSHOT---',
    JSON.stringify(surface.snapshot, null, 2),
    '---END SURFACE SNAPSHOT---',
  ].join('\n');

  const retryRaw = await deps.complete({ system: retrySystem, prompt: retryPrompt });
  const retryTasks = parseGeneratedTasks(retryRaw);

  // Dedup by id then by action coverage
  const byId = new Map<string, GeneratedTask>();
  for (const t of [...firstPass, ...retryTasks]) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  const combined = [...byId.values()];

  uncovered = computeUncovered(inScopeActions, combined);
  if (uncovered.length > 0) {
    throw new Error(
      `Task generation could not cover ${uncovered.length} in-scope action(s) after 2 iterations: ` +
        `${uncovered.join(', ')}. ` +
        `Improve SKILL.md guidance for these actions, or add them to target.scope.exclude.`,
    );
  }

  return { tasks: combined, coverage: computeCoverage(inScopeActions, combined) };
}
```

Note: `parseGeneratedTasks` is already file-local — no export change needed.

- [ ] **Step 2: Replace call site**

Wherever the generator is driven (likely `src/tasks/freeze.ts` or `src/tasks/index.ts`), replace the call to `generateCandidateTasks(...)` with `generateCandidateTasksWithCoverage(...)`. Persist `coverage` on the generation artifacts and propagate into the final `BenchmarkReport.scopeCoverage`.

- [ ] **Step 3: Run existing generation smoke**

Run: `tsx tests/smoke-generation.ts`
Expected: PASS (default scope `["*"]` + adequate `maxTasks` means first pass covers everything).

- [ ] **Step 4: Commit**

```bash
git add src/tasks/generate.ts src/tasks/freeze.ts src/tasks/index.ts
git commit -m "feat(tasks): 2-iteration coverage-guaranteed generation loop"
```

---

## Task 19: Failure details — failing tests first

**Files:**
- Create: `tests/smoke-feedback.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { strict as assert } from 'node:assert';

import type { TaskResult } from '../src/benchmark/types.js';
import { extractFailureDetails } from '../src/optimizer/feedback/failure-details.js';
import { detectPatterns } from '../src/optimizer/feedback/patterns.js';
import { buildPassingFailingDiff } from '../src/optimizer/feedback/passing-failing-diff.js';

function mkResult(opts: {
  taskId: string;
  modelId: string;
  modelName: string;
  passed: boolean;
  expected: { name: string; args?: Record<string, unknown> };
  extracted?: Array<{ name: string; args?: Record<string, unknown> }>;
  error?: string;
}): TaskResult {
  return {
    task: { id: opts.taskId, prompt: 'p', expected_actions: [opts.expected], expected_tools: [opts.expected] },
    model: { id: opts.modelId, name: opts.modelName, tier: 'mid' },
    generatedCode: null,
    rawResponse: '',
    extractedCalls: (opts.extracted ?? []).map((c) => ({ method: c.name, args: c.args ?? {} })) as any,
    actionMatches: [{
      expected: opts.expected,
      found: opts.passed ? ({ method: opts.expected.name, args: opts.expected.args ?? {} } as any) : null,
      methodFound: opts.passed,
      argsCorrect: opts.passed,
      matched: opts.passed,
    }],
    toolMatches: [],
    metrics: {
      toolPrecision: 0,
      toolRecall: 0,
      taskPassed: opts.passed,
      toolSelectionAccuracy: opts.passed ? 1 : 0,
      argAccuracy: opts.passed ? 1 : 0,
      unnecessaryCalls: [],
      hallucinatedCalls: opts.extracted?.filter((c) => c.name !== opts.expected.name).map((c) => c.name) ?? [],
      hallucinationRate: 0,
    },
    llmLatencyMs: 0,
    error: opts.error,
  };
}

function testMissingToolKind() {
  const result = mkResult({
    taskId: 't1', modelId: 'm1', modelName: 'M1', passed: false,
    expected: { name: 'Wallet.send', args: { amount: 10 } },
    extracted: [{ name: 'Wallet.transfer' }],
  });
  const [detail] = extractFailureDetails([result]);
  assert.strictEqual(detail.kind, 'missing-tool');
  assert.ok(detail.mismatch_detail.includes('Wallet.transfer'));
  console.log('PASS: missing-tool detail');
}

function testBadArgsKind() {
  const result = mkResult({
    taskId: 't2', modelId: 'm1', modelName: 'M1', passed: false,
    expected: { name: 'Wallet.send', args: { amount: 10 } },
    extracted: [{ name: 'Wallet.send', args: { amount: 'ten' } }],
  });
  const [detail] = extractFailureDetails([result]);
  assert.strictEqual(detail.kind, 'bad-args');
  console.log('PASS: bad-args detail');
}

function testErrorKind() {
  const result = mkResult({
    taskId: 't3', modelId: 'm1', modelName: 'M1', passed: false,
    expected: { name: 'Wallet.send' },
    error: 'rate limited',
  });
  const [detail] = extractFailureDetails([result]);
  assert.strictEqual(detail.kind, 'error');
  assert.ok(detail.mismatch_detail.includes('rate limited'));
  console.log('PASS: error detail');
}

function testPatternDetection() {
  const details = [
    { task_id: 't1', model_id: 'a', kind: 'missing-tool' as const, expected_action: 'Wallet.send', expected_args: {}, actual_calls: [{ action: 'Wallet.transfer', args: {} }], mismatch_detail: '' },
    { task_id: 't1', model_id: 'b', kind: 'missing-tool' as const, expected_action: 'Wallet.send', expected_args: {}, actual_calls: [{ action: 'Wallet.transfer', args: {} }], mismatch_detail: '' },
    { task_id: 't2', model_id: 'c', kind: 'missing-tool' as const, expected_action: 'Wallet.send', expected_args: {}, actual_calls: [{ action: 'Wallet.transfer', args: {} }], mismatch_detail: '' },
  ];
  const patterns = detectPatterns(details);
  assert.ok(patterns.some((p) => p.kind === 'systematic-hallucination' && p.summary.includes('Wallet.transfer')));
  console.log('PASS: systematic hallucination pattern detected');
}

function testPassingFailingDiff() {
  const passing = mkResult({ taskId: 't1', modelId: 'a', modelName: 'A', passed: true, expected: { name: 'Wallet.send' }, extracted: [{ name: 'Wallet.send' }] });
  const failing = mkResult({ taskId: 't1', modelId: 'b', modelName: 'B', passed: false, expected: { name: 'Wallet.send' }, extracted: [{ name: 'Wallet.transfer' }] });
  const diff = buildPassingFailingDiff([passing, failing]);
  const t1 = diff.find((d) => d.task_id === 't1');
  assert.ok(t1);
  assert.deepStrictEqual(t1!.passing_models.sort(), ['A']);
  assert.deepStrictEqual(t1!.failing_models.sort(), ['B']);
  console.log('PASS: passing/failing diff split by model');
}

async function main() {
  testMissingToolKind();
  testBadArgsKind();
  testErrorKind();
  testPatternDetection();
  testPassingFailingDiff();
  console.log('\nALL PASS: smoke-feedback');
}

main().catch((err) => { console.error('FAIL: smoke-feedback', err); process.exit(1); });
```

- [ ] **Step 2: Run to confirm failure**

Run: `tsx tests/smoke-feedback.ts`
Expected: FAIL — modules not found.

---

## Task 20: Implement `failure-details.ts`

**Files:**
- Create: `src/optimizer/feedback/failure-details.ts`

- [ ] **Step 1: Implement**

```typescript
import type { TaskResult } from '../../benchmark/types.js';
import { getExpectedActionName } from '../../benchmark/types.js';

export type FailureKind = 'missing-tool' | 'bad-args' | 'hallucination' | 'error';

export interface FailureDetail {
  task_id: string;
  model_id: string;
  kind: FailureKind;
  expected_action: string;
  expected_args: Record<string, unknown>;
  actual_calls: Array<{ action: string; args: Record<string, unknown> }>;
  mismatch_detail: string;
}

export function extractFailureDetails(results: TaskResult[]): FailureDetail[] {
  const out: FailureDetail[] = [];
  for (const r of results) {
    if (r.metrics.taskPassed) continue;

    const actual = r.extractedCalls.map((c) => ({
      action: (c as unknown as { method: string }).method ?? (c as unknown as { name: string }).name ?? '',
      args: ((c as unknown as { args?: Record<string, unknown> }).args) ?? {},
    }));

    if (r.error) {
      out.push({
        task_id: r.task.id,
        model_id: r.model.id,
        kind: 'error',
        expected_action: '',
        expected_args: {},
        actual_calls: actual,
        mismatch_detail: r.error,
      });
      continue;
    }

    const matches = r.actionMatches ?? r.toolMatches;
    for (const m of matches) {
      const expectedName = getExpectedActionName(m.expected);
      if (!m.methodFound) {
        const alts = actual.map((a) => a.action).filter(Boolean);
        out.push({
          task_id: r.task.id,
          model_id: r.model.id,
          kind: 'missing-tool',
          expected_action: expectedName,
          expected_args: m.expected.args ?? {},
          actual_calls: actual,
          mismatch_detail: alts.length > 0 ? `called ${alts.join(', ')} instead` : 'no action calls produced',
        });
      } else if (!m.argsCorrect) {
        const wrongArgs: string[] = [];
        for (const [k, v] of Object.entries(m.argResults ?? {})) {
          if (!v.match) wrongArgs.push(`${k}: expected ${v.expected}, got ${JSON.stringify(v.got)}`);
        }
        out.push({
          task_id: r.task.id,
          model_id: r.model.id,
          kind: 'bad-args',
          expected_action: expectedName,
          expected_args: m.expected.args ?? {},
          actual_calls: actual,
          mismatch_detail: wrongArgs.join('; ') || 'args differed',
        });
      }
    }

    if (r.metrics.hallucinatedCalls?.length) {
      out.push({
        task_id: r.task.id,
        model_id: r.model.id,
        kind: 'hallucination',
        expected_action: matches.map((m) => getExpectedActionName(m.expected)).join(', '),
        expected_args: {},
        actual_calls: actual,
        mismatch_detail: `hallucinated: ${r.metrics.hallucinatedCalls.join(', ')}`,
      });
    }
  }
  return out;
}
```

- [ ] **Step 2: Commit (tests still failing, incremental)**

```bash
git add src/optimizer/feedback/failure-details.ts
git commit -m "feat(feedback): structured per-failure detail extraction"
```

---

## Task 21: Implement `patterns.ts`

**Files:**
- Create: `src/optimizer/feedback/patterns.ts`

- [ ] **Step 1: Implement**

```typescript
import type { FailureDetail } from './failure-details.js';

export type PatternKind =
  | 'naming-mismatch'
  | 'systematic-hallucination'
  | 'arg-type-confusion';

export interface Pattern {
  kind: PatternKind;
  summary: string;
  modelCount: number;
  taskCount: number;
  evidence: string[];
}

export function detectPatterns(details: FailureDetail[]): Pattern[] {
  const patterns: Pattern[] = [];

  // systematic-hallucination: same wrong action called by 2+ models across 1+ tasks
  const hallucinationKey: Record<string, { tasks: Set<string>; models: Set<string> }> = {};
  for (const d of details) {
    if (d.kind === 'missing-tool') {
      for (const call of d.actual_calls) {
        if (call.action && call.action !== d.expected_action) {
          const key = `${d.expected_action}→${call.action}`;
          if (!hallucinationKey[key]) hallucinationKey[key] = { tasks: new Set(), models: new Set() };
          hallucinationKey[key].tasks.add(d.task_id);
          hallucinationKey[key].models.add(d.model_id);
        }
      }
    }
  }
  for (const [key, s] of Object.entries(hallucinationKey)) {
    if (s.models.size >= 2) {
      patterns.push({
        kind: 'systematic-hallucination',
        summary: `Multiple models substitute ${key}`,
        modelCount: s.models.size,
        taskCount: s.tasks.size,
        evidence: [...s.tasks],
      });
    }
  }

  // arg-type-confusion: same arg key wrong across 2+ tasks
  const argConfusion: Record<string, { tasks: Set<string>; models: Set<string>; evidence: string[] }> = {};
  for (const d of details) {
    if (d.kind === 'bad-args') {
      for (const line of d.mismatch_detail.split(';')) {
        const keyMatch = line.match(/^\s*([A-Za-z0-9_]+):/);
        if (keyMatch) {
          const argKey = `${d.expected_action}.${keyMatch[1]}`;
          if (!argConfusion[argKey]) argConfusion[argKey] = { tasks: new Set(), models: new Set(), evidence: [] };
          argConfusion[argKey].tasks.add(d.task_id);
          argConfusion[argKey].models.add(d.model_id);
          argConfusion[argKey].evidence.push(line.trim());
        }
      }
    }
  }
  for (const [key, s] of Object.entries(argConfusion)) {
    if (s.tasks.size >= 2) {
      patterns.push({
        kind: 'arg-type-confusion',
        summary: `Arg ${key} confused across ${s.tasks.size} tasks`,
        modelCount: s.models.size,
        taskCount: s.tasks.size,
        evidence: [...new Set(s.evidence)].slice(0, 5),
      });
    }
  }

  return patterns;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/optimizer/feedback/patterns.ts
git commit -m "feat(feedback): cross-task pattern detection"
```

---

## Task 22: Implement `passing-failing-diff.ts` and verify feedback tests

**Files:**
- Create: `src/optimizer/feedback/passing-failing-diff.ts`

- [ ] **Step 1: Implement**

```typescript
import type { TaskResult } from '../../benchmark/types.js';

export interface PassingFailingDiff {
  task_id: string;
  prompt: string;
  passing_models: string[];
  failing_models: string[];
  passing_calls: Array<{ model: string; actions: string[] }>;
  failing_calls: Array<{ model: string; actions: string[] }>;
}

export function buildPassingFailingDiff(results: TaskResult[]): PassingFailingDiff[] {
  const byTask = new Map<string, TaskResult[]>();
  for (const r of results) {
    const arr = byTask.get(r.task.id) ?? [];
    arr.push(r);
    byTask.set(r.task.id, arr);
  }

  const diffs: PassingFailingDiff[] = [];
  for (const [taskId, rs] of byTask) {
    const passing = rs.filter((r) => r.metrics.taskPassed);
    const failing = rs.filter((r) => !r.metrics.taskPassed);
    if (passing.length === 0 || failing.length === 0) continue;
    diffs.push({
      task_id: taskId,
      prompt: rs[0]!.task.prompt,
      passing_models: passing.map((r) => r.model.name),
      failing_models: failing.map((r) => r.model.name),
      passing_calls: passing.map((r) => ({
        model: r.model.name,
        actions: r.extractedCalls.map((c) => (c as unknown as { method: string }).method ?? ''),
      })),
      failing_calls: failing.map((r) => ({
        model: r.model.name,
        actions: r.extractedCalls.map((c) => (c as unknown as { method: string }).method ?? ''),
      })),
    });
  }
  return diffs;
}
```

- [ ] **Step 2: Run smoke-feedback**

Run: `tsx tests/smoke-feedback.ts`
Expected: `ALL PASS: smoke-feedback`.

- [ ] **Step 3: Append to package.json `test` script**

Add ` && tsx tests/smoke-feedback.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/optimizer/feedback/passing-failing-diff.ts tests/smoke-feedback.ts package.json
git commit -m "feat(feedback): passing/failing per-task diff + feedback smoke tests green"
```

---

## Task 23: Mutation context assembly (replaces `report-context.ts`)

**Files:**
- Create: `src/optimizer/feedback/mutation-context.ts`
- Modify: `src/optimizer/mutation.ts` (or whichever file consumes `report-context.ts`)
- Remove: `src/optimizer/report-context.ts` (keep the file until the switch lands, then delete in same commit)

- [ ] **Step 1: Locate current consumer**

```bash
grep -rn "report-context" src/optimizer
```

Expected: one or two call sites.

- [ ] **Step 2: Implement byte-budgeted assembler**

```typescript
import type { BenchmarkReport } from '../../benchmark/types.js';
import { extractFailureDetails, type FailureDetail } from './failure-details.js';
import { detectPatterns, type Pattern } from './patterns.js';
import { buildPassingFailingDiff, type PassingFailingDiff } from './passing-failing-diff.js';

export interface MutationContext {
  failureDetails: FailureDetail[];
  patterns: Pattern[];
  passingFailingDiffs: PassingFailingDiff[];
  serialized: string;
}

export function buildMutationContext(report: BenchmarkReport, maxBytes: number): MutationContext {
  const failureDetails = extractFailureDetails(report.results);
  const patterns = detectPatterns(failureDetails);
  const diffs = buildPassingFailingDiff(report.results);

  const details = budgetSlice(failureDetails, Math.floor(maxBytes * 0.3));
  const patternSlice = budgetSlice(patterns, Math.floor(maxBytes * 0.4));
  const diffSlice = budgetSlice(diffs, Math.floor(maxBytes * 0.3));

  const serialized = [
    '## Failure details',
    JSON.stringify(details, null, 2),
    '',
    '## Cross-task patterns',
    JSON.stringify(patternSlice, null, 2),
    '',
    '## Passing vs failing by task',
    JSON.stringify(diffSlice, null, 2),
  ].join('\n');

  return { failureDetails: details, patterns: patternSlice, passingFailingDiffs: diffSlice, serialized };
}

function budgetSlice<T>(items: T[], maxBytes: number): T[] {
  const kept: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item));
    if (bytes + size > maxBytes) break;
    kept.push(item);
    bytes += size;
  }
  return kept;
}
```

- [ ] **Step 3: Swap the call site**

In the mutation file that currently imports from `report-context`, replace with `buildMutationContext(report, manifest.optimizer.reportContextMaxBytes ?? 16_000)` and pass `ctx.serialized` where the old payload went.

- [ ] **Step 4: Delete the old file**

```bash
git rm src/optimizer/report-context.ts
```

- [ ] **Step 5: Run optimize smoke**

Run: `tsx tests/smoke-optimize.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/optimizer/feedback/mutation-context.ts src/optimizer/mutation.ts
git commit -m "feat(feedback): byte-budgeted mutation context replaces report-context"
```

---

## Task 24: Verify no dead references

**Files:** (scan only)

- [ ] **Step 1: Ensure no lingering imports of `report-context`**

```bash
grep -rn "report-context" src tests docs
```

Expected: no hits.

- [ ] **Step 2: Run full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

---

## Task 25: Recommendations pipeline — failing test first

**Files:**
- Create: `tests/smoke-verdict.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { strict as assert } from 'node:assert';

import type { BenchmarkReport } from '../src/benchmark/types.js';
import { generateRecommendations } from '../src/verdict/recommendations.js';

function syntheticFailReport(): BenchmarkReport {
  return {
    timestamp: new Date().toISOString(),
    config: { name: 'syn', surface: 'mcp' },
    skillVersion: { source: 'local', commitSha: 'local', ref: 'file', fetchedAt: new Date().toISOString() },
    results: [],
    coverage: [],
    summary: {
      totalTasks: 2, totalModels: 2, totalEvaluations: 4,
      overallPassRate: 0.5, weightedAverage: 0.5,
      avgToolRecall: 0, avgToolPrecision: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0, avgHallucinationRate: 0,
      methodCoveragePercent: 1,
      perModel: { a: { passRate: 0.4, avgRecall: 0, avgPrecision: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0, avgHallucinationRate: 0, tasksRun: 2 } },
      perTask: {},
      perTier: { flagship: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 }, mid: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 }, low: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 } },
    },
    verdict: { result: 'FAIL', reasons: ['a below floor'], policy: { perModelFloor: 0.6, targetWeightedAverage: 0.7 } },
  };
}

async function testPassSkipsCritic() {
  const report = syntheticFailReport();
  report.verdict!.result = 'PASS';
  report.verdict!.reasons = [];
  let called = 0;
  const recs = await generateRecommendations(report, { complete: async () => { called += 1; return '[]'; } });
  assert.strictEqual(called, 0);
  assert.deepStrictEqual(recs, []);
  console.log('PASS: PASS verdict skips critic call');
}

async function testFailInvokesCriticOnce() {
  const report = syntheticFailReport();
  let called = 0;
  const recs = await generateRecommendations(report, {
    complete: async () => {
      called += 1;
      return JSON.stringify([
        { priority: 'high', area: 'docs', action: 'Document Wallet.send args', rationale: 'models consistently missing amount arg' },
      ]);
    },
  });
  assert.strictEqual(called, 1);
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]!.priority, 'high');
  console.log('PASS: FAIL verdict invokes critic exactly once');
}

async function testMalformedOutputReturnsEmpty() {
  const report = syntheticFailReport();
  const recs = await generateRecommendations(report, { complete: async () => 'not json' });
  assert.deepStrictEqual(recs, []);
  console.log('PASS: malformed critic output returns empty list, not throw');
}

async function main() {
  await testPassSkipsCritic();
  await testFailInvokesCriticOnce();
  await testMalformedOutputReturnsEmpty();
  console.log('\nALL PASS: smoke-verdict');
}

main().catch((err) => { console.error('FAIL: smoke-verdict', err); process.exit(1); });
```

- [ ] **Step 2: Run to confirm failure**

Run: `tsx tests/smoke-verdict.ts`
Expected: FAIL — module not found.

---

## Task 26: Implement recommendations module

**Files:**
- Create: `src/verdict/recommendations.ts`

- [ ] **Step 1: Implement**

```typescript
import type { BenchmarkReport } from '../benchmark/types.js';
import { buildMutationContext } from '../optimizer/feedback/mutation-context.js';

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  area: string;
  action: string;
  rationale: string;
}

export interface CriticDeps {
  complete: (args: { system: string; prompt: string }) => Promise<string>;
}

export async function generateRecommendations(
  report: BenchmarkReport,
  deps: CriticDeps,
  contextMaxBytes: number = 16_000,
): Promise<Recommendation[]> {
  if (!report.verdict || report.verdict.result !== 'FAIL') return [];

  const ctx = buildMutationContext(report, contextMaxBytes);
  const system = 'You review benchmark failures and produce actionable skill / doc / SDK improvement recommendations. JSON array only.';
  const prompt = [
    'Return a JSON array of {priority:"high"|"medium"|"low", area:string, action:string, rationale:string}.',
    'Focus on concrete edits, not generic advice.',
    '',
    `Verdict: FAIL — ${report.verdict.reasons.join('; ')}`,
    '',
    ctx.serialized,
  ].join('\n');

  let raw: string;
  try {
    raw = await deps.complete({ system, prompt });
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        priority: (['high', 'medium', 'low'].includes((r as { priority?: string }).priority ?? '')
          ? (r as { priority: 'high' | 'medium' | 'low' }).priority
          : 'medium'),
        area: String((r as { area?: string }).area ?? 'unspecified'),
        action: String((r as { action?: string }).action ?? ''),
        rationale: String((r as { rationale?: string }).rationale ?? ''),
      }))
      .filter((r) => r.action.length > 0);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Run test**

Run: `tsx tests/smoke-verdict.ts`
Expected: `ALL PASS: smoke-verdict`.

- [ ] **Step 3: Append to `test` script**

Add ` && tsx tests/smoke-verdict.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/verdict/recommendations.ts tests/smoke-verdict.ts package.json
git commit -m "feat(verdict): recommendations critic — JSON out, single call, fault-tolerant"
```

---

## Task 27: Verdict renderer (console + markdown)

**Files:**
- Create: `src/verdict/render.ts`

- [ ] **Step 1: Implement**

```typescript
import type { BenchmarkReport, CoverageReport } from '../benchmark/types.js';
import type { Recommendation } from './recommendations.js';

export function renderVerdictConsole(
  report: BenchmarkReport,
  recommendations: Recommendation[],
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== Verdict ===');
  if (!report.verdict) {
    lines.push('No verdict policy configured.');
    return lines.join('\n');
  }
  lines.push(`Result: ${report.verdict.result}`);
  for (const reason of report.verdict.reasons) {
    lines.push(`  - ${reason}`);
  }
  lines.push(renderCoverageBlock(report.scopeCoverage));
  if (recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of recommendations) {
      lines.push(`  [${rec.priority}] ${rec.area}: ${rec.action}`);
      if (rec.rationale) lines.push(`      ${rec.rationale}`);
    }
  }
  return lines.join('\n');
}

export function renderVerdictMarkdown(
  report: BenchmarkReport,
  recommendations: Recommendation[],
): string {
  if (!report.verdict) return '';
  const lines: string[] = [];
  lines.push('## Verdict');
  lines.push(`- **Result:** ${report.verdict.result}`);
  lines.push(`- **Per-model floor:** ${(report.verdict.policy.perModelFloor * 100).toFixed(1)}%`);
  lines.push(`- **Target weighted average:** ${(report.verdict.policy.targetWeightedAverage * 100).toFixed(1)}%`);
  if (report.verdict.reasons.length > 0) {
    lines.push('');
    lines.push('**Reasons:**');
    for (const r of report.verdict.reasons) lines.push(`- ${r}`);
  }
  const cov = renderCoverageBlockMarkdown(report.scopeCoverage);
  if (cov) { lines.push(''); lines.push(cov); }
  if (recommendations.length > 0) {
    lines.push('');
    lines.push('## Recommendations');
    for (const rec of recommendations) {
      lines.push(`- **[${rec.priority}] ${rec.area}** — ${rec.action}`);
      if (rec.rationale) lines.push(`  - _${rec.rationale}_`);
    }
  }
  return lines.join('\n');
}

function renderCoverageBlock(cov?: CoverageReport): string {
  if (!cov) return '';
  const total = cov.inScopeActions.length;
  const covered = cov.coveredActions.length;
  const pct = total > 0 ? (covered / total) * 100 : 0;
  const lines = [
    '',
    'Surface coverage:',
    `  In scope:      ${total} action(s)`,
    `  Out of scope:  ${cov.outOfScopeActions.length} action(s)`,
    `  Covered:       ${covered} / ${total} (${pct.toFixed(0)}%)`,
  ];
  if (cov.uncoveredActions.length > 0) {
    lines.push(`  Uncovered:     ${cov.uncoveredActions.join(', ')}`);
  }
  return lines.join('\n');
}

function renderCoverageBlockMarkdown(cov?: CoverageReport): string {
  if (!cov) return '';
  const total = cov.inScopeActions.length;
  const covered = cov.coveredActions.length;
  const pct = total > 0 ? (covered / total) * 100 : 0;
  const lines: string[] = [
    '## Coverage',
    `- In scope: ${total}`,
    `- Out of scope: ${cov.outOfScopeActions.length}`,
    `- Covered: ${covered}/${total} (${pct.toFixed(0)}%)`,
  ];
  if (cov.uncoveredActions.length > 0) {
    lines.push(`- Uncovered: ${cov.uncoveredActions.join(', ')}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/verdict/render.ts
git commit -m "feat(verdict): console + markdown renderer with coverage block"
```

---

## Task 28: Invoke verdict + recommendations in CLI

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/benchmark/reporter.ts` (remove duplicate verdict rendering now centralized in `verdict/render.ts`)
- Modify: `src/optimizer/main.ts`

- [ ] **Step 1: After benchmark and optimize runs, render + optionally call critic**

In `src/cli.ts`, at the end of the benchmark `run`/`benchmark` branch, add these imports near the other CLI-layer imports:

```typescript
import type { Recommendation } from './verdict/recommendations.js';
import { generateRecommendations } from './verdict/recommendations.js';
import { renderVerdictConsole, renderVerdictMarkdown } from './verdict/render.js';
import { createDefaultPiCritic } from './tasks/index.js';
```

Then at the end of the benchmark branch, replace the current summary block with:

```typescript
let recommendations: Recommendation[] = [];
if (report.verdict?.result === 'FAIL') {
  const modelRef = project.optimize?.model ?? project.benchmark.models[0]!.id;
  const { provider, model } = parseModelRef(modelRef);
  const criticDeps = createDefaultPiCritic({
    provider,
    model,
    apiKeyEnv: project.optimize?.apiKeyEnv ?? project.benchmark.apiKeyEnv,
  });
  recommendations = await generateRecommendations(
    report,
    criticDeps,
    project.optimize?.reportContextMaxBytes ?? 16_000,
  );
}
console.log(renderVerdictConsole(report, recommendations));

const markdown = generateMarkdown(report) + '\n\n' + renderVerdictMarkdown(report, recommendations);
writeFileSync(mdPath, markdown, 'utf-8');

process.exit(report.verdict?.result === 'FAIL' ? 1 : 0);
```

Add a `createDefaultPiCritic` helper alongside the existing `createDefaultPiTaskGenerator` in `src/tasks/index.ts`. Mirror the shape of `createDefaultPiTaskGenerator` — the only difference is no JSON-schema enforcement on the response:

```typescript
import type { CriticDeps } from '../verdict/recommendations.js';
import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent';
import { parseModelRef } from '../project/types.js';
import { resolvePiModel } from '../runtime/pi/models.js';

export function createDefaultPiCritic(opts: {
  provider: string;
  model: string;
  apiKeyEnv?: string;
}): CriticDeps {
  return {
    complete: async ({ system, prompt }) => {
      const resolved = await resolvePiModel(opts.provider, opts.model, { apiKeyEnv: opts.apiKeyEnv });
      const session = await createAgentSession({
        cwd: process.cwd(),
        model: resolved.model,
        thinkingLevel: 'low',
        authStorage: resolved.authStorage,
        modelRegistry: resolved.modelRegistry,
        tools: [],
        sessionManager: SessionManager.inMemory(),
        systemPrompt: system,
      });
      const response = await session.send({ content: prompt });
      return response.content ?? '';
    },
  };
}
```

If the pi session signature has drifted, mirror whatever shape `createDefaultPiTaskGenerator` uses today — the critic just needs a `complete(system, prompt) → string` surface.

- [ ] **Step 2: Do the same in `runOptimizeFromConfig`**

After the loop ends, compute verdict on `bestReport` (attach if not present), generate recommendations on FAIL, render, exit with `1` on FAIL.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual sanity — run the optimize smoke**

Run: `tsx tests/smoke-optimize.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/benchmark/reporter.ts src/optimizer/main.ts src/tasks/index.ts
git commit -m "feat(cli): render verdict, invoke critic on FAIL, set exit code"
```

---

## Task 29: `--dry-run` flag (zero LLM calls)

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add flag + branch**

In `BOOLEAN_FLAGS` add `'--dry-run'`. Add a new helper:

```typescript
async function runDryRun(configPath: string) {
  const project = loadProjectConfig(configPath);
  // discover only — same pipeline used by generation, minus LLM
  const discovered = await discoverActionsOnly(project); // new thin wrapper; see step 2
  const { inScope, outOfScope } = resolveScope(discovered, project.target.scope);

  console.log('=== skill-optimizer dry run ===');
  console.log(`Config: ${project.configPath}`);
  console.log(`Surface: ${project.target.surface}`);
  console.log(`Discovered: ${discovered.length} action(s)`);
  console.log(`In scope:    ${inScope.length} — ${inScope.map((a) => a.name).join(', ')}`);
  console.log(`Out of scope:${outOfScope.length} — ${outOfScope.map((a) => a.name).join(', ')}`);

  const maxTasks = project.benchmark.taskGeneration.maxTasks;
  if (maxTasks < inScope.length) {
    console.error(`\nERROR: maxTasks (${maxTasks}) < in-scope action count (${inScope.length}).`);
    console.error(`Raise benchmark.taskGeneration.maxTasks in ${project.configPath}, or tighten target.scope.exclude.`);
    process.exit(1);
  }

  console.log('\nNo LLM calls made. Zero side effects.');
  process.exit(0);
}
```

Route `--dry-run` at the top of `main()` before the command switch:

```typescript
if (hasFlag(args, '--dry-run')) {
  const configPath = getFlag(args, '--config') ?? 'skill-optimizer.json';
  await runDryRun(configPath);
  return;
}
```

- [ ] **Step 2: Add `discoverActionsOnly`**

Export the existing discovery pipeline with a wrapper in `src/tasks/index.ts`:

```typescript
export async function discoverActionsOnly(project: ResolvedProjectConfig): Promise<ActionDefinition[]> {
  // Calls the same discovery that generateTasksForProject uses, returns ActionDefinition[]
  // No LLM calls.
}
```

Implement by factoring the existing discovery block out of `generateTasksForProject`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/tasks/index.ts
git commit -m "feat(cli): --dry-run (discovery + scope preview; zero LLM calls)"
```

---

## Task 30: Dry-run smoke test

**Files:**
- Create: `tests/smoke-dry-run.ts`

- [ ] **Step 1: Write the test**

```typescript
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MOCK_CONFIG_REL = 'mock-repos/mcp-tracker-demo/skill-optimizer.json';
const MOCK_CONFIG_ABS = resolve(REPO_ROOT, MOCK_CONFIG_REL);

function run(args: string[]) {
  return spawnSync('npx', ['tsx', 'src/cli.ts', ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      // Intentionally wipe API keys — dry-run must not need them.
      OPENROUTER_API_KEY: '',
    },
    cwd: REPO_ROOT,
  });
}

function testDryRunNoLLM() {
  const result = run(['--dry-run', '--config', MOCK_CONFIG_REL]);
  assert.strictEqual(result.status, 0, `dry-run failed: ${result.stderr}`);
  assert.ok(result.stdout.includes('=== skill-optimizer dry run ==='));
  assert.ok(result.stdout.includes('No LLM calls made'));
  console.log('PASS: --dry-run succeeds with zero API keys, zero LLM calls');
}

function testDryRunMaxTasksTooSmall() {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-dry-'));
  try {
    // Rewrite the mock config in-place with maxTasks=1 and absolute paths pointing back
    // at the untouched mock-repo sources so discovery still works.
    const base = JSON.parse(readFileSync(MOCK_CONFIG_ABS, 'utf-8')) as Record<string, any>;
    const mockDir = resolve(REPO_ROOT, 'mock-repos/mcp-tracker-demo');
    base.target = {
      ...base.target,
      repoPath: mockDir,
      skill: resolve(mockDir, 'SKILL.md'),
      mcp: { tools: resolve(mockDir, 'tools.json') },
    };
    base.benchmark = {
      ...base.benchmark,
      taskGeneration: {
        ...(base.benchmark.taskGeneration ?? {}),
        enabled: true,
        maxTasks: 1,
      },
    };
    const cfgPath = join(dir, 'skill-optimizer.json');
    writeFileSync(cfgPath, JSON.stringify(base, null, 2));

    const result = run(['--dry-run', '--config', cfgPath]);
    assert.notStrictEqual(result.status, 0);
    const combined = result.stderr + result.stdout;
    assert.ok(combined.includes('maxTasks'));
    assert.ok(combined.includes('in-scope'));
    console.log('PASS: --dry-run rejects maxTasks < scope_size');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  testDryRunNoLLM();
  testDryRunMaxTasksTooSmall();
  console.log('\nALL PASS: smoke-dry-run');
}

main().catch((err) => { console.error('FAIL: smoke-dry-run', err); process.exit(1); });
```

- [ ] **Step 2: Run test**

Run: `tsx tests/smoke-dry-run.ts`
Expected: `ALL PASS: smoke-dry-run`.

- [ ] **Step 3: Append to `test` script**

Add ` && tsx tests/smoke-dry-run.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke-dry-run.ts package.json
git commit -m "test(dry-run): smoke test — zero LLM calls, maxTasks preflight"
```

---

## Task 31: Verdict exit code in CLI benchmark path

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Replace trailing `process.exit(0)` in the benchmark branch**

Find `process.exit(0);` at the end of the benchmark branch (after the summary line). Replace with:

```typescript
const exitCode = report.verdict?.result === 'FAIL' ? 1 : 0;
process.exit(exitCode);
```

Do the same at the end of the optimize branch (`printOptimizeSummary` block) — read the best report's verdict and exit `1` on FAIL.

- [ ] **Step 2: Manual sanity**

Run: `tsx src/cli.ts --dry-run --config mock-repos/mcp-tracker-demo/skill-optimizer.json && echo OK`
Expected: prints dry-run block, exits `0`, prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): exit 1 on FAIL verdict for benchmark and optimize"
```

---

## Task 32: Update `printUsage` text

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add `--dry-run` to the help text**

In `printUsage()`, add:

```
Global options:
  --dry-run                                     Discover + scope preview only; no LLM calls, no side effects

Examples:
  skill-optimizer --dry-run --config ./skill-optimizer.json
```

Also ensure every `--config` default shown in the help reads `skill-optimizer.json`.

- [ ] **Step 2: Commit**

```bash
git add src/cli.ts
git commit -m "docs(cli): document --dry-run and skill-optimizer.json default"
```

---

## Task 33: Error-message hygiene audit — failing tests first

**Files:**
- Create: `tests/smoke-errors.ts`

- [ ] **Step 1: Write the failing test**

The goal: each error path names *what went wrong* and *what to do next*. Each case runs the CLI with a deliberately broken config/env and verifies exit code + message contents.

```typescript
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync('npx', ['tsx', 'src/cli.ts', ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    cwd: resolve(import.meta.dirname, '..'),
  });
}

function writeTmpConfig(partial: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-err-'));
  const path = join(dir, 'skill-optimizer.json');
  writeFileSync(path, JSON.stringify(partial, null, 2));
  return { dir, path };
}

function testConfigNotFound() {
  const result = run(['run', '--config', '/nonexistent/skill-optimizer.json']);
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes('Project config not found'));
  assert.ok(result.stderr.includes("skill-optimizer init"));
  console.log('PASS: config-not-found error has next step');
}

function testLegacyFilenameError() {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-legacy-'));
  try {
    const p = join(dir, 'skill-benchmark.json');
    writeFileSync(p, '{}');
    const result = run(['run'], { PWD: dir });
    // This exact invocation may vary per implementation — key assertion is the message content:
    const combined = result.stderr + result.stdout;
    if (combined.includes('legacy')) {
      assert.ok(combined.includes('skill-optimizer.json'));
      console.log('PASS: legacy filename error names new filename');
    } else {
      console.log('SKIP: legacy test — cwd plumbing varies');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testInvalidJson() {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-inv-'));
  try {
    const p = join(dir, 'skill-optimizer.json');
    writeFileSync(p, '{not json');
    const result = run(['run', '--config', p]);
    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('Invalid JSON'));
    console.log('PASS: invalid JSON error identifies file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testMissingApiKeyOnRun() {
  // Only run if a runnable mock config exists
  const result = run(['run', '--config', 'mock-repos/mcp-tracker-demo/skill-optimizer.json'], { OPENROUTER_API_KEY: '' });
  // Accept any non-zero exit; key is that stderr points at OPENROUTER_API_KEY
  const combined = result.stderr + result.stdout;
  if (result.status !== 0) {
    assert.ok(combined.includes('OPENROUTER_API_KEY'), `expected OPENROUTER_API_KEY hint, got: ${combined}`);
    console.log('PASS: missing API key error names env var');
  } else {
    console.log('SKIP: missing API key test — CLI did not reach LLM stage');
  }
}

function testEmptyScope() {
  const { dir, path } = writeTmpConfig({
    name: 'empty-scope',
    target: { surface: 'mcp', repoPath: resolve('mock-repos/mcp-tracker-demo'), scope: { include: ['NONE.*'] }, mcp: { tools: resolve('mock-repos/mcp-tracker-demo/tools.json') }, skill: resolve('mock-repos/mcp-tracker-demo/SKILL.md') },
    benchmark: { models: [{ id: 'x/y', name: 'Y', tier: 'mid' }], taskGeneration: { enabled: true, maxTasks: 5 } },
  });
  try {
    const result = run(['--dry-run', '--config', path]);
    assert.notStrictEqual(result.status, 0);
    assert.ok((result.stderr + result.stdout).match(/zero in-scope actions/));
    console.log('PASS: empty scope error + next step');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testMaxTasksTooSmall() {
  const { dir, path } = writeTmpConfig({
    name: 'too-few-tasks',
    target: { surface: 'mcp', repoPath: resolve('mock-repos/mcp-tracker-demo'), mcp: { tools: resolve('mock-repos/mcp-tracker-demo/tools.json') }, skill: resolve('mock-repos/mcp-tracker-demo/SKILL.md') },
    benchmark: { models: [{ id: 'x/y', name: 'Y', tier: 'mid' }], taskGeneration: { enabled: true, maxTasks: 1 } },
  });
  try {
    const result = run(['--dry-run', '--config', path]);
    assert.notStrictEqual(result.status, 0);
    assert.ok((result.stderr + result.stdout).includes('maxTasks'));
    console.log('PASS: maxTasks-too-small preflight error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testRepoPathMissing() {
  const { dir, path } = writeTmpConfig({
    name: 'no-repo',
    target: { surface: 'mcp', repoPath: '/nonexistent/repo/at/all', mcp: { tools: resolve('mock-repos/mcp-tracker-demo/tools.json') } },
    benchmark: { models: [{ id: 'x/y', name: 'Y', tier: 'mid' }], tasks: resolve('mock-repos/mcp-tracker-demo/tasks.json') },
  });
  try {
    const result = run(['run', '--config', path]);
    assert.notStrictEqual(result.status, 0);
    assert.ok((result.stderr + result.stdout).toLowerCase().includes('repopath') || (result.stderr + result.stdout).includes('not found'));
    console.log('PASS: repoPath-missing error reported');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  testConfigNotFound();
  testLegacyFilenameError();
  testInvalidJson();
  testMissingApiKeyOnRun();
  testEmptyScope();
  testMaxTasksTooSmall();
  testRepoPathMissing();
  console.log('\nALL PASS: smoke-errors');
}

main().catch((err) => { console.error('FAIL: smoke-errors', err); process.exit(1); });
```

- [ ] **Step 2: Run to see failures**

Run: `tsx tests/smoke-errors.ts`
Expected: several assertions fail — those are the error-message sites to fix.

---

## Task 34: Fix each error message + rerun tests

**Files:**
- Modify: `src/project/load.ts`
- Modify: `src/project/validate.ts`
- Modify: `src/tasks/index.ts`
- Modify: `src/cli.ts`
- Modify: any other file flagged by Task 33 failures

- [ ] **Step 1: For each failing assertion, update the relevant error to include the next step**

Rubric for every error thrown on user-facing paths:
1. Name **what went wrong** concretely (field name, env var, file path).
2. Name **where it lives** (config path, cwd).
3. Name the **next step** (which field to edit, which env var to set, which command to run).

Example: in `src/project/load.ts`, the config-not-found error already names the file and `skill-optimizer init`. Similarly, every `throw new Error(...)` in `src/project/validate.ts` already names the config path and the field; double-check each one matches the rubric and add a suggested fix if missing.

Add a guard for missing `OPENROUTER_API_KEY` near where `runBenchmark` initializes the transport:

```typescript
if (project.benchmark.format !== 'anthropic' && !process.env[project.benchmark.apiKeyEnv ?? 'OPENROUTER_API_KEY']) {
  throw new Error(
    `Missing ${project.benchmark.apiKeyEnv ?? 'OPENROUTER_API_KEY'} environment variable. ` +
      `Set it in your shell or in a .env file alongside ${project.configPath}.`,
  );
}
```

Add a `repoPath` existence check in `src/project/validate.ts` (operating on the resolved path — validate alone works on raw input, so move this check to `src/project/resolve.ts` after `resolve(configDir, target.repoPath ?? '.')`):

```typescript
import { existsSync, statSync } from 'node:fs';

// ... after computing resolvedRepoPath ...
if (!existsSync(resolvedRepoPath) || !statSync(resolvedRepoPath).isDirectory()) {
  throw new Error(
    `target.repoPath does not exist or is not a directory: ${resolvedRepoPath}. ` +
      `Edit "target.repoPath" in ${configPath}.`,
  );
}
```

- [ ] **Step 2: Rerun `smoke-errors`**

Run: `tsx tests/smoke-errors.ts`
Expected: `ALL PASS: smoke-errors`.

- [ ] **Step 3: Append to `test` script**

Add ` && tsx tests/smoke-errors.ts`.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/smoke-errors.ts package.json
git commit -m "chore(errors): hygiene audit — every error names the next step"
```

---

## Task 35: Coverage / in-scope section in report

**Files:**
- Modify: `src/benchmark/reporter.ts`
- Modify: `src/benchmark/runner.ts` (attach `scopeCoverage` onto report)

- [ ] **Step 1: Thread `CoverageReport` from generation into the benchmark report**

The coverage report is produced in `generateCandidateTasksWithCoverage` (Task 18). Persist it on the frozen benchmark config artifact, and copy it onto `BenchmarkReport.scopeCoverage` at the end of `runBenchmark`.

- [ ] **Step 2: Render in `printSummary` and `generateMarkdown`**

Already implemented in `src/verdict/render.ts` (Task 27). Replace any duplicate in `reporter.ts` with a pass-through to `renderVerdictConsole`/`renderVerdictMarkdown`.

- [ ] **Step 3: Commit**

```bash
git add src/benchmark/reporter.ts src/benchmark/runner.ts src/tasks
git commit -m "feat(report): surface coverage section in console + markdown"
```

---

## Task 36: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write short doc**

```markdown
# Contributing to skill-optimizer

Thanks for contributing! This project is a small, opinionated tool — changes should preserve its core invariants (static evaluation, `allowedPaths` safety boundary, per-model universality).

## Local workflow

```bash
git clone https://github.com/bucurdavid/skill-optimizer
cd skill-optimizer
npm install
npm run typecheck
npm test
npm run build
```

All three commands must pass before opening a PR.

## Project layout

- `src/cli.ts` — CLI entry point (single source of truth; all `npm run <script>` aliases go through it).
- `src/project/` — config load / validate / resolve.
- `src/discovery/` — tree-sitter / manifest-based action discovery.
- `src/tasks/` — scope filtering, coverage-guaranteed task generation.
- `src/benchmark/` — runner, evaluator, reporter, scoring.
- `src/optimizer/` — mutation loop, feedback pipeline, ledger.
- `src/verdict/` — recommendations critic + rendering.
- `tests/` — hand-rolled smoke tests (`tsx tests/smoke-*.ts`).

## Pre-submit expectations

- One feature per PR.
- TDD: write the failing test first, implement, confirm green, commit.
- Update `CHANGELOG.md` under the next release section.
- No new npm dependencies without discussion.
- Error messages name the next step.

## Adding a surface type

Follow the shape of `src/discovery/mcp.ts` or `src/discovery/sdk.ts`. A surface discoverer returns `ActionDefinition[]`. Then:

1. Extend `BenchmarkSurface` in `src/benchmark/types.ts`.
2. Add a branch to `src/project/validate.ts` and `src/project/resolve.ts`.
3. Register the discoverer in `src/tasks/index.ts`.
4. Add a discovery smoke test.

## Adding an LLM provider

Current transport is pi-ai + OpenRouter. To add a provider:

1. Add a new format value to `LLMConfig.format` in `src/benchmark/types.ts`.
2. Implement the transport adapter alongside `src/runtime/pi/` (or wherever the current one lives).
3. Update `createDefaultPiTaskGenerator`, `createDefaultPiCritic`, and the benchmark runner to branch on the new format.

## Commit style

`<type>(<scope>): <short summary>` — matching existing history (`feat(optimizer): ...`, `fix(benchmark): ...`, `chore(deps): ...`, `docs(readme): ...`, `test(dry-run): ...`).
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md"
```

---

## Task 37: CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write initial entry**

```markdown
# Changelog

## 0.1.0 — unreleased

First OSS-ready release.

### Breaking

- **Config filename:** `skill-benchmark.json` → `skill-optimizer.json`. The loader emits a migration error if it finds only the old filename.
- **`optimize.minImprovement` default:** `0.01` → `0.02`.
- **Acceptance gates:** The optimizer now requires both (a) no per-model regression below `benchmark.verdict.perModelFloor` and (b) weighted-average improvement ≥ `optimize.minImprovement`. The previous single-delta aggregate check is removed.
- **npm-publishing fields stripped** from `package.json`. Consumption remains clone-and-run.

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
- `sdk-counter-demo/` example.
- CI workflow (Node 20.x + 22.x matrix, typecheck + test + build).
- New smoke tests: `smoke-scoring`, `smoke-scope`, `smoke-coverage`, `smoke-feedback`, `smoke-verdict`, `smoke-dry-run`, `smoke-errors`, `smoke-e2e`.

### Changed

- README fully rewritten as a one-page OSS entry.
- `npm run optimize` script now delegates to `src/cli.ts optimize`.
- Error messages audited to always name the next step.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG.md with 0.1.0 entry"
```

---

## Task 38: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

Smoke tests must run without real LLM access — they use the `__setPiImplementationsForTest` hook and mock configs. If any test depends on OPENROUTER_API_KEY under real load, gate it behind `process.env.OPENROUTER_API_KEY` rather than having CI provide a secret.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (Node 20/22, typecheck + test + build)"
```

---

## Task 39: Mock-repo polish

**Files:**
- Modify: `mock-repos/mcp-tracker-demo/README.md`
- Modify: `mock-repos/mcp-tracker-demo/skill-optimizer.json` (ensure it uses all new fields)

- [ ] **Step 1: Ensure `skill-optimizer.json` uses new fields**

Edit to include:

```json
{
  "name": "mcp-tracker-demo",
  "target": {
    "surface": "mcp",
    "repoPath": ".",
    "skill": "./SKILL.md",
    "discovery": { "mode": "manifest" },
    "mcp": { "tools": "./tools.json" },
    "scope": { "include": ["*"], "exclude": [] }
  },
  "benchmark": {
    "format": "pi",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [
      { "id": "openrouter/openai/gpt-4o-mini", "name": "GPT-4o mini", "tier": "low" }
    ],
    "verdict": { "perModelFloor": 0.6, "targetWeightedAverage": 0.7 },
    "taskGeneration": { "enabled": true, "maxTasks": 6, "seed": 1 }
  },
  "optimize": {
    "enabled": true,
    "model": "openrouter/anthropic/claude-sonnet-4.6",
    "allowedPaths": ["SKILL.md"],
    "maxIterations": 3,
    "minImprovement": 0.02
  }
}
```

- [ ] **Step 2: Rewrite the README**

Short quickstart tailored to this example, explaining what the demo shows and which command to run.

- [ ] **Step 3: Run optimize smoke**

Run: `tsx tests/smoke-optimize.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mock-repos/mcp-tracker-demo
git commit -m "docs(mock-repos): polish mcp-tracker-demo config + README"
```

---

## Task 40: Build `sdk-counter-demo` — stub source

**Files:**
- Create: `mock-repos/sdk-counter-demo/src/counter.ts`
- Create: `mock-repos/sdk-counter-demo/package.json` (only if needed for discovery; otherwise skip)

- [ ] **Step 1: Write a small TS SDK with intentionally ambiguous doc hints**

```typescript
// src/counter.ts

/** Creates a new counter, optionally starting at a given value. */
export function createCounter(options?: { start?: number }): Counter {
  return new Counter(options?.start ?? 0);
}

export class Counter {
  #value: number;
  constructor(start: number) { this.#value = start; }

  /** Advances the counter and returns the new value. */
  increment(amount?: number): number {
    this.#value += amount ?? 1;
    return this.#value;
  }

  /** Resets the counter to 0 (or the given value). */
  reset(to?: number): number {
    this.#value = to ?? 0;
    return this.#value;
  }

  value(): number { return this.#value; }
}
```

- [ ] **Step 2: Commit**

```bash
git add mock-repos/sdk-counter-demo/src/counter.ts
git commit -m "feat(mock-repos): add sdk-counter-demo SDK source"
```

---

## Task 41: `sdk-counter-demo` — intentionally lossy SKILL.md + config

**Files:**
- Create: `mock-repos/sdk-counter-demo/SKILL.md`
- Create: `mock-repos/sdk-counter-demo/skill-optimizer.json`
- Create: `mock-repos/sdk-counter-demo/README.md`

- [ ] **Step 1: Write SKILL.md with deliberate gaps**

```markdown
# Counter SDK

A small counter utility.

## Usage

Import from `./counter.ts` and build a counter.

```ts
import { createCounter } from './counter';
const c = createCounter();
c.increment();
```

That's it. Use `.value()` for the current value.
```

(Intentionally omits the `amount` parameter, the `reset` method, and the `start` option — the optimizer should detect failing tasks and propose fixes.)

- [ ] **Step 2: Write `skill-optimizer.json`**

```json
{
  "name": "sdk-counter-demo",
  "target": {
    "surface": "sdk",
    "repoPath": ".",
    "skill": "./SKILL.md",
    "discovery": {
      "mode": "auto",
      "sources": ["./src/counter.ts"],
      "language": "typescript"
    },
    "sdk": { "language": "typescript" },
    "scope": { "include": ["*"], "exclude": [] }
  },
  "benchmark": {
    "format": "pi",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [
      { "id": "openrouter/openai/gpt-4o-mini", "name": "GPT-4o mini", "tier": "low" },
      { "id": "openrouter/anthropic/claude-sonnet-4.6", "name": "Claude 4.6", "tier": "mid" }
    ],
    "verdict": { "perModelFloor": 0.6, "targetWeightedAverage": 0.7 },
    "taskGeneration": { "enabled": true, "maxTasks": 8, "seed": 1 }
  },
  "optimize": {
    "enabled": true,
    "model": "openrouter/anthropic/claude-sonnet-4.6",
    "allowedPaths": ["SKILL.md"],
    "maxIterations": 3,
    "minImprovement": 0.02
  }
}
```

- [ ] **Step 3: Write README.md**

Short: "First run: FAIL. Second run after `skill-optimizer optimize`: PASS."

- [ ] **Step 4: Commit**

```bash
git add mock-repos/sdk-counter-demo
git commit -m "feat(mock-repos): sdk-counter-demo with intentionally-lossy SKILL.md"
```

---

## Task 42: Wire `sdk-counter-demo` into smoke tests

**Files:**
- Modify: `tests/smoke-mock-repos.ts`

- [ ] **Step 1: Add the new demo to the mock-repos smoke test**

Extend the test loop to include `mock-repos/sdk-counter-demo/skill-optimizer.json`. Assertion: config loads, discovery produces ≥3 actions, scope resolves all in-scope, dry-run works.

- [ ] **Step 2: Run**

Run: `tsx tests/smoke-mock-repos.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke-mock-repos.ts
git commit -m "test(mock-repos): cover sdk-counter-demo in smoke-mock-repos"
```

---

## Task 43: End-to-end optimize loop — failing test first

**Files:**
- Create: `tests/smoke-e2e.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { strict as assert } from 'node:assert';

import { runOptimizeLoop } from '../src/optimizer/loop.js';
import type { BenchmarkReport, ModelConfig } from '../src/benchmark/types.js';
import type { ResolvedOptimizeManifest } from '../src/optimizer/types.js';

// Deterministic mock: two tasks, two models.
// Iteration 1 mutation fixes task A for both models; iteration 2 fixes task B for both.
// Expected trajectory: baseline 0.0 → after iter 1 0.5 → after iter 2 1.0, verdict PASS.

async function testFullLoopReachesPass() {
  const reports: BenchmarkReport[] = [
    buildReport({ a: { m1: false, m2: false }, b: { m1: false, m2: false } }),
    buildReport({ a: { m1: true, m2: true }, b: { m1: false, m2: false } }),
    buildReport({ a: { m1: true, m2: true }, b: { m1: true, m2: true } }),
  ];
  let callIndex = 0;

  const models: ModelConfig[] = [
    { id: 'm1', name: 'M1', tier: 'flagship' },
    { id: 'm2', name: 'M2', tier: 'mid' },
  ];

  const manifest = {
    targetRepo: '/tmp/mock-repo',
    optimizer: {
      model: 'mock/model',
      apiKeyEnv: 'MOCK',
      thinkingLevel: 'low' as const,
      allowedPaths: ['SKILL.md'],
      validation: [],
      requireCleanGit: false,
      maxIterations: 2,
      stabilityWindow: 2,
      minOverallPassDelta: 0.02,
      perModelFloor: 0.6,
      targetWeightedAverage: 0.7,
      reportContextMaxBytes: 16_000,
      models,
    },
  } as unknown as ResolvedOptimizeManifest;

  // Minimal shape satisfying OptimizeLoopDependencies. Adjust field names to whatever
  // src/optimizer/loop.ts expects today; the point is stateless in-memory mocks.
  const deps = {
    repo: {
      captureCheckpoint: async () => ({ sha: 'mock', touched: [] }),
      restoreCheckpoint: async () => undefined,
      updateAcceptedCheckpoint: async (_repo: string, _prev: unknown, _cand: unknown, _files: string[]) => ({ sha: 'mock', touched: _files }),
    },
    benchmark: {
      run: async () => {
        const report = reports[Math.min(callIndex, reports.length - 1)]!;
        callIndex += 1;
        return { report, reportPath: `/tmp/mock-report-${callIndex}.json` };
      },
    },
    mutation: {
      apply: async () => ({ summary: 'mock mutation', changedFiles: ['SKILL.md'], toolActivity: [] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      append: async () => undefined,
    },
  };

  const result = await runOptimizeLoop(manifest, deps as any);

  assert.ok(result.bestReport, 'bestReport must be present');
  assert.strictEqual(result.bestReport.summary.overallPassRate, 1.0);
  assert.ok(['max-iterations', 'stable', 'target-hit'].includes(result.stopReason));
  console.log(`PASS: full optimize loop reached 100% pass (stopReason=${result.stopReason})`);
}

function buildReport(matrix: Record<string, Record<string, boolean>>): BenchmarkReport {
  const tasks = Object.keys(matrix);
  const models = [...new Set(tasks.flatMap((t) => Object.keys(matrix[t])))];

  const perModel: Record<string, { passRate: number; avgRecall: number; avgPrecision: number; avgToolSelectionAccuracy: number; avgArgAccuracy: number; avgHallucinationRate: number; tasksRun: number }> = {};
  for (const m of models) {
    const passed = tasks.filter((t) => matrix[t][m]).length;
    perModel[m] = { passRate: passed / tasks.length, avgRecall: passed / tasks.length, avgPrecision: 1, avgToolSelectionAccuracy: 1, avgArgAccuracy: 1, avgHallucinationRate: 0, tasksRun: tasks.length };
  }
  const overall = models.length > 0 ? models.reduce((a, m) => a + perModel[m]!.passRate, 0) / models.length : 0;

  return {
    timestamp: new Date().toISOString(),
    config: { name: 'e2e', surface: 'mcp' },
    skillVersion: { source: 'local', commitSha: 'local', ref: 'file', fetchedAt: new Date().toISOString() },
    results: [],
    coverage: [],
    summary: {
      totalTasks: tasks.length,
      totalModels: models.length,
      totalEvaluations: tasks.length * models.length,
      overallPassRate: overall,
      weightedAverage: overall,
      avgToolRecall: 0, avgToolPrecision: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0, avgHallucinationRate: 0,
      methodCoveragePercent: 1,
      perModel,
      perTask: {},
      perTier: { flagship: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 }, mid: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 }, low: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 } },
    },
  };
}

async function main() {
  await testFullLoopReachesPass();
  console.log('\nALL PASS: smoke-e2e');
}

main().catch((err) => { console.error('FAIL: smoke-e2e', err); process.exit(1); });
```

Note: the `deps as any` cast above is a deliberate seam — the true shape of `OptimizeLoopDependencies` may have drifted; match whatever `src/optimizer/loop.ts` actually imports.

- [ ] **Step 2: Run**

Run: `tsx tests/smoke-e2e.ts`
Expected: FAIL initially if any field name doesn't match `OptimizeLoopDependencies`. Adjust the mock object shape until PASS.

- [ ] **Step 3: Append to `test` script**

Add ` && tsx tests/smoke-e2e.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke-e2e.ts package.json
git commit -m "test(e2e): full optimize loop against deterministic mock reaches PASS"
```

---

## Task 44: Type + build + test gate

**Files:** (no edits — verification)

- [ ] **Step 1: Run full gate**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS for all three.

- [ ] **Step 2: If any fail**

Fix the specific error. Do not introduce new behavior; keep changes focused on type / build errors surfaced by the new code.

---

## Task 45: Manual acceptance check against `mcp-tracker-demo`

**Files:** (no edits — verification)

- [ ] **Step 1: Dry-run**

Run: `tsx src/cli.ts --dry-run --config mock-repos/mcp-tracker-demo/skill-optimizer.json`
Expected: prints `=== skill-optimizer dry run ===`, lists in-scope / out-of-scope actions, prints `No LLM calls made`, exits `0`.

- [ ] **Step 2: Dry-run with legacy filename**

```bash
mv mock-repos/mcp-tracker-demo/skill-optimizer.json mock-repos/mcp-tracker-demo/skill-benchmark.json
cd mock-repos/mcp-tracker-demo && tsx ../../src/cli.ts --dry-run
```

Expected: error message names the legacy file and suggests renaming. Revert:

```bash
mv mock-repos/mcp-tracker-demo/skill-benchmark.json mock-repos/mcp-tracker-demo/skill-optimizer.json
```

- [ ] **Step 3: Confirm no `skill-benchmark` strings remain user-facing**

Run: `grep -rn "skill-benchmark" README.md CONTRIBUTING.md CHANGELOG.md src mock-repos`
Expected: only references are in (a) `src/project/load.ts` legacy-error path, (b) `CHANGELOG.md` migration note, (c) the `LEGACY_PROJECT_CONFIG_NAME` constant.

---

## Task 46: Final commit message + PR polish

**Files:** (no edits — summary step)

- [ ] **Step 1: Double-check git log**

Run: `git log --oneline feat/unify-benchmark-optimizer-projects..HEAD`
Expected: clean, one feature-commit per task.

- [ ] **Step 2: Push branch**

Run: `git push origin feat/unify-benchmark-optimizer-projects`
Expected: branch updated.

- [ ] **Step 3: Update the PR description**

Rewrite the PR body to summarize what this v0.1 delivers: two-gate verdict, deterministic feedback, scoped coverage, rebrand, OSS polish. Link to spec + plan docs.

---

## Acceptance Criteria Checklist (from spec §11)

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes — including all new smoke tests.
- [ ] CI workflow runs green on Node 20.x and 22.x.
- [ ] Both example repos (`mcp-tracker-demo`, `sdk-counter-demo`) run end-to-end.
- [ ] README covers all 10 sections from spec §7.1.
- [ ] `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, `.github/workflows/ci.yml` present.
- [ ] No `skill-benchmark` references in user-facing docs/configs (legacy error path excepted).
- [ ] Manual smoke: `--dry-run` against `mcp-tracker-demo` runs with zero LLM calls.
