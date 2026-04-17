import { strict as assert } from 'node:assert';
import { computeVerdict } from '../src/benchmark/scoring.js';
import type { BenchmarkReport, ModelConfig, BenchmarkSurface } from '../src/benchmark/types.js';
import { resolveCriteriaForTask } from '../src/benchmark/prompt-criteria.js';
import { evaluatePromptResponse } from '../src/benchmark/prompt-evaluator.js';
import type { PromptCapabilityWithSection } from '../src/project/discover-prompt.js';

function syntheticReport(
  perModel: Record<string, number>,
  surface: BenchmarkSurface,
  opts?: { coverageViolation?: boolean; weightedAverage?: number },
): BenchmarkReport {
  const entries = Object.entries(perModel);
  const summaryPerModel: Record<string, {
    passRate: number; avgRecall: number; avgPrecision: number;
    avgToolSelectionAccuracy: number; avgArgAccuracy: number;
    avgHallucinationRate: number; tasksRun: number;
  }> = {};
  for (const [id, rate] of entries) {
    summaryPerModel[id] = {
      passRate: rate, avgRecall: 0, avgPrecision: 0,
      avgToolSelectionAccuracy: 0, avgArgAccuracy: 0,
      avgHallucinationRate: 0, tasksRun: 10,
    };
  }
  const overall = entries.reduce((a, [, r]) => a + r, 0) / Math.max(1, entries.length);
  const wavg = opts?.weightedAverage ?? overall;
  return {
    timestamp: new Date().toISOString(),
    config: { name: 'syn', surface },
    skillVersion: { source: 'local', commitSha: 'local', ref: 'file', fetchedAt: new Date().toISOString() },
    results: [],
    coverage: [],
    scopeCoverage: opts?.coverageViolation
      ? {
          coverageViolation: true,
          inScopeActions: ['a', 'b'],
          outOfScopeActions: [],
          coveredActions: ['a'],
          uncoveredActions: ['b'],
          tasksPerAction: { a: 3, b: 0 },
        }
      : undefined,
    summary: {
      totalTasks: 10, totalModels: entries.length, totalEvaluations: 10 * entries.length,
      overallPassRate: overall, weightedAverage: wavg,
      avgToolRecall: 0, avgToolPrecision: 0, avgToolSelectionAccuracy: 0,
      avgArgAccuracy: 0, avgHallucinationRate: 0, methodCoveragePercent: 1,
      perModel: summaryPerModel, perTask: {},
      perTier: {
        flagship: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
        mid: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
        low: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
      },
    },
  };
}

function testPromptSurfaceIgnoresCoverageViolation() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const report = syntheticReport({ a: 0.9, b: 0.85 }, 'prompt', {
    coverageViolation: true,
    weightedAverage: 0.875,
  });
  const verdict = computeVerdict(report, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7 });
  assert.strictEqual(verdict.result, 'PASS',
    'prompt surface with scores above floor must PASS despite coverageViolation=true');
  assert.ok(!verdict.reasons.some(r => r.includes('coverage')),
    'verdict reasons must not mention coverage for prompt surface');
  console.log('PASS: prompt surface ignores coverage violation');
}

function testMcpSurfaceStillBlocksOnCoverageViolation() {
  const models: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const report = syntheticReport({ a: 0.9, b: 0.85 }, 'mcp', {
    coverageViolation: true,
    weightedAverage: 0.875,
  });
  const verdict = computeVerdict(report, models, { perModelFloor: 0.6, targetWeightedAverage: 0.7 });
  assert.strictEqual(verdict.result, 'FAIL',
    'mcp surface must still FAIL on coverage violation (regression guard)');
  assert.ok(verdict.reasons.some(r => r.includes('coverage')),
    'verdict reasons must mention coverage for non-prompt surfaces');
  console.log('PASS: mcp surface still blocks on coverage violation');
}

// ── Helpers for scenarios 6-7 ────────────────────────────────────────────────

function makeCap(key: string, section: string): PromptCapabilityWithSection {
  return {
    action: {
      key,
      name: key,
      description: `Capability: ${key}`,
      args: [],
    },
    section,
  };
}

// ── Scenario 6: distinct criteria per capability (caps[0]-collapse guard) ────

