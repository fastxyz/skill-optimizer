import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractShellBlock, parseShellCommands, extractFromCliMarkdown } from '../src/benchmark/extractors/cli-extractor.js';
import { extract } from '../src/benchmark/extractors/index.js';
import { loadCliCommands, loadTasks } from '../src/benchmark/config.js';
import { evaluateTask } from '../src/benchmark/evaluator.js';
import { createSkillReadExecutor } from '../src/benchmark/runner.js';
import { evaluateExpectedReads } from '../src/benchmark/read-evaluator.js';
import { fetchSkill } from '../src/benchmark/skill-fetcher.js';
import type { BenchmarkConfig, LLMResponse } from '../src/benchmark/types.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('\n=== CLI Surface Smoke Tests ===\n');

await test('shell block extraction success', () => {
  const markdown = 'Before\n```bash\nfast wallet send --to abc --amount 10\n```\nAfter';
  const shell = extractShellBlock(markdown);
  assertEqual(shell, 'fast wallet send --to abc --amount 10', 'should extract shell block');
});

await test('shell block extraction fails when none', () => {
  const shell = extractShellBlock('No shell block here');
  assertEqual(shell, null, 'should return null without bash/sh block');
});

await test('shell block extraction fails when multiple shell blocks', () => {
  const markdown = [
    '```bash',
    'fast wallet send --to a --amount 1',
    '```',
    '```sh',
    'fast wallet send --to b --amount 2',
    '```',
  ].join('\n');
  const shell = extractShellBlock(markdown);
  assertEqual(shell, null, 'should return null for multiple shell blocks');
});

await test('simple command', () => {
  const calls = parseShellCommands('fast status');
  assertEqual(calls.length, 1, 'one command expected');
  assertEqual(calls[0].method, 'fast status', 'method should include executable and subcommand');
});

await test('subcommands', () => {
  const calls = parseShellCommands('fast wallet send --to abc --amount 10');
  assertEqual(calls[0].method, 'fast wallet send', 'method should include subcommand path');
});

await test('long option with separate value', () => {
  const calls = parseShellCommands('fast wallet send --to fast1abc --amount 10');
  assertEqual(calls[0].args.to as string, 'fast1abc', 'to should be parsed');
  assertEqual(calls[0].args.amount as string, '10', 'amount should be parsed');
});

await test('long option with equals value', () => {
  const calls = parseShellCommands('fast wallet send --to=fast1abc --amount=10');
  assertEqual(calls[0].args.to as string, 'fast1abc', 'to should be parsed from = form');
  assertEqual(calls[0].args.amount as string, '10', 'amount should be parsed from = form');
});

await test('short option with value', () => {
  const calls = parseShellCommands('fast wallet create -n testnet');
  assertEqual(calls[0].args.n as string, 'testnet', 'short option value should be parsed');
});

await test('positional args', () => {
  const calls = parseShellCommands('fast wallet send --to fast1abc -- 10 memo');
  assertEqual(calls[0].args._positional_0 as string, '10', 'first positional should be parsed');
  assertEqual(calls[0].args._positional_1 as string, 'memo', 'second positional should be parsed');
});

await test('multiple commands and line numbers', () => {
  const calls = parseShellCommands([
    'fast wallet create -n testnet',
    'fast wallet balance --address fast1abc',
  ].join('\n'));
  assertEqual(calls.length, 2, 'two commands expected');
  assertEqual(calls[0].line, 1, 'first command line should be 1');
  assertEqual(calls[1].line, 2, 'second command line should be 2');
});

await test('quoted strings', () => {
  const calls = parseShellCommands('fast wallet send --memo "hello world" --to fast1abc');
  assertEqual(calls[0].args.memo as string, 'hello world', 'quoted value should be unwrapped');
});

await test('known commands keep trailing positional args out of method', async () => {
  const config = {
    name: 'test-cli',
    surface: 'cli',
    cli: {
      commands: 'commands.json',
      commandDefinitions: [
        { command: 'fast logs' },
      ],
    },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  } as BenchmarkConfig & {
    surface: 'cli';
    cli: { commands: string; commandDefinitions: Array<{ command: string }> };
  };

  const response: LLMResponse = {
    content: '```bash\nfast logs my-service\n```',
  };

  const { calls } = await extract(response, config);
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'fast logs', 'method should match known command path only');
  assertEqual(calls[0].args._positional_0 as string, 'my-service', 'trailing token should be positional');
});

