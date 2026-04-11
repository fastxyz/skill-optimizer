import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverCliSurfaceFromSources } from '../src/discovery/cli.js';
import { discoverActions } from '../src/actions/index.js';
import { readCliActionsFromSources } from '../src/actions/index.js';
import { loadProjectConfig } from '../src/project/index.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  + ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  - ${name}`);
    console.log(`    ${error.message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== CLI Discovery Smoke Tests ===\n');

await test('discovers exported const command arrays', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-'));
  const sourcePath = join(dir, 'commands.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        'export const COMMANDS = [',
        '  {',
        "    command: 'tickets:list',",
        "    description: 'List tickets',",
        '    options: [],',
        '  },',
        '  {',
        "    command: 'tickets:create',",
        "    description: 'Create a ticket',",
        '    options: [',
        "      { name: '--title', takesValue: true },",
        "      { name: '--quiet', takesValue: false },",
        '    ],',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverCliSurfaceFromSources([sourcePath]);
    assertEqual(snapshot.surface, 'cli', 'surface should be cli');
    assertEqual(snapshot.actions.length, 2, 'should discover two commands');

    const names = snapshot.actions.map((action) => action.name).sort();
    assertEqual(names.join(','), 'tickets:create,tickets:list', 'discovered command names should match');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('extracts command options including takesValue mappings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-'));
  const sourcePath = join(dir, 'commands.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        'export const COMMANDS = [',
        '  {',
        "    command: 'tickets:create',",
        "    description: 'Create a ticket',",
        '    options: [',
        "      { name: '--title', description: 'Ticket title', takesValue: true },",
        "      { name: '--quiet', description: 'Suppress output', takesValue: false },",
        '    ],',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverCliSurfaceFromSources([sourcePath]);
    const create = snapshot.actions.find((action) => action.name === 'tickets:create');
    assert(create !== undefined, 'tickets:create should be discovered');

    if (!create) {
      throw new Error('tickets:create should be discovered');
    }

    const byName = new Map<string, (typeof create.args)[number]>(create.args.map((arg) => [arg.name, arg]));
    assertEqual(byName.get('--title')?.type, 'string', '--title should be value-taking');
    assertEqual(byName.get('--quiet')?.type, 'boolean', '--quiet should be a boolean flag');
    assertEqual(byName.get('--title')?.description, 'Ticket title', '--title description should be discovered');
    assertEqual(byName.get('--quiet')?.description, 'Suppress output', '--quiet description should be discovered');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers default-exported command arrays', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-default-export-'));
  const sourcePath = join(dir, 'commands.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        'const COMMANDS = [',
        '  {',
        "    command: 'tickets:archive',",
        "    description: 'Archive a ticket',",
        '    options: [',
        "      { name: '--id', takesValue: true },",
        '    ],',
        '  },',
        '];',
        'export default COMMANDS;',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverCliSurfaceFromSources([sourcePath]);
    assertEqual(snapshot.actions.length, 1, 'should discover one default-exported command');
    assertEqual(snapshot.actions[0].name, 'tickets:archive', 'default export should be discovered');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovery remains static and does not execute source file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-'));
  const sourcePath = join(dir, 'commands.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        "throw new Error('this file must never execute during discovery');",
        'export const COMMANDS = [',
        '  {',
        "    command: 'safe:command',",
        "    description: 'Safe command',",
        '    options: [',
        "      { name: '--force', takesValue: false },",
        '    ],',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverCliSurfaceFromSources([sourcePath]);
    assertEqual(snapshot.actions.length, 1, 'should discover one command');
    assertEqual(snapshot.actions[0].name, 'safe:command', 'should discover command from static source');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers cli actions via public action discovery entrypoint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-actions-'));
  const sourcePath = join(dir, 'commands.ts');
  const configPath = join(dir, 'skill-benchmark.json');

  try {
    writeFileSync(
      sourcePath,
      [
        'export const COMMANDS = [',
        '  {',
        "    command: 'tickets:create',",
        '    options: [',
        "      { name: '--title', takesValue: true },",
        '    ],',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    writeFileSync(configPath, JSON.stringify({
      name: 'cli-actions-entrypoint',
      target: {
        surface: 'cli',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./commands.ts'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    const catalog = discoverActions(project);
    assertEqual(catalog.surface, 'cli', 'surface should be cli');
    assertEqual(catalog.actions.length, 1, 'should discover one cli action');
    assertEqual(catalog.actions[0].key, 'tickets:create', 'action key should match command name');
    assertEqual(catalog.actions[0].args[0]?.name, 'title', 'cli option names should be normalized');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('reads cli actions via actions-layer reader export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-reader-actions-'));
  const sourcePath = join(dir, 'commands.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        'export const COMMANDS = [',
        '  {',
        "    command: 'tickets:create',",
        '    options: [',
        "      { name: '--title', takesValue: true },",
        '    ],',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    const actions = readCliActionsFromSources([sourcePath]);
    assertEqual(actions.length, 1, 'reader should return discovered cli action');
    assertEqual(actions[0].key, 'tickets:create', 'reader should map key from command name');
    assertEqual(actions[0].args[0]?.name, 'title', 'reader should normalize option names');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discoverActions uses manifest commands when CLI discovery mode is manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-manifest-'));
  const commandsPath = join(dir, 'commands.json');
  const configPath = join(dir, 'skill-benchmark.json');

  try {
    writeFileSync(commandsPath, JSON.stringify([
      {
        command: 'tickets:list',
        description: 'List tickets',
        options: [
          { name: '--limit', takesValue: true },
        ],
      },
    ], null, 2), 'utf-8');

    writeFileSync(configPath, JSON.stringify({
      name: 'cli-actions-manifest-entrypoint',
      target: {
        surface: 'cli',
        repoPath: '.',
        discovery: {
          mode: 'manifest',
          fallbackManifest: './commands.json',
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    const catalog = discoverActions(project);
    assertEqual(catalog.surface, 'cli', 'surface should be cli');
    assertEqual(catalog.actions.length, 1, 'manifest-backed discovery should return one action');
    assertEqual(catalog.actions[0].key, 'tickets:list', 'action key should come from manifest command');
    assertEqual(catalog.actions[0].args[0]?.name, 'limit', 'manifest options should be normalized');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
