import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseModelList, slugModelRef } from '../src/workbench/models.js';
import { runWorkbenchCase } from '../src/workbench/run-case.js';

test('parseModelList accepts comma-separated OpenRouter models', () => {
  assert.deepEqual(parseModelList(' openrouter/google/gemini-2.5-flash,openrouter/openai/gpt-5.4 '), [
    'openrouter/google/gemini-2.5-flash',
    'openrouter/openai/gpt-5.4',
  ]);
});

test('parseModelList rejects empty and non-OpenRouter models', () => {
  assert.throws(() => parseModelList(''), /at least one model/);
  assert.throws(() => parseModelList('anthropic/claude-sonnet-4-6'), /OpenRouter/);
});

test('slugModelRef creates filesystem-safe model directories', () => {
  assert.equal(slugModelRef('openrouter/google/gemini-2.5-flash'), 'openrouter-google-gemini-2.5-flash');
  assert.equal(slugModelRef('openrouter/meta-llama/llama-3.3-70b-instruct:free'), 'openrouter-meta-llama-llama-3.3-70b-instruct-free');
});

test('runWorkbenchCase writes aggregate output for multi-model runs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-models-'));
  const previousExitCode = process.exitCode;
  try {
    const casePath = join(root, 'case.yml');
    const outDir = join(root, 'results');
    const calls: Array<{ model?: string; resultsDir?: string }> = [];
    mkdirSync(outDir, { recursive: true });
    writeFileSync(casePath, 'name: model-case\nreferences: ./refs\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n', 'utf-8');

    process.exitCode = undefined;
    await runWorkbenchCase(
      {
        casePath,
        outDir,
        models: ['openrouter/google/gemini-2.5-flash', 'openrouter/openai/gpt-5.4'],
      },
      {
        runDockerWorkbenchCase: async (options) => {
          calls.push({ model: options.model, resultsDir: options.resultsDir });
          assert.ok(options.resultsDir);
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.jsonl');
          const pass = options.model !== 'openrouter/openai/gpt-5.4';
          writeFileSync(resultPath, JSON.stringify({ pass, score: pass ? 1 : 0, evidence: [options.model] }), 'utf-8');
          writeFileSync(tracePath, JSON.stringify({ entries: [] }), 'utf-8');
          return {
            tempDir: join(root, 'temp'),
            caseDir: join(root, 'temp', 'case'),
            bundledCasePath: join(root, 'temp', 'case', 'case.yml'),
            workDir: join(root, 'temp', 'work'),
            resultsDir: options.resultsDir,
            resultPath,
            tracePath,
            cleanup: () => {},
          };
        },
        now: new Date('2026-04-27T10:11:12.000Z'),
      },
    );

    const runResultPath = join(outDir, '20260427-101112', 'run-result.json');
    assert.ok(existsSync(runResultPath));
    const aggregate = JSON.parse(readFileSync(runResultPath, 'utf-8')) as {
      summary: { total: number; passed: number; failed: number; passRate: number; totalTrials: number; passedTrials: number; failedTrials: number };
      results: Array<{ model: string; passHatK: boolean; trials: Array<{ resultPath: string; tracePath: string }> }>;
    };
    assert.deepEqual(calls.map((call) => call.model), [
      'openrouter/google/gemini-2.5-flash',
      'openrouter/openai/gpt-5.4',
    ]);
    assert.equal(aggregate.summary.total, 2);
    assert.equal(aggregate.summary.passed, 1);
    assert.equal(aggregate.summary.failed, 1);
    assert.equal(aggregate.summary.passRate, 0.5);
    assert.equal(aggregate.summary.totalTrials, 2);
    assert.equal(aggregate.summary.passedTrials, 1);
    assert.equal(aggregate.summary.failedTrials, 1);
    assert.equal(aggregate.results[0]?.trials[0]?.resultPath, 'trials/openrouter-google-gemini-2.5-flash--001/result.json');
    assert.equal(aggregate.results[1]?.trials[0]?.tracePath, 'trials/openrouter-openai-gpt-5.4--001/trace.jsonl');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchCase writes aggregate output when --models has one model', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-one-model-'));
  const previousExitCode = process.exitCode;
  try {
    const casePath = join(root, 'case.yml');
    const outDir = join(root, 'results');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(casePath, 'name: model-case\nreferences: ./refs\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n', 'utf-8');

    process.exitCode = undefined;
    await runWorkbenchCase(
      {
        casePath,
        outDir,
        models: ['openrouter/google/gemini-2.5-flash'],
      },
      {
        runDockerWorkbenchCase: async (options) => {
          assert.ok(options.resultsDir);
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.jsonl');
          writeFileSync(resultPath, JSON.stringify({ pass: true, score: 1, evidence: [] }), 'utf-8');
          writeFileSync(tracePath, JSON.stringify({ entries: [] }), 'utf-8');
          return {
            tempDir: join(root, 'temp'),
            caseDir: join(root, 'temp', 'case'),
            bundledCasePath: join(root, 'temp', 'case', 'case.yml'),
            workDir: join(root, 'temp', 'work'),
            resultsDir: options.resultsDir,
            resultPath,
            tracePath,
            cleanup: () => {},
          };
        },
        now: new Date('2026-04-27T10:11:12.000Z'),
      },
    );

    const runResultPath = join(outDir, '20260427-101112', 'run-result.json');
    assert.ok(existsSync(runResultPath));
    assert.ok(existsSync(join(outDir, '20260427-101112', 'trials', 'openrouter-google-gemini-2.5-flash--001', 'result.json')));
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchCase --trials uses the case model when no model override is provided', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-case-model-'));
  const previousExitCode = process.exitCode;
  try {
    const casePath = join(root, 'case.yml');
    const outDir = join(root, 'results');
    const refsDir = join(root, 'refs');
    const calls: Array<{ model?: string }> = [];
    mkdirSync(refsDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      casePath,
      'name: model-case\nreferences: ./refs\nmodel: openrouter/openai/gpt-5.4\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n',
      'utf-8',
    );

    process.exitCode = undefined;
    await runWorkbenchCase(
      {
        casePath,
        outDir,
        trials: 2,
      },
      {
        runDockerWorkbenchCase: async (options) => {
          calls.push({ model: options.model });
          assert.ok(options.resultsDir);
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.jsonl');
          writeFileSync(resultPath, JSON.stringify({ pass: true, score: 1, evidence: [] }), 'utf-8');
          writeFileSync(tracePath, JSON.stringify({ entries: [] }), 'utf-8');
          return {
            tempDir: join(root, 'temp'),
            caseDir: join(root, 'temp', 'case'),
            bundledCasePath: join(root, 'temp', 'case', 'case.yml'),
            workDir: join(root, 'temp', 'work'),
            resultsDir: options.resultsDir,
            resultPath,
            tracePath,
            cleanup: () => {},
          };
        },
        now: new Date('2026-04-27T10:11:12.000Z'),
      },
    );

    assert.deepEqual(calls.map((call) => call.model), [
      'openrouter/openai/gpt-5.4',
      'openrouter/openai/gpt-5.4',
    ]);
    assert.ok(existsSync(join(outDir, '20260427-101112', 'trials', 'openrouter-openai-gpt-5.4--002', 'result.json')));
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});
