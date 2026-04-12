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
