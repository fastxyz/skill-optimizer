import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runWorkbenchCase, runWorkbenchCaseFromCli } from '../src/workbench/run-case.js';

test('runWorkbenchCase preserves failing result as process exitCode 1', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-run-case-'));
  const previousExitCode = process.exitCode;
  try {
    const resultsDir = join(root, 'results');
    mkdirSync(resultsDir, { recursive: true });
    const resultPath = join(resultsDir, 'result.json');
    writeFileSync(resultPath, JSON.stringify({
      pass: false,
      score: 0,
      evidence: ['expected failure'],
    }), 'utf-8');
    process.exitCode = undefined;

    await runWorkbenchCase(
      { casePath: join(root, 'case.yml') },
      {
        runDockerWorkbenchCase: async () => ({
          tempDir: join(root, 'temp'),
          caseDir: join(root, 'temp', 'case'),
          bundledCasePath: join(root, 'temp', 'case', 'case.yml'),
          workDir: join(root, 'temp', 'work'),
          resultsDir,
          resultPath,
          tracePath: join(resultsDir, 'trace.jsonl'),
          cleanup: () => {},
        }),
      },
    );

    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchCaseFromCli rejects invalid --model before loading the case', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-run-case-model-'));
  try {
    await assert.rejects(
      runWorkbenchCaseFromCli([
        join(root, 'missing-case.yml'),
        '--model',
        'anthropic/claude-3-5-haiku-latest',
      ]),
      /Workbench only supports OpenRouter model refs, got: anthropic\/claude-3-5-haiku-latest/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
