import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runWorkbenchReferenceSolutions } from '../src/workbench/reference-solutions.js';

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
      "const pass = existsSync(`${process.env.WORK}/output.txt`);",
      "console.log(JSON.stringify({ pass, score: pass ? 1 : 0, evidence: [pass ? 'output exists' : 'missing output'] }));",
      'process.exit(pass ? 0 : 1);',
    ].join('\n'), 'utf-8');
    writeFileSync(join(root, 'solutions', 'writes-output', 'solution.sh'), 'printf ok > output.txt\n', { encoding: 'utf-8', mode: 0o755 });
    const suitePath = join(root, 'suite.yml');
    writeFileSync(suitePath, [
      'name: reference-suite',
      'references: ./references',
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
    await runWorkbenchReferenceSolutions({ suitePath, outDir: join(root, 'results'), now: new Date('2026-04-27T10:11:12.000Z') });

    const resultPath = join(root, 'results', '20260427-101112', 'reference-result.json');
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
