import { strict as assert } from 'node:assert';
import { computeVerdict } from '../src/benchmark/scoring.js';
import type { BenchmarkReport, ModelConfig, BenchmarkSurface } from '../src/benchmark/types.js';

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

async function main() {
  testPromptSurfaceIgnoresCoverageViolation();
  testMcpSurfaceStillBlocksOnCoverageViolation();
  console.log('\nALL PASS: smoke-verdict-prompt');
}

main().catch((err) => {
  console.error('FAIL: smoke-verdict-prompt', err);
  process.exit(1);
});
