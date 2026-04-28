import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runWorkbenchGraderFixtures } from '../src/workbench/grader-fixtures.js';

test('runWorkbenchGraderFixtures validates expected grader outcomes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-grader-fixtures-'));
  const previousExitCode = process.exitCode;
  try {
    mkdirSync(join(root, 'references'), { recursive: true });
    mkdirSync(join(root, 'checks'), { recursive: true });
    mkdirSync(join(root, 'grader-fixtures', 'fixture-case', 'pass'), { recursive: true });
    writeFileSync(join(root, 'references', 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(join(root, 'checks', 'marker.mjs'), [
      "import { existsSync } from 'node:fs';",
      "const pass = existsSync(`${process.env.WORK}/marker.txt`);",
      "console.log(JSON.stringify({ pass, score: pass ? 1 : 0, evidence: [pass ? 'marker exists' : 'missing marker'] }));",
      'process.exit(pass ? 0 : 1);',
    ].join('\n'), 'utf-8');
    writeFileSync(join(root, 'grader-fixtures', 'fixture-case', 'pass', 'marker.txt'), 'ok\n', 'utf-8');
    writeFileSync(join(root, 'grader-fixtures', 'fixture-case', 'pass', 'expected.json'), JSON.stringify({
      graders: { 'marker-exists': true },
    }), 'utf-8');
    const suitePath = join(root, 'suite.yml');
    writeFileSync(suitePath, [
      'name: grader-fixture-suite',
      'references: ./references',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - name: fixture-case',
      '    task: Make marker',
      '    graders:',
      '      - name: marker-exists',
      '        command: node $CASE/checks/marker.mjs',
    ].join('\n'), 'utf-8');

    process.exitCode = undefined;
    await runWorkbenchGraderFixtures({ suitePath, outDir: join(root, 'results'), now: new Date('2026-04-27T10:11:12.000Z') });

    const resultPath = join(root, 'results', '20260427-101112', 'grader-fixture-result.json');
    assert.ok(existsSync(resultPath));
    const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as { summary: { passed: number; failed: number } };
    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.failed, 0);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchGraderFixtures rejects non-boolean expected grader values', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-grader-fixtures-invalid-'));
  try {
    mkdirSync(join(root, 'references'), { recursive: true });
    mkdirSync(join(root, 'checks'), { recursive: true });
    mkdirSync(join(root, 'grader-fixtures', 'fixture-case', 'invalid'), { recursive: true });
    writeFileSync(join(root, 'references', 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(join(root, 'checks', 'pass.mjs'), 'console.log(JSON.stringify({ pass: true, score: 1, evidence: [] }));\n', 'utf-8');
    writeFileSync(join(root, 'grader-fixtures', 'fixture-case', 'invalid', 'expected.json'), JSON.stringify({
      graders: { 'passes': 'true' },
    }), 'utf-8');
    const suitePath = join(root, 'suite.yml');
    writeFileSync(suitePath, [
      'name: invalid-grader-fixture-suite',
      'references: ./references',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - name: fixture-case',
      '    task: Test invalid expected schema',
      '    graders:',
      '      - name: passes',
      '        command: node $CASE/checks/pass.mjs',
    ].join('\n'), 'utf-8');

    await assert.rejects(
      runWorkbenchGraderFixtures({ suitePath, outDir: join(root, 'results'), now: new Date('2026-04-27T10:11:12.000Z') }),
      /expected grader value must be boolean: passes/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
