import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadWorkbenchSuite } from '../src/workbench/suite-loader.js';
import { runWorkbenchSuite, runWorkbenchSuiteFromCli } from '../src/workbench/run-suite.js';

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

test('loadWorkbenchSuite applies and merges MCP defaults for inline cases', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-mcp-'));
  try {
    const suitePath = join(root, 'suite.yml');
    mkdirSync(join(root, 'references'), { recursive: true });
    writeFileSync(join(root, 'references', 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(suitePath, [
      'name: mcp-suite',
      'references: ./references',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'mcpServers:',
      '  context7:',
      '    baseUrl: https://mcp.context7.com/mcp',
      '  local-tools:',
      '    command: node',
      '    args:',
      '      - mcp/default-server.mjs',
      'cases:',
      '  - name: mcp-inline',
      '    task: Use MCP.',
      '    mcpServers:',
      '      context7:',
      '        baseUrl: https://example.test/mcp',
      '        allowedTools:',
      '          - lookup',
      '    graders:',
      '      - name: output',
      '        command: test -f answer.json',
    ].join('\n'), 'utf-8');

    const suite = loadWorkbenchSuite(suitePath);

    assert.deepEqual(suite.cases[0]?.case?.mcpServers, {
      context7: {
        baseUrl: 'https://example.test/mcp',
        allowedTools: ['lookup'],
      },
      'local-tools': {
        command: 'node',
        args: ['mcp/default-server.mjs'],
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadWorkbenchSuite reads suite appendSystemPrompt', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-prompt-'));
  try {
    const suitePath = join(root, 'suite.yml');
    writeFileSync(suitePath, [
      'name: prompted-suite',
      'appendSystemPrompt: |',
      '  Prefer simple shell commands when possible.',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - cases/noop/case.yml',
    ].join('\n'), 'utf-8');

    const suite = loadWorkbenchSuite(suitePath);

    assert.equal(suite.appendSystemPrompt, 'Prefer simple shell commands when possible.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadWorkbenchSuite rejects suite artifacts defaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-artifacts-'));
  try {
    const suitePath = join(root, 'suite.yml');
    writeFileSync(suitePath, [
      'name: artifact-suite',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'artifacts:',
      '  - output.json',
      'cases:',
      '  - cases/noop/case.yml',
    ].join('\n'), 'utf-8');

    assert.throws(
      () => loadWorkbenchSuite(suitePath),
      /field "artifacts" is invalid; inspect outputs in the workspace or use --keep-workspace/,
    );
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
          const tracePath = join(options.resultsDir, 'trace.jsonl');
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
    assert.equal(aggregate.results[0]?.trials[0]?.resultPath, 'trials/missing-index--openrouter-google-gemini-2.5-flash--001/result.json');
    assert.equal(aggregate.results[3]?.trials[0]?.resultPath, 'trials/partial-index--openrouter-openai-gpt-5.4--001/result.json');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchSuite passes suite appendSystemPrompt to every trial', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-prompt-run-'));
  const previousExitCode = process.exitCode;
  try {
    const suitePath = join(root, 'suite.yml');
    const outDir = join(root, 'results');
    const casePath = join(root, 'cases', 'prompted', 'case.yml');
    mkdirSync(join(root, 'cases', 'prompted'), { recursive: true });
    writeFileSync(casePath, 'name: prompted\nreferences: ./refs\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n', 'utf-8');
    writeFileSync(suitePath, [
      'name: prompted-suite',
      'appendSystemPrompt: |',
      '  Prefer simple shell commands when possible.',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - cases/prompted/case.yml',
    ].join('\n'), 'utf-8');

    process.exitCode = undefined;
    await runWorkbenchSuite(
      { suitePath, outDir },
      {
        now: new Date('2026-04-27T10:11:12.000Z'),
        runDockerWorkbenchCase: async (options) => {
          assert.equal(options.appendSystemPrompt, 'Prefer simple shell commands when possible.');
          assert.ok(options.resultsDir);
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.jsonl');
          writeFileSync(resultPath, JSON.stringify({ pass: true, score: 1, evidence: [] }), 'utf-8');
          writeFileSync(tracePath, JSON.stringify({ type: 'trace_start', entries: [] }), 'utf-8');
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

    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchSuiteFromCli rejects model overrides because suites own models', async () => {
  await assert.rejects(
    () => runWorkbenchSuiteFromCli(['suite.yml', '--models', 'openrouter/google/gemini-2.5-pro']),
    /Unknown flag: --models/,
  );
});

test('runWorkbenchSuite honors concurrency for independent trials', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-suite-concurrency-'));
  const previousExitCode = process.exitCode;
  try {
    const suitePath = join(root, 'suite.yml');
    const outDir = join(root, 'results');
    const casePath = join(root, 'cases', 'parallel', 'case.yml');
    mkdirSync(join(root, 'cases', 'parallel'), { recursive: true });
    writeFileSync(casePath, 'name: parallel\nreferences: ./refs\ntask: Test\ngraders:\n  - name: passes\n    command: "true"\n', 'utf-8');
    writeFileSync(suitePath, [
      'name: parallel-suite',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - cases/parallel/case.yml',
    ].join('\n'), 'utf-8');

    let active = 0;
    let maxActive = 0;
    process.exitCode = undefined;
    await runWorkbenchSuite(
      { suitePath, outDir, trials: 3, concurrency: 2 },
      {
        now: new Date('2026-04-27T10:11:12.000Z'),
        runDockerWorkbenchCase: async (options) => {
          assert.ok(options.resultsDir);
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 25));
          mkdirSync(options.resultsDir, { recursive: true });
          const resultPath = join(options.resultsDir, 'result.json');
          const tracePath = join(options.resultsDir, 'trace.jsonl');
          writeFileSync(resultPath, JSON.stringify({ pass: true, score: 1, evidence: [] }), 'utf-8');
          writeFileSync(tracePath, JSON.stringify({ type: 'trace_start', entries: [] }), 'utf-8');
          active -= 1;
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

    assert.equal(maxActive, 2);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});
