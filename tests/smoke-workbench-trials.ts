import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { aggregateTrials, formatTrialNumber, parseTrialsFlag } from '../src/workbench/trials.js';
import { runWorkbenchSuite } from '../src/workbench/run-suite.js';

test('formatTrialNumber returns stable three-digit slugs', () => {
  assert.equal(formatTrialNumber(1), '001');
  assert.equal(formatTrialNumber(12), '012');
  assert.equal(formatTrialNumber(123), '123');
});

test('parseTrialsFlag rejects invalid trial counts', () => {
  assert.equal(parseTrialsFlag(undefined), 1);
  assert.equal(parseTrialsFlag('3'), 3);
  assert.throws(() => parseTrialsFlag('0'), /positive integer/);
  assert.throws(() => parseTrialsFlag('1.5'), /positive integer/);
});

test('aggregateTrials computes pass@k, pass^k, pass rate, and mean score', () => {
  const aggregate = aggregateTrials([
    { trial: 1, pass: false, score: 0.25 },
    { trial: 2, pass: true, score: 1 },
    { trial: 3, pass: false, score: 0.5 },
  ]);

  assert.equal(aggregate.totalTrials, 3);
  assert.equal(aggregate.passedTrials, 1);
  assert.equal(aggregate.failedTrials, 2);
  assert.equal(aggregate.trialPassRate, 1 / 3);
  assert.equal(aggregate.meanScore, (0.25 + 1 + 0.5) / 3);
  assert.equal(aggregate.passAtK, true);
  assert.equal(aggregate.passHatK, false);
});

test('runWorkbenchSuite writes trial directories and case-model aggregates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-trials-'));
  const previousExitCode = process.exitCode;
  try {
    const suitePath = join(root, 'suite.yml');
    const outDir = join(root, 'results');
    mkdirSync(join(root, 'references'), { recursive: true });
    writeFileSync(join(root, 'references', 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(suitePath, [
      'name: trial-suite',
      'references: ./references',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - name: trial-case',
      '    task: Test trials',
      '    graders:',
      '      - name: passes',
      '        command: "true"',
    ].join('\n'), 'utf-8');

    process.exitCode = undefined;
    await runWorkbenchSuite(
      { suitePath, outDir, trials: 3 },
      {
        now: new Date('2026-04-27T10:11:12.000Z'),
        runDockerWorkbenchCase: async (options) => {
          assert.ok(options.resultsDir);
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.json');
          const summaryPath = join(options.resultsDir, 'trial-summary.json');
          const pass = options.resultsDir.endsWith(join('trials', '002'));
          writeFileSync(resultPath, JSON.stringify({ pass, score: pass ? 1 : 0, evidence: [] }), 'utf-8');
          writeFileSync(tracePath, JSON.stringify({ entries: [] }), 'utf-8');
          writeFileSync(summaryPath, JSON.stringify({ failedGraders: [] }), 'utf-8');
          return {
            tempDir: join(root, 'temp'),
            caseDir: join(root, 'temp', 'case'),
            bundledCasePath: join(root, 'temp', 'case', 'case.yml'),
            workDir: join(root, 'temp', 'work'),
            resultsDir: options.resultsDir,
            resultPath,
            tracePath,
            summaryPath,
            cleanup: () => {},
          };
        },
      },
    );

    const runRoot = join(outDir, '20260427-101112');
    assert.ok(existsSync(join(runRoot, 'cases', 'trial-case', 'openrouter-google-gemini-2.5-flash', 'trials', '001', 'result.json')));
    assert.ok(existsSync(join(runRoot, 'cases', 'trial-case', 'openrouter-google-gemini-2.5-flash', 'trials', '002', 'result.json')));
    assert.ok(existsSync(join(runRoot, 'cases', 'trial-case', 'openrouter-google-gemini-2.5-flash', 'trials', '003', 'result.json')));

    const aggregate = JSON.parse(readFileSync(join(runRoot, 'suite-result.json'), 'utf-8')) as {
      summary: { totalTrials: number; passedTrials: number; failedTrials: number; trialPassRate: number; meanScore: number };
      results: Array<{ passAtK: boolean; passHatK: boolean; totalTrials: number }>;
    };
    assert.equal(aggregate.summary.totalTrials, 3);
    assert.equal(aggregate.summary.passedTrials, 1);
    assert.equal(aggregate.summary.failedTrials, 2);
    assert.equal(aggregate.summary.trialPassRate, 1 / 3);
    assert.equal(aggregate.summary.meanScore, 1 / 3);
    assert.equal(aggregate.results[0]?.passAtK, true);
    assert.equal(aggregate.results[0]?.passHatK, false);
    assert.equal(aggregate.results[0]?.totalTrials, 3);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});
