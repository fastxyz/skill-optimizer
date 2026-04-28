import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadWorkbenchSuite } from '../src/workbench/suite-loader.js';
import { runWorkbenchSuite } from '../src/workbench/run-suite.js';

test('loadWorkbenchSuite resolves case paths and validates models', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-load-'));
  try {
    const suitePath = join(root, 'suite.yml');
    mkdirSync(join(root, 'cases', 'missing-index'), { recursive: true });
    writeFileSync(suitePath, [
      'name: supabase-postgres-best-practices',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - cases/missing-index/case.yml',
    ].join('\n'), 'utf-8');

    const suite = loadWorkbenchSuite(suitePath);

    assert.equal(suite.name, 'supabase-postgres-best-practices');
    assert.deepEqual(suite.models, ['openrouter/google/gemini-2.5-flash']);
    assert.deepEqual(suite.casePaths, [join(root, 'cases', 'missing-index', 'case.yml')]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadWorkbenchSuite supports inline cases with suite defaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-inline-load-'));
  try {
    const suitePath = join(root, 'suite.yml');
    mkdirSync(join(root, 'references'), { recursive: true });
    writeFileSync(join(root, 'references', 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(suitePath, [
      'name: react-best-practices',
      'references: ./references',
      'env:',
      '  - OPENROUTER_API_KEY',
      'timeoutSeconds: 123',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - name: async-parallel',
      '    task: Make this faster',
      '    graders:',
      '      - name: async-parallel',
      '        command: node checks/react.mjs async-parallel',
    ].join('\n'), 'utf-8');

    const suite = loadWorkbenchSuite(suitePath);

    assert.equal(suite.name, 'react-best-practices');
    assert.equal(suite.cases[0]?.slug, 'async-parallel');
    assert.equal(suite.cases[0]?.case?.referencesDir, join(root, 'references'));
    assert.deepEqual(suite.cases[0]?.case?.env, ['OPENROUTER_API_KEY']);
    assert.equal(suite.cases[0]?.case?.timeoutSeconds, 123);
    assert.deepEqual(suite.cases[0]?.case?.graders, [
      { name: 'async-parallel', command: 'node checks/react.mjs async-parallel' },
    ]);
    assert.deepEqual(suite.casePaths, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchSuite writes case-model matrix aggregate output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-'));
  const previousExitCode = process.exitCode;
  try {
    const suitePath = join(root, 'suite.yml');
    const outDir = join(root, 'results');
    const caseA = join(root, 'cases', 'missing-index', 'case.yml');
    const caseB = join(root, 'cases', 'partial-index', 'case.yml');
    mkdirSync(join(root, 'cases', 'missing-index'), { recursive: true });
    mkdirSync(join(root, 'cases', 'partial-index'), { recursive: true });
    writeFileSync(caseA, 'name: missing-index\nreferences: ./refs\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n', 'utf-8');
    writeFileSync(caseB, 'name: partial-index\nreferences: ./refs\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n', 'utf-8');
    writeFileSync(suitePath, [
      'name: supabase-postgres-best-practices',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      '  - openrouter/openai/gpt-5.4',
      'cases:',
      '  - cases/missing-index/case.yml',
      '  - cases/partial-index/case.yml',
    ].join('\n'), 'utf-8');

    process.exitCode = undefined;
    await runWorkbenchSuite(
      { suitePath, outDir },
      {
        now: new Date('2026-04-27T10:11:12.000Z'),
        runDockerWorkbenchCase: async (options) => {
          assert.ok(options.resultsDir);
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.json');
          const pass = !(options.casePath.includes('partial-index') && options.model === 'openrouter/openai/gpt-5.4');
          writeFileSync(resultPath, JSON.stringify({ pass, score: pass ? 1 : 0, evidence: [options.casePath, options.model] }), 'utf-8');
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
      },
    );

    const suiteResultPath = join(outDir, '20260427-101112', 'suite-result.json');
    assert.ok(existsSync(suiteResultPath));
    const aggregate = JSON.parse(readFileSync(suiteResultPath, 'utf-8')) as {
      summary: { total: number; passed: number; failed: number; passRate: number; totalTrials: number; passedTrials: number; failedTrials: number };
      results: Array<{ caseName: string; model: string; passHatK: boolean; trials: Array<{ resultPath: string; tracePath: string }> }>;
    };

    assert.equal(aggregate.summary.total, 4);
    assert.equal(aggregate.summary.passed, 3);
    assert.equal(aggregate.summary.failed, 1);
    assert.equal(aggregate.summary.passRate, 0.75);
    assert.equal(aggregate.summary.totalTrials, 4);
    assert.equal(aggregate.summary.passedTrials, 3);
    assert.equal(aggregate.summary.failedTrials, 1);
    assert.equal(aggregate.results[0]?.trials[0]?.resultPath, 'cases/missing-index/openrouter-google-gemini-2.5-flash/trials/001/result.json');
    assert.equal(aggregate.results[3]?.trials[0]?.resultPath, 'cases/partial-index/openrouter-openai-gpt-5.4/trials/001/result.json');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});
