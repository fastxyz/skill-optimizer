import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalizeCheckResult, runCheckCommand, runGraderCommands } from '../src/workbench/check-runner.js';
import { runShellCommand } from '../src/workbench/process.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error: any) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

console.log('\n=== Workbench Check Runner Smoke Tests ===\n');

await test('normalizes valid JSON pass result', () => {
  const grade = normalizeCheckResult({
    exitCode: 0,
    stdout: '{"pass":true,"score":1,"evidence":["ok"]}',
    stderr: '',
  });

  assert.equal(grade.pass, true);
  assert.equal(grade.score, 1);
  assert.deepEqual(grade.evidence, ['ok']);
});

await test('normalizes valid JSON fail result', () => {
  const grade = normalizeCheckResult({
    exitCode: 0,
    stdout: '{"pass":false,"score":0.2,"evidence":["missing output"]}',
    stderr: '',
  });

  assert.equal(grade.pass, false);
  assert.equal(grade.score, 0.2);
  assert.deepEqual(grade.evidence, ['missing output']);
});

await test('treats exit 0 with plain stdout as pass', () => {
  const grade = normalizeCheckResult({
    exitCode: 0,
    stdout: 'all checks looked good\n',
    stderr: '',
  });

  assert.equal(grade.pass, true);
  assert.equal(grade.score, 1);
  assert.deepEqual(grade.evidence, ['all checks looked good']);
});

await test('treats non-zero without JSON as fail with stdout/stderr evidence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-check-'));
  try {
    const scriptPath = join(dir, 'nonzero.js');
    writeFileSync(
      scriptPath,
      [
        "process.stdout.write('stdout evidence\\n');",
        "process.stderr.write('stderr evidence\\n');",
        'process.exit(2);',
      ].join('\n'),
      'utf-8',
    );

    const grade = await runCheckCommand(`node "${scriptPath}"`, { cwd: dir });
    assert.equal(grade.pass, false);
    assert.equal(grade.score, 0);
    assert.ok(grade.evidence.some((line) => line.includes('stderr evidence')));
    assert.ok(grade.evidence.some((line) => line.includes('stdout evidence')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('parses JSON object embedded in surrounding logs', () => {
  const grade = normalizeCheckResult({
    exitCode: 0,
    stdout: 'start log\\n{"pass":true,"score":0.8,"evidence":["found marker"]}\\nend log',
    stderr: '',
  });

  assert.equal(grade.pass, true);
  assert.equal(grade.score, 0.8);
  assert.deepEqual(grade.evidence, ['found marker']);
});

await test('runShellCommand marks timeout and non-zero semantics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-timeout-'));
  try {
    const scriptPath = join(dir, 'timeout.js');
    writeFileSync(scriptPath, 'setTimeout(() => process.exit(0), 2000);', 'utf-8');

    const result = await runShellCommand(`node "${scriptPath}"`, {
      cwd: dir,
      timeoutSeconds: 0.1,
    });

    assert.equal(result.timedOut, true);
    assert.notEqual(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('timed-out JSON pass check is forced to fail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-json-timeout-'));
  try {
    const scriptPath = join(dir, 'json-timeout.js');
    writeFileSync(scriptPath, [
      'process.stdout.write(JSON.stringify({ pass: true, score: 1, evidence: ["premature pass"] }));',
      'setTimeout(() => process.exit(0), 2000);',
    ].join('\n'), 'utf-8');

    const grade = await runCheckCommand(`node "${scriptPath}"`, {
      cwd: dir,
      timeoutSeconds: 0.1,
    });

    assert.equal(grade.pass, false);
    assert.equal(grade.score, 0);
    assert.ok(grade.evidence.some((line) => line.includes('check command timed out')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('runGraderCommands requires every grader to pass and scores passed graders', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-graders-'));
  try {
    const passScript = join(dir, 'pass.js');
    const failScript = join(dir, 'fail.js');
    writeFileSync(passScript, 'process.stdout.write(JSON.stringify({ pass: true, evidence: ["ok"] }));', 'utf-8');
    writeFileSync(failScript, 'process.stdout.write(JSON.stringify({ pass: false, evidence: ["missing output"] }));', 'utf-8');

    const grade = await runGraderCommands([
      { name: 'uses-tool', command: `node "${passScript}"` },
      { name: 'saves-output', command: `node "${failScript}"` },
    ], { cwd: dir });

    assert.equal(grade.pass, false);
    assert.equal(grade.score, 0.5);
    assert.deepEqual(grade.evidence, [
      'uses-tool: ok',
      'saves-output: missing output',
    ]);
    assert.equal(grade.graders?.length, 2);
    assert.equal(grade.graders?.[0]?.name, 'uses-tool');
    assert.equal(grade.graders?.[0]?.pass, true);
    assert.equal(grade.graders?.[1]?.name, 'saves-output');
    assert.equal(grade.graders?.[1]?.pass, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

if (failed > 0) {
  console.log(`\nFAIL: ${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\nALL PASS: smoke-workbench-checks (${passed} tests)`);
