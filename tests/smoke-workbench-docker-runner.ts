import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildDockerAgentCommand,
  buildDockerGradeCommand,
  buildDockerSetupCommand,
  packageRootFromModuleUrl,
  prepareDockerWorkbenchRun,
} from '../src/workbench/docker-runner.js';

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

test('workbench image runs agents as non-root with venv-only pip installs', () => {
  const dockerfile = readFileSync(join(process.cwd(), 'docker', 'workbench-runner.Dockerfile'), 'utf-8');

  assert.match(dockerfile, /useradd .* agent/);
  assert.match(dockerfile, /USER agent/);
  assert.match(dockerfile, /ENTRYPOINT \["node", "\/app\/dist\/workbench\/container-runner\.js"\]/);
  assert.match(dockerfile, /PIP_REQUIRE_VIRTUALENV=1/);
  assert.match(dockerfile, /PATH="\/work\/\.venv\/bin:/);
  assert.doesNotMatch(dockerfile, /PIP_BREAK_SYSTEM_PACKAGES/);
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
    assert.ok(existsSync(join(prepared.workDir, 'SKILL.md')));
    assert.ok(existsSync(join(prepared.workDir, 'seed.txt')));
    assert.ok(existsSync(join(prepared.workDir, 'bin', 'fixture-tool')));
    assert.equal(existsSync(join(prepared.workDir, 'case.yml')), false);
    assert.equal(existsSync(join(prepared.workDir, 'checks', 'check.mjs')), false);
    assert.equal(existsSync(join(prepared.workDir, 'fixtures', 'input.json')), false);
    prepared.cleanup();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup docker command mounts case and work before agent phase', () => {
  const command = buildDockerSetupCommand({
    image: 'skill-optimizer-workbench:local',
    caseDir: '/tmp/case',
    workDir: '/tmp/work',
    envNames: [],
  });

  assert.match(command, /--setup/);
  assert.match(command, /-v '\/tmp\/case:\/case:ro'/);
  assert.match(command, /-v '\/tmp\/work:\/work:rw'/);
  assert.doesNotMatch(command, /\/results/);
  assert.doesNotMatch(command, /docker\.sock/);
});

test('agent docker command mounts only work and uses sandbox hardening flags', () => {
  const command = buildDockerAgentCommand({
    image: 'skill-optimizer-workbench:local',
    containerName: 'skill-optimizer-agent-test',
    workDir: '/tmp/work',
    caseName: 'extract-pdf-facts',
    model: 'openrouter/google/gemini-2.5-flash',
    task: 'Read the PDF and write answer.json.',
    timeoutSeconds: 600,
    envNames: ['OPENROUTER_API_KEY'],
  });

  assert.match(command, /--agent/);
  assert.match(command, /--name 'skill-optimizer-agent-test'/);
  assert.match(command, /-v '\/tmp\/work:\/work:rw'/);
  assert.match(command, /--workdir \/work/);
  assert.match(command, /--cap-drop=ALL/);
  assert.match(command, /--security-opt no-new-privileges/);
  assert.match(command, /-e OPENROUTER_API_KEY/);
  assert.doesNotMatch(command, /\/case/);
  assert.doesNotMatch(command, /\/results/);
  assert.doesNotMatch(command, /docker\.sock/);
});

test('agent docker command passes optional appended system prompt', () => {
  const command = buildDockerAgentCommand({
    image: 'skill-optimizer-workbench:local',
    containerName: 'skill-optimizer-agent-test',
    workDir: '/tmp/work',
    caseName: 'prompted-case',
    model: 'openrouter/google/gemini-2.5-flash',
    task: 'Write output.txt.',
    timeoutSeconds: 600,
    envNames: [],
    appendSystemPrompt: 'Prefer simple shell commands when possible.',
  });

  assert.match(command, /--append-system-prompt-base64/);
  assert.match(command, new RegExp(Buffer.from('Prefer simple shell commands when possible.', 'utf-8').toString('base64')));
});

test('grade docker command mounts case after agent phase', () => {
  const command = buildDockerGradeCommand({
    image: 'skill-optimizer-workbench:local',
    caseDir: '/tmp/case',
    workDir: '/tmp/work',
    resultsDir: '/tmp/results',
    envNames: [],
  });

  assert.match(command, /--grade/);
  assert.match(command, /-v '\/tmp\/case:\/case:ro'/);
  assert.match(command, /-v '\/tmp\/work:\/work:rw'/);
  assert.match(command, /-v '\/tmp\/results:\/results:rw'/);
  assert.match(command, /--cap-drop=ALL/);
  assert.match(command, /--security-opt no-new-privileges/);
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
