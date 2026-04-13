import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadOptimizeManifest } from '../src/optimizer/manifest.js';
import { analyzeFailures } from '../src/optimizer/failure-analysis.js';
import { runOptimizeLoop } from '../src/optimizer/loop.js';
import { createJsonLedger } from '../src/optimizer/ledger.js';
import { createRepoStateManager } from '../src/optimizer/repo-state.js';
import { collectGitChangedFiles } from '../src/optimizer/mutation/git-changes.js';
import type { BenchmarkReport } from '../src/benchmark/types.js';
import type { OptimizeManifest, OptimizeLoopDependencies } from '../src/optimizer/types.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeReport(overallPassRate: number, kinds: Array<'missing' | 'args' | 'hallucination' | 'error'> = []): BenchmarkReport {
  const baseResult = {
    task: {
      id: `task-${overallPassRate}-${kinds.join('-') || 'ok'}`,
      prompt: 'Do the thing',
      expected_tools: [{ method: 'Client.doThing', args: { id: '123' } }],
    },
    model: {
      id: 'openai/test',
      name: 'Test Model',
      tier: 'flagship' as const,
    },
    generatedCode: 'client.doThing({ id: "123" })',
    rawResponse: 'ok',
    extractedCalls: [],
    toolMatches: [],
    metrics: {
      toolPrecision: 1,
      toolRecall: 1,
      taskPassed: true,
      toolSelectionAccuracy: 1,
      argAccuracy: 1,
      unnecessaryCalls: [],
      hallucinatedCalls: [],
      hallucinationRate: 0,
    },
    llmLatencyMs: 10,
    error: undefined as string | undefined,
  };

  const results = kinds.length === 0
    ? [baseResult]
    : kinds.map((kind, index) => {
        const result = {
          ...baseResult,
          task: {
            ...baseResult.task,
            id: `task-${kind}-${index}`,
          },
          toolMatches: [
            {
              expected: { method: 'Client.doThing', args: { id: '123' } },
              found: kind === 'missing' ? null : { method: 'Client.doThing', args: { id: kind === 'args' ? '999' : '123' }, line: 1, raw: 'mock' },
              methodFound: kind !== 'missing',
              argsCorrect: kind !== 'args',
              matched: kind !== 'missing' && kind !== 'args',
            },
          ],
          metrics: {
            ...baseResult.metrics,
            taskPassed: false,
            toolSelectionAccuracy: kind === 'missing' ? 0 : 1,
            argAccuracy: kind === 'args' ? 0 : 1,
            hallucinatedCalls: kind === 'hallucination' ? ['Client.deleteEverything'] : [],
            hallucinationRate: kind === 'hallucination' ? 1 : 0,
          },
          error: kind === 'error' ? 'provider failed' : undefined,
        };

        return result;
      });

  return {
    timestamp: '2026-04-09T12:00:00.000Z',
    config: { name: 'demo', surface: 'sdk' },
    skillVersion: {
      source: 'local',
      commitSha: 'local',
      ref: 'file',
      fetchedAt: '2026-04-09T12:00:00.000Z',
    },
    results,
    coverage: [],
    summary: {
      totalTasks: results.length,
      totalModels: 1,
      totalEvaluations: results.length,
      overallPassRate,
      avgToolRecall: overallPassRate,
      avgToolPrecision: overallPassRate,
      avgToolSelectionAccuracy: overallPassRate,
      avgArgAccuracy: overallPassRate,
      avgHallucinationRate: 0,
      methodCoveragePercent: 1,
      weightedAverage: overallPassRate,
      perModel: {},
      perTask: {},
      perTier: {
        flagship: { passRate: overallPassRate, avgRecall: overallPassRate, avgToolSelectionAccuracy: overallPassRate, avgArgAccuracy: overallPassRate },
        mid: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
        low: { passRate: 0, avgRecall: 0, avgToolSelectionAccuracy: 0, avgArgAccuracy: 0 },
      },
    },
  };
}

function makeBenchmarkRunResult(
  report: BenchmarkReport,
  opts: { outputDir: string; label: string },
  persist = false,
): { report: BenchmarkReport; reportPath: string } {
  const reportDir = join(opts.outputDir, opts.label);
  const reportPath = join(reportDir, 'report.json');
  if (persist) {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  }
  return { report, reportPath };
}