function testDistinctCriteriaPerCapability() {
  const caps: PromptCapabilityWithSection[] = [
    makeCap('summarize', '## Summary\nProvide a summary section.\nInclude key points.'),
    makeCap('translate', '## Translation\nList the translated output.\nSpecify the target language.'),
    makeCap('classify', '## Classification\nShow a numbered list of categories.\nInclude confidence score.'),
  ];

  const tasks = caps.map((cap) => ({
    id: `task_${cap.action.key}`,
    prompt: `Perform ${cap.action.key} on the given text.`,
    expected_actions: [] as Array<{ name: string; args?: Record<string, unknown> }>,
    capabilityId: cap.action.key,
  }));

  const criteriaList = tasks.map((task) => resolveCriteriaForTask(task, caps).criteria);

  // All 3 criteria must be mutually distinct — none should be equal to another.
  for (let i = 0; i < criteriaList.length; i++) {
    for (let j = i + 1; j < criteriaList.length; j++) {
      const ci = JSON.stringify(criteriaList[i]);
      const cj = JSON.stringify(criteriaList[j]);
      assert.notStrictEqual(
        ci,
        cj,
        `caps[${i}] and caps[${j}] criteria must be distinct (caps[0]-collapse guard): ` +
          `got identical criteria ${ci}`,
      );
    }
  }
  console.log('PASS: distinct criteria per capability (caps[0] collapse guard)');
}

// ── Scenario 7: empty criteria → noActiveCriteria via evaluator (P3 guard) ───

function testNoActiveCriteriaViaEvaluator() {
  // A cap with empty section produces no extractable criteria.
  const cap = makeCap('empty_cap', '');
  const task = {
    id: 'task_empty',
    prompt: 'Do something with empty_cap.',
    expected_actions: [] as Array<{ name: string; args?: Record<string, unknown> }>,
    capabilityId: 'empty_cap',
  };

  const { criteria } = resolveCriteriaForTask(task, [cap]);
  const result = evaluatePromptResponse('any response text', criteria);

  assert.strictEqual(result.score, 0, 'empty criteria → score must be 0');
  assert.strictEqual(result.noActiveCriteria, true, 'empty criteria → noActiveCriteria must be true');
  console.log('PASS: empty criteria → noActiveCriteria via evaluator (P3 regression guard)');
}

// ── Scenario 8: mock-LLM verdict matrix (threshold off-by-one + weight math) ─

function testVerdictMatrix() {
  const models2: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship' },
    { id: 'b', name: 'B', tier: 'mid' },
  ];
  const policy = { perModelFloor: 0.6, targetWeightedAverage: 0.7 };

  // 8a: both 1.0 → PASS
  const r8a = syntheticReport({ a: 1.0, b: 1.0 }, 'prompt', { weightedAverage: 1.0 });
  assert.strictEqual(computeVerdict(r8a, models2, policy).result, 'PASS', 'both 1.0 → PASS');

  // 8b: floor inclusive (0.60 == floor)
  const r8b = syntheticReport({ a: 1.0, b: 0.60 }, 'prompt', { weightedAverage: 0.80 });
  assert.strictEqual(computeVerdict(r8b, models2, policy).result, 'PASS', 'floor inclusive at 0.60');

  // 8c: below floor (0.59)
  const r8c = syntheticReport({ a: 1.0, b: 0.59 }, 'prompt', { weightedAverage: 0.795 });
  assert.strictEqual(computeVerdict(r8c, models2, policy).result, 'FAIL', '0.59 < floor → FAIL');

  // 8d: weights 2:1 → wavg 0.733 (a=0.80, b=0.60, weights 2:1)
  const models2d: ModelConfig[] = [
    { id: 'a', name: 'A', tier: 'flagship', weight: 2 },
    { id: 'b', name: 'B', tier: 'mid', weight: 1 },
  ];
  const r8d = syntheticReport({ a: 0.80, b: 0.60 }, 'prompt', { weightedAverage: (0.80 * 2 + 0.60 * 1) / 3 });
  assert.strictEqual(
    computeVerdict(r8d, models2d, { perModelFloor: 0.6, targetWeightedAverage: 0.7 }).result,
    'PASS',
    'weight 2:1 wavg 0.733 > 0.7 → PASS',
  );

  // 8e: wavg below target (a=0.70, b=0.60, weights 1:1 → wavg 0.65)
  const r8e = syntheticReport({ a: 0.70, b: 0.60 }, 'prompt', { weightedAverage: 0.65 });
  assert.strictEqual(computeVerdict(r8e, models2, policy).result, 'FAIL', 'wavg 0.65 < target 0.70 → FAIL');

  console.log('PASS: verdict matrix (threshold off-by-one + weight math guards)');
}

async function main() {
  testPromptSurfaceIgnoresCoverageViolation();
  testMcpSurfaceStillBlocksOnCoverageViolation();
  testDistinctCriteriaPerCapability();
  testNoActiveCriteriaViaEvaluator();
  testVerdictMatrix();
  console.log('\nALL PASS: smoke-verdict-prompt');
}

main().catch((err) => {
  console.error('FAIL: smoke-verdict-prompt', err);
  process.exit(1);
});
