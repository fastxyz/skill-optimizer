import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { packageRootFromModuleUrl, prepareDockerWorkbenchRun } from '../src/workbench/docker-runner.js';

test('packageRootFromModuleUrl resolves repo root independently of cwd', () => {
  assert.equal(
    packageRootFromModuleUrl('file:///tmp/installed-package/dist/workbench/docker-runner.js'),
    '/tmp/installed-package',
  );
  assert.equal(
    packageRootFromModuleUrl('file:///tmp/source-package/src/workbench/docker-runner.ts'),
    '/tmp/source-package',
  );
});

test('prepareDockerWorkbenchRun writes results under case .results and keeps bundle temp-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-bundle-'));
  try {
    const sourceCaseDir = join(root, 'source-case');
    mkdirSync(join(sourceCaseDir, 'checks'), { recursive: true });
    mkdirSync(join(sourceCaseDir, 'references'), { recursive: true });
    writeFileSync(join(sourceCaseDir, 'checks', 'merge-pdfs.mjs'), 'process.exit(0);\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'references', 'SKILL.md'), '# Test Skill\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'case.yml'), [
      'name: pdf-merge',
      'references: ./references',
      'task: Merge PDFs.',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.mjs',
      'env:',
      '  - OPENROUTER_API_KEY',
    ].join('\n'));

    const prepared = prepareDockerWorkbenchRun({
      casePath: join(sourceCaseDir, 'case.yml'),
      tempRoot: join(root, 'temp'),
      now: new Date('2026-04-27T10:11:12.000Z'),
    });

    assert.equal(prepared.resultsDir, join(sourceCaseDir, '.results', '20260427-101112'));
    assert.ok(prepared.caseDir.startsWith(join(root, 'temp')));
    assert.ok(prepared.workDir.startsWith(join(root, 'temp')));
    assert.ok(existsSync(join(prepared.caseDir, 'checks', 'merge-pdfs.mjs')));
    assert.ok(existsSync(join(prepared.caseDir, 'references', 'SKILL.md')));
    assert.ok(existsSync(prepared.bundledCasePath));

    const bundledCase = readFileSync(prepared.bundledCasePath, 'utf-8');
    assert.match(bundledCase, /references: \.\/references/);
    assert.match(bundledCase, /graders:/);
    assert.match(bundledCase, /name: merged-output/);
    assert.match(bundledCase, /command: node \$CASE\/checks\/merge-pdfs\.mjs/);
    prepared.cleanup();
    assert.equal(existsSync(prepared.tempDir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepareDockerWorkbenchRun bundles case support directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-support-'));
  try {
    const sourceCaseDir = join(root, 'source-case');
    mkdirSync(join(sourceCaseDir, 'references'), { recursive: true });
    mkdirSync(join(sourceCaseDir, 'checks'), { recursive: true });
    mkdirSync(join(sourceCaseDir, 'fixtures'), { recursive: true });
    mkdirSync(join(sourceCaseDir, 'bin'), { recursive: true });
    mkdirSync(join(sourceCaseDir, 'workspace'), { recursive: true });
    writeFileSync(join(sourceCaseDir, 'references', 'SKILL.md'), '# Test Skill\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'checks', 'check.mjs'), 'process.exit(0);\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'fixtures', 'input.json'), '{}\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'bin', 'fixture-tool'), '#!/bin/sh\nexit 0\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'workspace', 'seed.txt'), 'seed\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'case.yml'), [
      'name: support-case',
      'references: ./references',
      'task: Test support dirs.',
      'graders:',
      '  - name: passes',
      '    command: node $CASE/checks/check.mjs',
    ].join('\n'));

    const prepared = prepareDockerWorkbenchRun({
      casePath: join(sourceCaseDir, 'case.yml'),
      tempRoot: join(root, 'temp'),
      now: new Date('2026-04-27T10:11:12.000Z'),
    });

    assert.ok(existsSync(join(prepared.caseDir, 'checks', 'check.mjs')));
    assert.ok(existsSync(join(prepared.caseDir, 'fixtures', 'input.json')));
    assert.ok(existsSync(join(prepared.caseDir, 'bin', 'fixture-tool')));
    assert.ok(existsSync(join(prepared.caseDir, 'workspace', 'seed.txt')));
    prepared.cleanup();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepareDockerWorkbenchRun honors --out as the results root', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-out-'));
  try {
    const sourceCaseDir = join(root, 'source-case');
    mkdirSync(join(sourceCaseDir, 'references'), { recursive: true });
    writeFileSync(join(sourceCaseDir, 'references', 'SKILL.md'), '# Test Skill\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'case.yml'), [
      'name: pdf-merge',
      'references: ./references',
      'task: Merge PDFs.',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.mjs',
    ].join('\n'));

    const prepared = prepareDockerWorkbenchRun({
      casePath: join(sourceCaseDir, 'case.yml'),
      outDir: join(root, 'custom-results'),
      tempRoot: join(root, 'temp'),
      now: new Date('2026-04-27T10:11:12.000Z'),
    });

    assert.equal(prepared.resultsDir, join(root, 'custom-results', '20260427-101112'));
    prepared.cleanup();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
