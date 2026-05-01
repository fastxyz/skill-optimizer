import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildDockerAgentCommand,
  buildDockerGradeCommand,
  buildDockerMcpServiceCommand,
  buildDockerMcpServiceProbeCommand,
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
  assert.match(dockerfile, /PATH="\/app\/node_modules\/\.bin:\/work\/\.venv\/bin:/);
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
    assert.equal(existsSync(join(prepared.caseDir, 'mcp')), false);
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

test('prepareDockerWorkbenchRun writes isolated mcporter config for MCP servers', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-mcp-bundle-'));
  try {
    const sourceCaseDir = join(root, 'source-case');
    mkdirSync(join(sourceCaseDir, 'references'), { recursive: true });
    writeFileSync(join(sourceCaseDir, 'references', 'SKILL.md'), '# Test Skill\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'case.yml'), [
      'name: mcp-case',
      'references: ./references',
      'task: Use MCP.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'mcpServers:',
      '  local-tools:',
      '    command: node',
      '    args:',
      '      - mcp/server.mjs',
      '  context7:',
      '    baseUrl: https://mcp.context7.com/mcp',
    ].join('\n'));

    const prepared = prepareDockerWorkbenchRun({
      casePath: join(sourceCaseDir, 'case.yml'),
      tempRoot: join(root, 'temp'),
      now: new Date('2026-04-27T10:11:12.000Z'),
    });

    assert.equal(prepared.mcpConfigPath, join(prepared.workDir, 'mcporter.json'));
    assert.ok(existsSync(prepared.mcpConfigPath));
    assert.ok(existsSync(join(prepared.workDir, 'bin', 'mcp')));
    const mcpCommand = readFileSync(join(prepared.workDir, 'bin', 'mcp'), 'utf-8');
    assert.match(mcpCommand, /mcporter --config "\$MCPORTER_CONFIG" --root \/work "\$@"/);
    const mcporterConfig = JSON.parse(readFileSync(prepared.mcpConfigPath, 'utf-8')) as unknown;
    assert.deepEqual(mcporterConfig, {
      imports: [],
      mcpServers: {
        'local-tools': {
          command: 'node',
          args: ['mcp/server.mjs'],
        },
        context7: {
          baseUrl: 'https://mcp.context7.com/mcp',
        },
      },
    });

    const bundledCase = readFileSync(prepared.bundledCasePath, 'utf-8');
    assert.match(bundledCase, /mcpServers:/);
    assert.match(bundledCase, /local-tools:/);
    prepared.cleanup();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepareDockerWorkbenchRun bundles hidden MCP service support outside work', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-mcp-service-'));
  try {
    const sourceCaseDir = join(root, 'source-case');
    mkdirSync(join(sourceCaseDir, 'references'), { recursive: true });
    mkdirSync(join(sourceCaseDir, 'mcp'), { recursive: true });
    writeFileSync(join(sourceCaseDir, 'references', 'SKILL.md'), '# Test Skill\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'mcp', 'server.mjs'), 'console.log("mcp");\n', 'utf-8');
    writeFileSync(join(sourceCaseDir, 'case.yml'), [
      'name: mcp-service-case',
      'references: ./references',
      'task: Use MCP.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'mcpServices:',
      '  calculator:',
      '    command: node',
      '    args:',
      '      - server.mjs',
      '    port: 3000',
      'mcpServers:',
      '  calculator:',
      '    baseUrl: http://calculator:3000/mcp',
    ].join('\n'));

    const prepared = prepareDockerWorkbenchRun({
      casePath: join(sourceCaseDir, 'case.yml'),
      tempRoot: join(root, 'temp'),
      now: new Date('2026-04-27T10:11:12.000Z'),
    });

    assert.ok(existsSync(join(prepared.caseDir, 'mcp', 'server.mjs')));
    assert.equal(existsSync(join(prepared.workDir, 'server.mjs')), false);
    assert.equal(existsSync(join(prepared.workDir, 'mcp', 'server.mjs')), false);
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
  assert.match(command, /-e PATH=\/work\/bin:\/app\/node_modules\/\.bin:\/work\/\.venv\/bin:\/usr\/local\/sbin:\/usr\/local\/bin:\/usr\/sbin:\/usr\/bin:\/sbin:\/bin/);
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

test('agent docker command passes optional MCP config path', () => {
  const command = buildDockerAgentCommand({
    image: 'skill-optimizer-workbench:local',
    containerName: 'skill-optimizer-agent-test',
    workDir: '/tmp/work',
    caseName: 'mcp-case',
    model: 'openrouter/google/gemini-2.5-flash',
    task: 'Use MCP.',
    timeoutSeconds: 600,
    envNames: [],
    mcpConfigPath: '/work/mcporter.json',
  });

  assert.match(command, /-e MCPORTER_CONFIG=\/work\/mcporter\.json/);
  assert.match(command, /--mcp-config '\/work\/mcporter\.json'/);
});

test('agent docker command joins optional MCP network', () => {
  const command = buildDockerAgentCommand({
    image: 'skill-optimizer-workbench:local',
    containerName: 'skill-optimizer-agent-test',
    workDir: '/tmp/work',
    caseName: 'mcp-case',
    model: 'openrouter/google/gemini-2.5-flash',
    task: 'Use MCP.',
    timeoutSeconds: 600,
    envNames: [],
    networkName: 'skill-optimizer-mcp-test',
  });

  assert.match(command, /--network 'skill-optimizer-mcp-test'/);
});

test('MCP service docker command mounts hidden service files outside agent work', () => {
  const command = buildDockerMcpServiceCommand({
    image: 'skill-optimizer-workbench:local',
    containerName: 'skill-optimizer-mcp-test-calculator',
    networkName: 'skill-optimizer-mcp-test',
    alias: 'calculator',
    mcpDir: '/tmp/case/mcp',
    command: 'node',
    args: ['server.mjs'],
  });

  assert.match(command, /-v '\/tmp\/case\/mcp:\/mcp:ro'/);
  assert.match(command, /--workdir \/mcp/);
  assert.match(command, /--network-alias 'calculator'/);
  assert.doesNotMatch(command, /\/work/);
});

test('MCP service probe command verifies service through mcporter on private network', () => {
  const command = buildDockerMcpServiceProbeCommand({
    image: 'skill-optimizer-workbench:local',
    networkName: 'skill-optimizer-mcp-test',
    workDir: '/tmp/work',
    serverName: 'calculator',
  });

  assert.match(command, /--network 'skill-optimizer-mcp-test'/);
  assert.match(command, /-v '\/tmp\/work:\/work:rw'/);
  assert.match(command, /mcporter --config \/work\/mcporter\.json --root \/work list/);
  assert.match(command, /calculator/);
  assert.match(command, /--schema/);
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
