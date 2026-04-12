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
