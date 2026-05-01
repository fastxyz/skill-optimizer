import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildAgentSystemPrompt,
  buildContainerWorkbenchEnv,
  parseContainerRunnerArgs,
  prepareWorkbenchDirectory,
  runAgentPromptWithTimeout,
  writeBestEffortTrace,
} from '../src/workbench/container-runner.js';
import { createTraceRecorder } from '../src/workbench/trace.js';

test('buildAgentSystemPrompt describes operating constraints without eval/sandbox hints', () => {
  const prompt = buildAgentSystemPrompt();

  assert.match(prompt, /Current working directory is \/work/);
  assert.match(prompt, /Do not use global pip installs/);
  assert.match(prompt, /python -m venv \/work\/\.venv/);
  assert.match(prompt, /Write all outputs under \/work/);
  assert.doesNotMatch(prompt, /sandbox/i);
  assert.doesNotMatch(prompt, /skill\/reference/i);
  assert.doesNotMatch(prompt, /grader/i);
  assert.doesNotMatch(prompt, /expected answer/i);
  assert.doesNotMatch(prompt, /suite metadata/i);
  assert.doesNotMatch(prompt, /\/case/);
  assert.doesNotMatch(prompt, /Task:/);
});

test('buildContainerWorkbenchEnv exposes CASE as the mounted case directory', () => {
  const env = buildContainerWorkbenchEnv({
    casePath: '/case/case.yml',
    workDir: '/work',
    resultsDir: '/results',
    baseEnv: {},
  });

  assert.equal(env.CASE, '/case');
  assert.equal(env.WORK, '/work');
  assert.equal(env.RESULTS, '/results');
});

test('buildContainerWorkbenchEnv prepends work and case bin to PATH when present', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-env-'));
  try {
    const caseDir = join(root, 'case');
    const workDir = join(root, 'work');
    mkdirSync(join(caseDir, 'bin'), { recursive: true });
    mkdirSync(workDir, { recursive: true });

    const env = buildContainerWorkbenchEnv({
      casePath: join(caseDir, 'case.yml'),
      workDir,
      resultsDir: join(root, 'results'),
      baseEnv: { PATH: '/usr/bin' },
    });

    assert.equal(env.PATH, `${join(workDir, 'bin')}:${join(caseDir, 'bin')}:/usr/bin`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prepareWorkbenchDirectory copies references then optional workspace seed', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-prepare-'));
  try {
    const referencesDir = join(root, 'references');
    const workspaceDir = join(root, 'workspace');
    const workDir = join(root, 'work');
    mkdirSync(referencesDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, 'stale.txt'), 'stale\n', 'utf-8');
    writeFileSync(join(referencesDir, 'SKILL.md'), '# Skill\n', 'utf-8');
    writeFileSync(join(workspaceDir, 'seed.txt'), 'seed\n', 'utf-8');

    prepareWorkbenchDirectory({ referencesDir, workspaceDir, workDir });

    assert.equal(existsSync(join(workDir, 'stale.txt')), false);
    assert.equal(readFileSync(join(workDir, 'SKILL.md'), 'utf-8'), '# Skill\n');
    assert.equal(readFileSync(join(workDir, 'seed.txt'), 'utf-8'), 'seed\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parseContainerRunnerArgs reads optional MCP config path for agent mode', () => {
  const parsed = parseContainerRunnerArgs([
    '--agent',
    '--case-name', 'mcp-case',
    '--model', 'openrouter/google/gemini-2.5-flash',
    '--task-base64', Buffer.from('Use MCP.', 'utf-8').toString('base64'),
    '--timeout-seconds', '600',
    '--work', '/work',
    '--results', '/tmp/workbench-results',
    '--mcp-config', '/work/mcporter.json',
  ]);

  assert.equal(parsed.mode, 'agent');
  assert.equal(parsed.mcpConfigPath, '/work/mcporter.json');
});

test('runAgentPromptWithTimeout rejects when agent exceeds timeout', async () => {
  await assert.rejects(
    runAgentPromptWithTimeout({ prompt: () => new Promise(() => {}) }, 'task', 0.001),
    /Agent timed out after 0.001 seconds/,
  );
});

test('runAgentPromptWithTimeout rejects when agent ends with provider error', async () => {
  await assert.rejects(
    runAgentPromptWithTimeout({
      prompt: async () => undefined,
      state: {
        messages: [
          { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'Upstream request failed' },
        ],
      },
    }, 'task', 1),
    /Upstream request failed/,
  );
});

test('writeBestEffortTrace writes trace from available session messages', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-trace-'));
  try {
    const tracePath = join(root, 'trace.jsonl');
    const wrote = writeBestEffortTrace({
      tracePath,
      caseName: 'partial-trace',
      model: 'openrouter/test/model',
      startedAt: '2026-04-27T10:11:12.000Z',
      endedAt: '2026-04-27T10:11:13.000Z',
      session: {
        state: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          ],
        },
      },
    });

    assert.equal(wrote, true);
    const lines = readFileSync(tracePath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line) as { type: string; caseName?: string });
    assert.equal(lines[0]?.caseName, 'partial-trace');
    assert.equal(lines.filter((line) => line.type === 'message').length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBestEffortTrace prefers recorded Pi events when available', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-event-trace-'));
  try {
    const tracePath = join(root, 'trace.jsonl');
    const recorder = createTraceRecorder({ now: () => '2026-04-27T10:11:12.500Z' });
    recorder.record({
      type: 'tool_execution_start',
      toolCallId: 'call-1',
      toolName: 'bash',
      args: { command: 'npm test' },
    });

    const wrote = writeBestEffortTrace({
      tracePath,
      caseName: 'event-trace',
      model: 'openrouter/test/model',
      startedAt: '2026-04-27T10:11:12.000Z',
      endedAt: '2026-04-27T10:11:13.000Z',
      recorder,
      session: { state: { messages: [] } },
    });

    assert.equal(wrote, true);
    const lines = readFileSync(tracePath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line) as {
      type: string;
      arguments?: { command?: string };
    });
    assert.equal(lines[1]?.type, 'tool_call');
    assert.equal(lines[1]?.arguments?.command, 'npm test');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