await test('multi-token runner prefix resolves to known command', async () => {
  const config = {
    name: 'test-cli',
    surface: 'cli',
    cli: {
      commands: 'commands.json',
      commandDefinitions: [{ command: 'doctor' }],
    },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  } as BenchmarkConfig & {
    surface: 'cli';
    cli: { commands: string; commandDefinitions: Array<{ command: string }> };
  };

  const response: LLMResponse = {
    content: '```bash\nnpx skill-optimizer doctor --config ./foo.json\n```',
  };

  const { calls } = await extract(response, config);
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'doctor', 'method should be the known command, not the prefix');
  assertEqual(calls[0].args.config as string, './foo.json', 'config flag value should be parsed');
});

await test('flag value before subcommand does not match as method', async () => {
  const config = {
    name: 'test-cli',
    surface: 'cli',
    cli: {
      commands: 'commands.json',
      commandDefinitions: [{ command: 'run' }],
    },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  } as BenchmarkConfig & {
    surface: 'cli';
    cli: { commands: string; commandDefinitions: Array<{ command: string }> };
  };

  // Pathological shape: subcommand sits at index 4 (past the skip<=2 window).
  // The fix caps skip at 2 so we don't reach past a flag-and-value pair and
  // accidentally anchor on a value token. The heuristic fallback applies here.
  const response: LLMResponse = {
    content: '```bash\nnpx skill-optimizer --config ./foo.json run\n```',
  };

  const { calls } = await extract(response, config);
  assertEqual(calls.length, 1, 'one call expected');
  assert(
    calls[0].method !== 'run',
    `method should not spuriously match past the flag-value pair (got "${calls[0].method}")`,
  );
});

await test('command with env assignment', () => {
  const calls = parseShellCommands('FAST_NETWORK=testnet FAST_PROFILE=dev fast wallet status');
  const env = calls[0].args.env as Record<string, string>;
  assertEqual(env.FAST_NETWORK, 'testnet', 'env FAST_NETWORK parsed');
  assertEqual(env.FAST_PROFILE, 'dev', 'env FAST_PROFILE parsed');
});

await test('multiline with trailing backslash', () => {
  const markdown = [
    '```bash',
    'fast wallet send \\',
    '  --to fast1abc \\',
    '  --amount 10',
    '```',
  ].join('\n');
  const calls = extractFromCliMarkdown(markdown);
  assertEqual(calls.length, 1, 'one merged command expected');
  assertEqual(calls[0].args.to as string, 'fast1abc', 'to should be parsed');
  assertEqual(calls[0].args.amount as string, '10', 'amount should be parsed');
});

await test('chained commands split into multiple calls', () => {
  const calls = parseShellCommands('fast auth login && fast wallet balance');
  assertEqual(calls.length, 2, 'two chained commands expected');
  assertEqual(calls[0].method, 'fast auth login', 'first chained command should be parsed');
  assertEqual(calls[1].method, 'fast wallet balance', 'second chained command should be parsed');
});

await test('extract factory dispatches surface=cli', async () => {
  const config = {
    name: 'test-cli',
    surface: 'cli',
    cli: { commands: 'commands.json' },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  } as BenchmarkConfig & {
    surface: 'cli';
    cli: { commands: string };
  };

  const response: LLMResponse = {
    content: '```sh\nfast wallet send --to fast1abc --amount 10\n```',
  };

  const { calls, generatedCode } = await extract(response, config);
  assertEqual(generatedCode, 'fast wallet send --to fast1abc --amount 10', 'generatedCode should preserve the shell block contents');
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'fast wallet send', 'method should be parsed');
});

