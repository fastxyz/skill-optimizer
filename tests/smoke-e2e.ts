/**
 * smoke-e2e.ts — end-to-end optimize loop smoke test with deterministic in-memory mocks.
 * No real LLM or git calls are made.
 */

import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runOptimizeLoop } from '../src/optimizer/loop.js';
import type { BenchmarkReport } from '../src/benchmark/types.js';
import type { OptimizeManifest } from '../src/optimizer/types.js';

// ---------------------------------------------------------------------------
// Helper: build a BenchmarkReport from a pass/fail matrix
// matrix: { taskId -> { modelId -> passed } }
// ---------------------------------------------------------------------------
function buildReport(matrix: Record<string, Record<string, boolean>>): BenchmarkReport {
  const tasks = Object.keys(matrix);
  const modelIds = [...new Set(tasks.flatMap((t) => Object.keys(matrix[t]!)))];

  const perModel: Record<
    string,
    {
      passRate: number;
      avgRecall: number;
      avgPrecision: number;
      avgToolSelectionAccuracy: number;
      avgArgAccuracy: number;
      avgHallucinationRate: number;
      tasksRun: number;
    }
  > = {};

  for (const m of modelIds) {
    const passed = tasks.filter((t) => matrix[t]![m]).length;
    perModel[m] = {
      passRate: passed / tasks.length,
      avgRecall: passed / tasks.length,
      avgPrecision: 1,
      avgToolSelectionAccuracy: 1,
      avgArgAccuracy: 1,
      avgHallucinationRate: 0,
      tasksRun: tasks.length,
    };
  }

  const overall =
    modelIds.length > 0
      ? modelIds.reduce((a, m) => a + perModel[m]!.passRate, 0) / modelIds.length
      : 0;

  return {
    timestamp: new Date().toISOString(),
    config: { name: 'e2e-smoke', surface: 'mcp' } as BenchmarkReport['config'],
    skillVersion: {
      source: 'local',
      commitSha: 'local',
      ref: 'file',
      fetchedAt: new Date().toISOString(),
    },
    results: [],
    coverage: [],
    summary: {
      totalTasks: tasks.length,
      totalModels: modelIds.length,
      totalEvaluations: tasks.length * modelIds.length,
      overallPassRate: overall,
      weightedAverage: overall,
      avgToolRecall: 0,
      avgToolPrecision: 0,
      avgToolSelectionAccuracy: 0,
      avgArgAccuracy: 0,
      avgHallucinationRate: 0,
      methodCoveragePercent: 1,
      perModel,
      perTask: {},
      perTier: {
        flagship: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
        mid: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
        low: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------
async function testFullLoopReachesPass(): Promise<void> {
  // Three benchmark results: baseline 0% -> 50% -> 100%
  const reports: BenchmarkReport[] = [
    buildReport({ a: { m1: false, m2: false }, b: { m1: false, m2: false } }), // 0%
    buildReport({ a: { m1: true, m2: true }, b: { m1: false, m2: false } }),   // 50%
    buildReport({ a: { m1: true, m2: true }, b: { m1: true, m2: true } }),     // 100%
  ];

  // benchmarkCallIndex tracks how many times benchmark.run has been called.
  // Index 0 = baseline, 1 = iteration-1, 2 = iteration-2, ...
  let benchmarkCallIndex = 0;

  // Use a real temp directory so mkdirSync inside the loop doesn't fail.
  const tmpDir = join(tmpdir(), `smoke-e2e-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // The manifest uses OptimizeManifest (unresolved) shape.
  // requireCleanGit must not be false (loop.ts throws if it is exactly false).
  const manifest: OptimizeManifest = {
    benchmarkConfig: join(tmpDir, 'benchmark.json'), // must be a string path
    targetRepo: {
      path: tmpDir,
      surface: 'mcp',
      allowedPaths: ['SKILL.md'],
      validation: [],
      requireCleanGit: undefined as unknown as boolean, // omit = treated as true
    },
    optimizer: {
      maxIterations: 3,
      stabilityWindow: 3, // large window so we don't stop early on stable
      minImprovement: 0.0,  // accept any improvement (even 0 delta)
      perModelFloor: 0,
      targetWeightedAverage: 0,
      models: [
        { id: 'm1', name: 'M1', tier: 'flagship' },
        { id: 'm2', name: 'M2', tier: 'mid' },
      ],
      taskGeneration: {
        enabled: false,
        outputDir: join(tmpDir, '.skill-optimizer'),
      },
    },
  };

  const deps = {
    repo: {
      ensureReady: async (_targetRepo: unknown): Promise<string> => {
        return tmpDir;
      },
      captureCheckpoint: async (_targetRepo: unknown): Promise<string> => {
        return 'mock-checkpoint-sha';
      },
      restoreCheckpoint: async (_targetRepo: unknown, _checkpoint: string): Promise<void> => {
        // no-op
      },
      updateAcceptedCheckpoint: async (
        _targetRepo: unknown,
        _prevCheckpoint: string,
        _candidate: unknown,
        _changedFiles?: string[],
      ): Promise<string> => {
        return 'mock-updated-sha';
      },
    },
    benchmark: {
      run: async (
        _configPath: string,
        _opts: { outputDir: string; label: string },
      ): Promise<{ report: BenchmarkReport; reportPath: string }> => {
        const idx = Math.min(benchmarkCallIndex, reports.length - 1);
        const report = reports[idx]!;
        benchmarkCallIndex += 1;
        return { report, reportPath: join(tmpDir, `report-${benchmarkCallIndex}.json`) };
      },
    },
    mutation: {
      apply: async (_context: unknown): Promise<{
        summary: string;
        changedFiles: string[];
        toolActivity?: string[];
      }> => {
        return {
          summary: 'mock mutation applied',
          changedFiles: ['SKILL.md'],
          toolActivity: [],
        };
      },
    },
    validation: {
      run: async (_targetRepo: unknown): Promise<{ ok: boolean; commands: unknown[] }> => {
        return { ok: true, commands: [] };
      },
    },
    ledger: {
      record: async (_event: Record<string, unknown>): Promise<void> => {
        // no-op
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await runOptimizeLoop(manifest, deps as any);

  assert.ok(result.bestReport, 'bestReport must be present');
  assert.strictEqual(
    result.bestReport.summary.overallPassRate,
    1.0,
    `best report should reach 100% — got ${result.bestReport.summary.overallPassRate}`,
  );

  const validStopReasons: string[] = ['max-iterations', 'stable', 'target-hit'];
  assert.ok(
    validStopReasons.includes(result.stopReason),
    `stopReason should be one of ${validStopReasons.join(', ')}, got ${result.stopReason}`,
  );

  console.log(`PASS: full optimize loop reached 100% pass (stopReason=${result.stopReason})`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  await testFullLoopReachesPass();
  console.log('\nALL PASS: smoke-e2e');
}

main().catch((err) => {
  console.error('FAIL: smoke-e2e', err);
  process.exit(1);
});
