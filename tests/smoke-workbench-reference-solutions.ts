import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  runWorkbenchReferenceSolutions,
  runWorkbenchReferenceSolutionsFromCli,
} from '../src/workbench/reference-solutions.js';

test('runWorkbenchReferenceSolutions runs authored solution and normal graders', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-reference-solutions-'));
  const previousExitCode = process.exitCode;
  try {
    mkdirSync(join(root, 'references'), { recursive: true });
    mkdirSync(join(root, 'checks'), { recursive: true });
    mkdirSync(join(root, 'solutions', 'writes-output'), { recursive: true });
    writeFileSync(join(root, 'references', 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(join(root, 'checks', 'exists.mjs'), [
      "import { existsSync } from 'node:fs';",
      "const pass = existsSync(`${process.env.WORK}/output.txt`) && existsSync(`${process.env.WORK}/setup.txt`);",
      "console.log(JSON.stringify({ pass, score: pass ? 1 : 0, evidence: [pass ? 'output and setup exist' : 'missing output or setup'] }));",
      'process.exit(pass ? 0 : 1);',
    ].join('\n'), 'utf-8');
    writeFileSync(join(root, 'solutions', 'writes-output', 'solution.sh'), 'printf ok > output.txt\n', { encoding: 'utf-8', mode: 0o755 });
    const suitePath = join(root, 'suite.yml');
    writeFileSync(suitePath, [
      'name: reference-suite',
      'references: ./references',
      'setup:',
      '  - printf setup-ok > setup.txt',
      'models:',
      '  - openrouter/google/gemini-2.5-flash',
      'cases:',
      '  - name: writes-output',
      '    task: Write output.txt',
      '    graders:',
      '      - name: output-exists',
      '        command: node $CASE/checks/exists.mjs',
    ].join('\n'), 'utf-8');

    process.exitCode = undefined;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };
    let result;
    try {
      result = await runWorkbenchReferenceSolutions({ suitePath, now: new Date('2026-04-27T10:11:12.000Z') });
    } finally {
      console.log = originalLog;
    }

    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.failed, 0);
    assert.equal(existsSync(join(root, '.results')), false);
    assert.equal(existsSync(join(root, 'results')), false);
    assert.ok(!logs.some((line) => line.startsWith('Results:')));
    assert.ok(logs.includes('Reference grade: PASS'));
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(root, { recursive: true, force: true });
  }
});

test('runWorkbenchReferenceSolutionsFromCli rejects --out because verify-suite is stdout-only', async () => {
  await assert.rejects(
    runWorkbenchReferenceSolutionsFromCli(['suite.yml', '--out', 'results']),
    /Unknown flag: --out/,
  );
});