await test('loadCliCommands: accepts flat command schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-cli-'));
  try {
    const file = join(dir, 'commands.json');
    writeFileSync(file, JSON.stringify([
      {
        command: 'fast wallet send',
        options: [{ name: 'to', takesValue: true }],
      },
    ]), 'utf-8');

    const commands = loadCliCommands(file);
    assertEqual(commands.length, 1, 'one command expected');
    assertEqual(commands[0].command, 'fast wallet send', 'command path should be loaded');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('loadCliCommands: rejects entries without command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-cli-'));
  try {
    const file = join(dir, 'commands.json');
    writeFileSync(file, JSON.stringify([
      {
        path: 'fast wallet send',
      },
    ]), 'utf-8');

    let threw = false;
    try {
      loadCliCommands(file);
    } catch (error: any) {
      threw = true;
      assert(
        error.message.includes('command'),
        'error should mention missing command field',
      );
    }

    assert(threw, 'should reject command entries without command field');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('loadTasks: preserves CLI required flag metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-cli-tasks-'));
  try {
    const tasksPath = join(dir, 'tasks.json');
    writeFileSync(tasksPath, JSON.stringify({
      tasks: [
        {
          id: 'cli-required',
          prompt: 'List permissions.',
          expected_actions: [
            {
              name: 'gws drive permissions list',
              args: { 'params.fileId': 'FILE_ID' },
              cli: { required: ['--params', '--page-all'] },
            },
          ],
        },
      ],
    }), 'utf-8');

    const tasks = loadTasks(tasksPath);
    const required = tasks[0].expected_actions[0].cli?.required ?? [];
    assertEqual(required[0], '--params', 'first required flag should be preserved');
    assertEqual(required[1], '--page-all', 'second required flag should be preserved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('fetchSkill loads local companion skill references', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-skill-'));
  try {
    const mainDir = join(dir, 'gws-drive');
    const sharedDir = join(dir, 'gws-shared');
    mkdirSync(mainDir, { recursive: true });
    mkdirSync(sharedDir, { recursive: true });

    const mainPath = join(mainDir, 'SKILL.md');
    const sharedPath = join(sharedDir, 'SKILL.md');

    writeFileSync(mainPath, '# Main skill\n', 'utf-8');
    writeFileSync(sharedPath, '# Shared skill\nExpected shared companion text\n', 'utf-8');

    const fetched = await fetchSkill({
      source: mainPath,
      references: [sharedPath],
      cache: false,
    });

    assert(fetched !== null, 'fetchSkill should return skill content');
    const references = fetched.references ?? [];
    assertEqual(references.length, 1, 'one local reference should be loaded');
    assertEqual(references[0].path, 'gws-shared/SKILL.md', 'reference path should be slash-normalized and stable');
    assert(references[0].content.includes('Expected shared companion text'), 'shared reference content should be loaded');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('fetchSkill keeps reference paths stable for optimized local skill copies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-skill-override-'));
  try {
    const mainDir = join(dir, 'repo', 'skills', 'gws-drive');
    const sharedDir = join(dir, 'repo', 'skills', 'gws-shared');
    const artifactDir = join(dir, 'artifacts');
    mkdirSync(mainDir, { recursive: true });
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(artifactDir, { recursive: true });

    const mainPath = join(mainDir, 'SKILL.md');
    const sharedPath = join(sharedDir, 'SKILL.md');
    const localCopyPath = join(artifactDir, 'skill-v1.md');

    writeFileSync(mainPath, '# Main skill\n', 'utf-8');
    writeFileSync(localCopyPath, '# Main skill copy\n', 'utf-8');
    writeFileSync(sharedPath, '# Shared skill\n', 'utf-8');

    const fetched = await fetchSkill({
      source: localCopyPath,
      referenceBaseSource: mainPath,
      references: [sharedPath],
      cache: false,
    });

    assert(fetched !== null, 'fetchSkill should return skill content');
    assertEqual(fetched.references?.[0]?.path, 'gws-shared/SKILL.md', 'optimized skill copy should keep original reference path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('skill_read serves only frozen allowed skill references', async () => {
  const built = createSkillReadExecutor([
    {
      path: 'gws-shared/SKILL.md',
      source: '/tmp/gws-shared/SKILL.md',
      content: 'Expected shared reference body',
    },
  ]);
  const { executor } = built;
  const reads = built.readPaths;

  const ok = await executor('skill_read', { path: 'gws-shared/SKILL.md' });
  assert(String(ok).includes('Expected shared reference body'), 'skill_read should return allowed reference content');
  assertEqual(reads.length, 1, 'successful read should be recorded');
  assertEqual(reads[0], 'gws-shared/SKILL.md', 'successful read path should be tracked');

  const leadingSlash = await executor('skill_read', { path: '/gws-shared/SKILL.md' });
  assert(String(leadingSlash).startsWith('Error:'), 'leading slash variant should not match configured path');
  assertEqual(reads.length, 1, 'unconfigured leading slash variant must not be recorded as successful');

  const repoRelative = await executor('skill_read', { path: '../gws-shared/SKILL.md' });
  assert(String(repoRelative).includes('Expected shared reference body'), 'repo-relative alias should resolve to companion content');
  assertEqual(reads.length, 2, 'resolved alias read should be recorded');
  assertEqual(reads[1], 'gws-shared/SKILL.md', 'alias read should normalize to canonical prompt path');

  const fullPath = await executor('skill_read', { path: '/tmp/references-v1/gws-shared/SKILL.md' });
  assert(String(fullPath).includes('Expected shared reference body'), 'full-path alias should resolve to companion content');
  assertEqual(reads.length, 3, 'full-path alias read should be recorded');
  assertEqual(reads[2], 'gws-shared/SKILL.md', 'full-path alias should normalize to canonical prompt path');

  const denied = await executor('skill_read', { path: '../secret.md' });
  assert(String(denied).startsWith('Error:'), 'path traversal read should be rejected');
  assertEqual(reads.length, 3, 'rejected read must not be recorded as successful');
});