function makeManifest(): OptimizeManifest {
  return {
    benchmarkConfig: '/tmp/benchmark.config.json',
    targetRepo: {
      path: '/tmp/target-repo',
      surface: 'sdk',
      allowedPaths: ['src', 'README.md'],
      validation: ['npm test'],
      requireCleanGit: true,
    },
    optimizer: {
      mode: 'stable-surface' as any,
      maxIterations: 5,
      stabilityWindow: 2,
      minOverallPassDelta: 0.01,
      taskGeneration: {
        enabled: false,
        maxGenerated: 10,
        seed: 1,
        outputDir: '/tmp/skill-optimizer',
      },
    },
  };
}

console.log('\n=== Optimizer Smoke Tests ===\n');

await test('loadOptimizeManifest: applies defaults', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-'));
  try {
    const file = join(dir, 'skill-optimizer.json');
    writeFileSync(file, JSON.stringify({
      name: 'opt-defaults',
      target: {
        surface: 'sdk',
        repoPath: '../sdk',
        sdk: { language: 'typescript', apiSurface: ['Client.doThing'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
      optimize: {
        model: 'openrouter/openai/gpt-5.4',
        allowedPaths: ['src'],
        validation: ['npm test'],
      },
    }), 'utf-8');

    const manifest = await loadOptimizeManifest(file);
    assertEqual(manifest.optimizer.maxIterations, 5, 'maxIterations default');
    assertEqual(manifest.optimizer.stabilityWindow, 2, 'stabilityWindow default');
    assertEqual(manifest.optimizer.taskGeneration.enabled, false, 'taskGeneration.enabled default');
    assertEqual(manifest.optimizer.taskGeneration.maxGenerated, 10, 'taskGeneration.maxGenerated default');
    assertEqual(manifest.optimizer.taskGeneration.outputDir, join(dir, '.skill-optimizer'), 'taskGeneration.outputDir default');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('loadOptimizeManifest: defaults optimize.model to the first benchmark model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-'));
  try {
    const file = join(dir, 'skill-optimizer.json');
    writeFileSync(file, JSON.stringify({
      name: 'opt-default-model',
      target: {
        surface: 'sdk',
        repoPath: '../sdk',
        sdk: { language: 'typescript', apiSurface: ['Client.doThing'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
      optimize: {
        allowedPaths: ['src'],
        validation: ['npm test'],
      },
    }), 'utf-8');

    const manifest = await loadOptimizeManifest(file);
    assertEqual(manifest.mutation?.provider, 'openrouter', 'mutation provider should default from the first benchmark model');
    assertEqual(manifest.mutation?.model, 'openai/gpt-5.4', 'mutation model should default from the first benchmark model');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('loadOptimizeManifest: allows empty target validation commands', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-'));
  try {
    const file = join(dir, 'skill-optimizer.json');
    writeFileSync(file, JSON.stringify({
      name: 'opt-validation',
      target: {
        surface: 'sdk',
        repoPath: '../sdk',
        sdk: { language: 'typescript', apiSurface: ['Client.doThing'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
      optimize: {
        model: 'openrouter/openai/gpt-5.4',
        allowedPaths: ['src'],
        validation: [],
      },
    }), 'utf-8');

    const manifest = await loadOptimizeManifest(file);
    assertEqual(manifest.targetRepo.validation.length, 0, 'empty validation array should be preserved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('loadOptimizeManifest: rejects requireCleanGit=false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-'));
  try {
    const file = join(dir, 'skill-optimizer.json');
    writeFileSync(file, JSON.stringify({
      name: 'opt-clean-git',
      target: {
        surface: 'sdk',
        repoPath: '../sdk',
        sdk: { language: 'typescript', apiSurface: ['Client.doThing'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
      optimize: {
        model: 'openrouter/openai/gpt-5.4',
        allowedPaths: ['src'],
        validation: ['npm test'],
        requireCleanGit: false,
      },
    }), 'utf-8');

    let threw = false;
    try {
      await loadOptimizeManifest(file);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('requireCleanGit'), 'error should mention requireCleanGit');
    }

    assert(threw, 'should reject requireCleanGit=false');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('loadOptimizeManifest: rejects invalid optimizer numeric values', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-'));
  try {
    const file = join(dir, 'skill-optimizer.json');
    writeFileSync(file, JSON.stringify({
      name: 'opt-invalid-values',
      target: {
        surface: 'sdk',
        repoPath: '../sdk',
        sdk: { language: 'typescript', apiSurface: ['Client.doThing'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
        taskGeneration: {
          enabled: false,
          maxTasks: 0,
          seed: -1,
          outputDir: '',
        },
      },
      optimize: {
        model: 'openrouter/openai/gpt-5.4',
        allowedPaths: ['src'],
        validation: ['npm test'],
        maxIterations: 0,
        stabilityWindow: 0,
        minImprovement: -0.1,
        reportContextMaxBytes: 0,
      },
    }), 'utf-8');

    let threw = false;
    try {
      await loadOptimizeManifest(file);
    } catch (error: any) {
        threw = true;
        assert(
        error.message.includes('maxIterations') || error.message.includes('stabilityWindow') || error.message.includes('minImprovement') || error.message.includes('maxTasks') || error.message.includes('seed') || error.message.includes('outputDir') || error.message.includes('reportContextMaxBytes'),
        'error should mention invalid optimizer numeric field',
      );
    }

    assert(threw, 'should reject invalid optimizer numeric values');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('analyzeFailures: ranks buckets by count', () => {
  const report = makeReport(0.2, ['missing', 'missing', 'args', 'hallucination', 'error']);
  const buckets = analyzeFailures(report);
  assertEqual(buckets[0].kind, 'missing-tool', 'missing-tool should rank first');
  assertEqual(buckets[0].count, 2, 'missing-tool count');
  assertEqual(buckets[1].kind, 'bad-args', 'bad-args should rank second');
  assertEqual(buckets[2].kind, 'hallucination', 'hallucination should rank third');
  assertEqual(buckets[3].kind, 'error', 'error should rank fourth');
});

await test('runOptimizeLoop: stops after max iterations', async () => {
  const manifest = makeManifest();
  manifest.optimizer!.maxIterations = 3;
  manifest.optimizer!.stabilityWindow = 10;

  let runCount = 0;
  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => {
        runCount++;
        return makeBenchmarkRunResult(makeReport(0.4), opts);
      },
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => {},
      updateAcceptedCheckpoint: async () => 'checkpoint-1',
    },
    mutation: {
      apply: async () => ({ summary: 'noop', changedFiles: ['src/index.ts'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.iterations.length, 3, 'should run 3 iterations');
  assertEqual(result.stopReason, 'max-iterations', 'should stop on max iterations');
  assertEqual(runCount, 4, 'baseline plus one benchmark run per iteration');
});

await test('runOptimizeLoop: starts a new epoch baseline after accepted surface change', async () => {
  const manifest = makeManifest() as OptimizeManifest & {
    optimizer: OptimizeManifest['optimizer'] & { mode: 'surface-changing' };
    targetRepo: OptimizeManifest['targetRepo'] & { surfacePaths: string[] };
  };
  manifest.optimizer.mode = 'surface-changing';
  manifest.optimizer.maxIterations = 1;
  manifest.optimizer.taskGeneration!.enabled = true;
  manifest.targetRepo.surfacePaths = ['src/server.ts'];

  const benchmarkLabels: string[] = [];
  let generationCount = 0;
  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => {
        benchmarkLabels.push(opts.label);
        const score = opts.label === 'baseline' ? 0.4 : opts.label === 'iteration-1' ? 0.6 : 0.55;
        return makeBenchmarkRunResult(makeReport(score), opts);
      },
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => {},
      updateAcceptedCheckpoint: async () => 'checkpoint-2',
    },
    mutation: {
      apply: async () => ({ summary: 'rename tool', changedFiles: ['src/server.ts'] }),
    },
    taskGenerator: {
      generate: async () => {
        generationCount += 1;
        return {
          benchmarkConfigPath: `/tmp/generated-${generationCount}.json`,
          taskCount: 3,
          rejectedCount: 0,
        };
      },
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(generationCount, 2, 'surface-changing mode should regenerate tasks after accepted surface changes');
  assertEqual(benchmarkLabels.join(','), 'baseline,epoch-2-baseline', 'should start a new epoch baseline after the surface change is accepted');
  assertEqual(result.bestReport.summary.overallPassRate, 0.55, 'best report should become the new epoch baseline');
});

await test('runOptimizeLoop: rejects surface changes in stable-surface mode', async () => {
  const manifest = makeManifest() as OptimizeManifest & {
    targetRepo: OptimizeManifest['targetRepo'] & { surfacePaths: string[] };
  };
  manifest.optimizer!.maxIterations = 1;
  manifest.targetRepo.surfacePaths = ['src/server.ts'];

  let restoreCalls = 0;
  let runCount = 0;
  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => {
        runCount += 1;
        return makeBenchmarkRunResult(makeReport(runCount === 1 ? 0.4 : 0.9), opts);
      },
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => { restoreCalls += 1; },
      updateAcceptedCheckpoint: async () => 'checkpoint-2',
    },
    mutation: {
      apply: async () => ({ summary: 'rename tool anyway', changedFiles: ['src/server.ts'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.iterations[0]?.accepted, false, 'stable-surface mode should reject surface changes');
  assert(result.iterations[0]?.validation.commands[0]?.stderr.includes('stable-surface'), 'validation should explain why the change was rejected');
  assertEqual(restoreCalls, 1, 'restoreCheckpoint should run after rejecting a surface change');
  assertEqual(runCount, 1, 'benchmark rerun should be skipped when the callable surface changed');
});

await test('runOptimizeLoop: rejects surface-changing mode when task generation is disabled', async () => {
  const manifest = makeManifest() as OptimizeManifest & {
    optimizer: OptimizeManifest['optimizer'] & { mode: 'surface-changing' };
  };
  manifest.optimizer.mode = 'surface-changing';
  manifest.optimizer.taskGeneration!.enabled = false;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => makeBenchmarkRunResult(makeReport(0.4), opts),
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => {},
      updateAcceptedCheckpoint: async () => 'checkpoint-2',
    },
    mutation: {
      apply: async () => ({ summary: 'noop', changedFiles: [] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  let threw = false;
  try {
    await runOptimizeLoop(manifest, deps);
  } catch (error: any) {
    threw = true;
    assert(error.message.includes('surface-changing optimize mode requires task generation'), 'error should explain the invariant');
  }
  assert(threw, 'surface-changing mode without generation should throw');
});

await test('runOptimizeLoop: applies defaults to partially specified manifests', async () => {
  const manifest: OptimizeManifest = {
    benchmarkConfig: '/tmp/benchmark.config.json',
    targetRepo: {
      path: '/tmp/target-repo',
      surface: 'sdk',
      allowedPaths: ['src'],
      validation: ['npm test'],
    },
    optimizer: {
      maxIterations: 1,
      taskGeneration: {
        enabled: false,
      },
    },
  };

  const scores = [0.40, 0.50];
  let index = 0;
  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => makeBenchmarkRunResult(makeReport(scores[Math.min(index++, scores.length - 1)]!), opts),
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => {},
      updateAcceptedCheckpoint: async () => 'checkpoint-2',
    },
    mutation: {
      apply: async () => ({ summary: 'improve names', changedFiles: ['src/client.ts'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.iterations[0]?.accepted, true, 'default minOverallPassDelta should still allow acceptance');
});

await test('runOptimizeLoop: rejects requireCleanGit=false even for programmatic manifests', async () => {
  const manifest = makeManifest();
  manifest.targetRepo.requireCleanGit = false;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => makeBenchmarkRunResult(makeReport(0.4), opts),
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => {},
      updateAcceptedCheckpoint: async () => 'checkpoint-1',
    },
    mutation: {
      apply: async () => ({ summary: 'noop', changedFiles: ['src/index.ts'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  let threw = false;
  try {
    await runOptimizeLoop(manifest, deps);
  } catch (error: any) {
    threw = true;
    assert(error.message.includes('requireCleanGit'), 'error should mention requireCleanGit');
  }

  assert(threw, 'runOptimizeLoop should reject requireCleanGit=false');
});

await test('runOptimizeLoop: stops early when stable', async () => {
  const manifest = makeManifest();
  manifest.optimizer!.maxIterations = 5;
  manifest.optimizer!.stabilityWindow = 2;

  const scores = [0.40, 0.50, 0.50, 0.50];
  let index = 0;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => makeBenchmarkRunResult(makeReport(scores[Math.min(index++, scores.length - 1)]!), opts),
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => {},
      updateAcceptedCheckpoint: async () => 'checkpoint-2',
    },
    mutation: {
      apply: async () => ({ summary: 'tweak sdk docs', changedFiles: ['README.md'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.stopReason, 'stable', 'should stop once score is stable');
  assertEqual(result.iterations.length, 3, 'one improvement followed by two stable iterations');
});

await test('runOptimizeLoop: rejects validation failures and restores checkpoint', async () => {
  const manifest = makeManifest();
  let restoreCalls = 0;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => makeBenchmarkRunResult(makeReport(0.4), opts),
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => { restoreCalls++; },
      updateAcceptedCheckpoint: async () => 'checkpoint-1',
    },
    mutation: {
      apply: async () => ({ summary: 'break it', changedFiles: ['src/index.ts'] }),
    },
    validation: {
      run: async () => ({ ok: false, commands: [{ command: 'npm test', ok: false, exitCode: 1, stdout: '', stderr: 'failed' }] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.iterations[0]?.accepted, false, 'iteration should be rejected');
  assert(restoreCalls > 0, 'restoreCheckpoint should be called after validation failure');
});

await test('runOptimizeLoop: restores checkpoint when benchmark rerun throws after mutation', async () => {
  const manifest = makeManifest();
  let restoreCalls = 0;
  let runCount = 0;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => {
        runCount += 1;
        if (runCount === 1) return makeBenchmarkRunResult(makeReport(0.4), opts);
        throw new Error('rerun failed');
      },
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => { restoreCalls++; },
      updateAcceptedCheckpoint: async () => 'checkpoint-1',
    },
    mutation: {
      apply: async () => ({ summary: 'change sdk code', changedFiles: ['src/index.ts'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  let threw = false;
  try {
    await runOptimizeLoop(manifest, deps);
  } catch (error: any) {
    threw = true;
    assert(error.message.includes('rerun failed'), 'should surface benchmark rerun error');
  }

  assert(threw, 'loop should throw when benchmark rerun fails');
  assertEqual(restoreCalls, 1, 'restoreCheckpoint should run before propagating error');
});

await test('runOptimizeLoop: restores checkpoint when mutation executor throws', async () => {
  const manifest = makeManifest();
  let restoreCalls = 0;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => makeBenchmarkRunResult(makeReport(0.4), opts),
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => { restoreCalls++; },
      updateAcceptedCheckpoint: async () => 'checkpoint-1',
    },
    mutation: {
      apply: async () => {
        throw new Error('mutation transport failed');
      },
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  let threw = false;
  try {
    await runOptimizeLoop(manifest, deps);
  } catch (error: any) {
    threw = true;
    assert(error.message.includes('mutation transport failed'), 'should surface mutation error');
  }

  assert(threw, 'loop should throw when mutation executor fails');
  assertEqual(restoreCalls, 1, 'restoreCheckpoint should run on mutation errors too');
});

await test('runOptimizeLoop: rejects changes outside allowed paths', async () => {
  const manifest = makeManifest();
  manifest.optimizer!.maxIterations = 1;
  let restoreCalls = 0;
  let runCount = 0;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => {
        runCount += 1;
        return makeBenchmarkRunResult(makeReport(0.4), opts);
      },
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => { restoreCalls++; },
      updateAcceptedCheckpoint: async () => 'checkpoint-1',
    },
    mutation: {
      apply: async () => ({ summary: 'edit forbidden path', changedFiles: ['scripts/release.sh'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.iterations[0]?.accepted, false, 'iteration should be rejected');
  assert(result.iterations[0]?.validation.commands[0]?.stderr.includes('allowed paths'), 'validation message should explain the rejection');
  assertEqual(restoreCalls, 1, 'restoreCheckpoint should run for out-of-scope edits');
  assertEqual(runCount, 1, 'benchmark rerun should be skipped when changed files are out of scope');
});

await test('runOptimizeLoop: rejects validation side effects outside allowed paths', async () => {
  const manifest = makeManifest();
  manifest.optimizer!.maxIterations = 1;
  let restoreCalls = 0;
  let commitCalls = 0;
  let benchmarkRuns = 0;

  const deps: OptimizeLoopDependencies = {
    benchmark: {
      run: async (_configPath, opts) => {
        benchmarkRuns += 1;
        return makeBenchmarkRunResult(makeReport(0.4), opts);
      },
    },
    repo: {
      ensureReady: async () => 'clean',
      captureCheckpoint: async () => 'checkpoint-1',
      restoreCheckpoint: async () => { restoreCalls++; },
      updateAcceptedCheckpoint: async () => {
        commitCalls += 1;
        return 'checkpoint-2';
      },
      listChangedFiles: async () => ['src/index.ts', 'scripts/generated-report.json'],
    },
    mutation: {
      apply: async () => ({ summary: 'edit allowed path', changedFiles: ['src/index.ts'] }),
    },
    validation: {
      run: async () => ({ ok: true, commands: [{ command: 'npm test', ok: true, exitCode: 0, stdout: '', stderr: '' }] }),
    },
    ledger: {
      record: async () => {},
    },
  };

  const result = await runOptimizeLoop(manifest, deps);
  assertEqual(result.iterations[0]?.accepted, false, 'iteration should be rejected');
  assertEqual(result.iterations[0]?.changedFiles.includes('scripts/generated-report.json'), true, 'iteration should record final changed files');
  assert(result.iterations[0]?.validation.commands[0]?.stderr.includes('allowed paths'), 'validation should explain out-of-scope side effect');
  assertEqual(restoreCalls, 1, 'restoreCheckpoint should run for validation side effects');
  assertEqual(commitCalls, 0, 'out-of-scope side effects must not be committed');
  assertEqual(benchmarkRuns, 1, 'benchmark rerun should be skipped when post-validation scope check fails');
});

await test('createJsonLedger: recovers from corrupted ledger file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-ledger-'));
  try {
    const ledgerPath = join(dir, 'optimize-ledger.json');
    writeFileSync(ledgerPath, '{not-json', 'utf-8');
    const ledger = createJsonLedger(ledgerPath);
    await ledger.record({ type: 'baseline', score: 0.5 });

    const saved = JSON.parse(readFileSync(ledgerPath, 'utf-8')) as { version: number; events: Array<Record<string, unknown>> };
    assertEqual(saved.version, 1, 'recovered ledger should reset version');
    assertEqual(saved.events.length, 1, 'recovered ledger should record the new event');
    assert(existsSync(`${ledgerPath}.corrupt`), 'corrupt ledger should be preserved with .corrupt suffix');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('createRepoStateManager: commits accepted changes without git identity config', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-repo-state-'));
  const previousHome = process.env.HOME;
  const previousGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
    writeFileSync(join(dir, 'tracked.txt'), 'v1\n', 'utf-8');
    execFileSync('git', ['add', 'tracked.txt'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'init'], {
      cwd: dir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: dir,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Init User',
        GIT_AUTHOR_EMAIL: 'init@example.com',
        GIT_COMMITTER_NAME: 'Init User',
        GIT_COMMITTER_EMAIL: 'init@example.com',
      },
    });

    process.env.HOME = dir;
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';

    writeFileSync(join(dir, 'tracked.txt'), 'v2\n', 'utf-8');
    const manager = createRepoStateManager();
    const targetRepo = {
      path: dir,
      surface: 'sdk' as const,
      allowedPaths: ['tracked.txt'],
      validation: ['true'],
      requireCleanGit: true,
    };

    const headBefore = await manager.captureCheckpoint(targetRepo);
    const headAfter = await manager.updateAcceptedCheckpoint(
      targetRepo,
      headBefore,
      { summary: 'update tracked file', changedFiles: ['tracked.txt'] },
      ['tracked.txt'],
    );

    assert(headAfter !== headBefore, 'commit should advance HEAD even without configured git identity');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousGitConfigGlobal === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL;
    } else {
      process.env.GIT_CONFIG_GLOBAL = previousGitConfigGlobal;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('createRepoStateManager: ignores optimizer artifacts during clean-git check', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-clean-ignore-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.name', 'OpenCode'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.email', 'opencode@example.com'], { cwd: dir, encoding: 'utf-8' });

    writeFileSync(join(dir, 'tracked.txt'), 'v1\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf-8' });

    mkdirSync(join(dir, '.skill-optimizer'), { recursive: true });
    writeFileSync(join(dir, '.skill-optimizer', 'report.json'), '{}\n', 'utf-8');

    const manager = createRepoStateManager();
    const targetRepo = {
      path: dir,
      surface: 'sdk' as const,
      allowedPaths: ['tracked.txt'],
      validation: ['true'],
      requireCleanGit: true,
      cleanIgnorePaths: ['.skill-optimizer'],
    } as any;

    const result = await manager.ensureReady(targetRepo);
    assertEqual(result, 'ready', 'optimizer artifacts should not block reruns');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('createRepoStateManager: restoreCheckpoint removes ignored files outside preserved paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-restore-ignore-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.name', 'OpenCode'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.email', 'opencode@example.com'], { cwd: dir, encoding: 'utf-8' });

    writeFileSync(join(dir, '.gitignore'), '.skill-optimizer/\ndist/\n', 'utf-8');
    writeFileSync(join(dir, 'tracked.txt'), 'v1\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf-8' });

    mkdirSync(join(dir, '.skill-optimizer'), { recursive: true });
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, '.skill-optimizer', 'report.json'), '{}\n', 'utf-8');
    writeFileSync(join(dir, 'dist', 'leak.txt'), 'secret\n', 'utf-8');

    const manager = createRepoStateManager();
    const targetRepo = {
      path: dir,
      surface: 'sdk' as const,
      allowedPaths: ['tracked.txt'],
      validation: ['true'],
      requireCleanGit: true,
      cleanIgnorePaths: ['.skill-optimizer'],
    } as any;

    const checkpoint = await manager.captureCheckpoint(targetRepo);
    await manager.restoreCheckpoint(targetRepo, checkpoint);

    assert(!existsSync(join(dir, 'dist', 'leak.txt')), 'restoreCheckpoint should remove ignored files outside preserved paths');
    assert(existsSync(join(dir, '.skill-optimizer', 'report.json')), 'restoreCheckpoint should preserve optimizer artifacts');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('collectGitChangedFiles: includes ignored files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-git-ignored-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.name', 'OpenCode'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.email', 'opencode@example.com'], { cwd: dir, encoding: 'utf-8' });

    writeFileSync(join(dir, '.gitignore'), 'dist/\n', 'utf-8');
    writeFileSync(join(dir, 'tracked.txt'), 'v1\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf-8' });

    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'leak.txt'), 'oops\n', 'utf-8');

    const files = await collectGitChangedFiles(dir);
    assert(files.includes('dist/leak.txt'), 'should include ignored file changes for scope enforcement');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('collectGitChangedFiles: includes unstaged, staged, and untracked files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-git-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.name', 'OpenCode'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.email', 'opencode@example.com'], { cwd: dir, encoding: 'utf-8' });

    writeFileSync(join(dir, 'tracked.txt'), 'v1\n', 'utf-8');
    writeFileSync(join(dir, 'staged.txt'), 'v1\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf-8' });

    writeFileSync(join(dir, 'tracked.txt'), 'v2\n', 'utf-8');
    writeFileSync(join(dir, 'staged.txt'), 'v2\n', 'utf-8');
    writeFileSync(join(dir, 'untracked.txt'), 'v1\n', 'utf-8');
    execFileSync('git', ['add', 'staged.txt'], { cwd: dir, encoding: 'utf-8' });

    const files = await collectGitChangedFiles(dir);
    assert(files.includes('tracked.txt'), 'should include unstaged file');
    assert(files.includes('staged.txt'), 'should include staged file');
    assert(files.includes('untracked.txt'), 'should include untracked file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