await test('expected_reads pass/fail helper', () => {
  const pass = (evaluateExpectedReads as any)(['a.md', 'b.md'], ['a.md', 'b.md', 'extra.md']);
  assertEqual(pass.passed, true, 'extra reads should still pass expected read coverage');
  assertEqual(pass.extra.length, 1, 'extra read should be reported');
  assertEqual(pass.extra[0], 'extra.md', 'reported extra read should match actual extra path');

  const fail = (evaluateExpectedReads as any)(['a.md', 'b.md'], ['a.md']);
  assertEqual(fail.passed, false, 'missing expected read should fail');
  assertEqual(fail.missing.length, 1, 'missing expected read should be reported');
  assertEqual(fail.missing[0], 'b.md', 'missing read should identify b.md');
});

await test('CLI required flag normalization passes with mixed required forms', () => {
  const task = {
    id: 'cli-required-normalization',
    prompt: 'List permissions',
    expected_actions: [
      {
        name: 'gws drive permissions list',
        args: {
          params: { kind: 'nonempty-string' },
          'page-all': true,
        },
        cli: { required: ['--params', '--page-all'] },
      },
    ],
  } as any;

  const extractedCalls = parseShellCommands(
    'gws drive permissions list --params "{\"fileId\":\"FILE_ID\"}" --page-all',
    ['gws drive permissions list'],
  );

  const taskResult = evaluateTask({
    task,
    model: { id: 'm', name: 'm', tier: 'low' },
    generatedCode: 'gws drive permissions list --params "{\"fileId\":\"FILE_ID\"}" --page-all',
    rawResponse: 'ok',
    extractedCalls,
    llmLatencyMs: 1,
    knownMethods: new Set(['gws drive permissions list']),
    surface: 'cli',
    cliCommands: [
      {
        command: 'gws drive permissions list',
        options: [
          { name: 'params', takesValue: true },
          { name: 'page-all', takesValue: false },
        ],
      },
    ],
  } as any);

  assertEqual(taskResult.metrics.taskPassed, true, 'required CLI flags should be normalized and pass');
});

await test('CLI rejects unsupported extra flag', () => {
  const task = {
    id: 'cli-extra-flag-rejected',
    prompt: 'Label something',
    expected_actions: [
      {
        name: 'gws drive permissions list',
        args: {},
      },
    ],
  } as any;

  const extractedCalls = parseShellCommands(
    'gws drive permissions list --bogus true',
    ['gws drive permissions list'],
  );

  const taskResult = evaluateTask({
    task,
    model: { id: 'm', name: 'm', tier: 'low' },
    generatedCode: 'gws drive permissions list --bogus true',
    rawResponse: 'ok',
    extractedCalls,
    llmLatencyMs: 1,
    knownMethods: new Set(['gws drive permissions list']),
    surface: 'cli',
    cliCommands: [
      {
        command: 'gws drive permissions list',
        options: [{ name: 'label', takesValue: true }],
      },
    ],
  } as any);

  assertEqual(taskResult.metrics.taskPassed, false, 'unsupported CLI option should fail task evaluation');
});

await test('CLI validates nested JSON flag constraints', () => {
  const task = {
    id: 'cli-nested-json-constraints',
    prompt: 'List permissions with page size',
    expected_actions: [
      {
        name: 'gws drive permissions list',
        args: {
          'params.pageSize': { kind: 'exact', value: 5 },
        },
      },
    ],
  } as any;

  const extractedCalls = parseShellCommands(
    'gws drive permissions list --params \'{"pageSize":5}\'',
    ['gws drive permissions list'],
  );

  const taskResult = evaluateTask({
    task,
    model: { id: 'm', name: 'm', tier: 'low' },
    generatedCode: 'gws drive permissions list --params \'{"pageSize":5}\'',
    rawResponse: 'ok',
    extractedCalls,
    llmLatencyMs: 1,
    knownMethods: new Set(['gws drive permissions list']),
    surface: 'cli',
    cliCommands: [
      {
        command: 'gws drive permissions list',
        options: [{ name: 'params', takesValue: true }],
      },
    ],
  } as any);

  assertEqual(taskResult.metrics.taskPassed, true, 'nested JSON constraints should be validated from --params payload');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
