import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

await test('discovers cli actions via public action discovery entrypoint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-actions-'));
  const sourcePath = join(dir, 'commands.ts');
  const configPath = join(dir, 'skill-optimizer.json');

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

    const project = await loadProjectConfig(configPath);
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

await test('discoverActions uses manifest commands when CLI discovery mode is manifest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-discovery-manifest-'));
  const commandsPath = join(dir, 'commands.json');
  const configPath = join(dir, 'skill-optimizer.json');

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

    const project = await loadProjectConfig(configPath);
    const catalog = discoverActions(project);
    assertEqual(catalog.surface, 'cli', 'surface should be cli');
    assertEqual(catalog.actions.length, 1, 'manifest-backed discovery should return one action');
    assertEqual(catalog.actions[0].key, 'tickets:list', 'action key should come from manifest command');
    assertEqual(catalog.actions[0].args[0]?.name, 'limit', 'manifest options should be normalized');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Optique extractor tests ───────────────────────────────────────────────────

const FAST_CLI = '/root/openclaw-workspace/fast-sdk/app/cli/src/cli.ts';
const fastCliExists = existsSync(FAST_CLI);

await test('optique: discovers all 20 leaf commands from fast-sdk cli.ts', () => {
  if (!fastCliExists) { console.log('    (skipped — fast-sdk not present)'); return; }
  const snapshot = discoverCliSurfaceFromSources([FAST_CLI]);
  assertEqual(snapshot.surface, 'cli', 'surface should be cli');
  assertEqual(snapshot.actions.length, 20, `expected 20 commands, got ${snapshot.actions.length}`);
});

await test('optique: command names include full hierarchical path', () => {
  if (!fastCliExists) { console.log('    (skipped — fast-sdk not present)'); return; }
  const snapshot = discoverCliSurfaceFromSources([FAST_CLI]);
  const names = new Set(snapshot.actions.map((a) => a.name));
  for (const expected of ['account create', 'account import', 'account list',
    'account set-default', 'account export', 'account delete',
    'network list', 'network add', 'network set-default', 'network remove',
    'info status', 'info balance', 'info tx', 'info history',
    'info bridge-tokens', 'info bridge-chains',
    'send', 'fund fiat', 'fund crypto', 'pay']) {
    assert(names.has(expected), `missing expected command: ${expected}`);
  }
});

await test('optique: extracts descriptions from tagged template literals', () => {
  if (!fastCliExists) { console.log('    (skipped — fast-sdk not present)'); return; }
  const snapshot = discoverCliSurfaceFromSources([FAST_CLI]);
  const send = snapshot.actions.find((a) => a.name === 'send');
  assert(send !== undefined, 'send command should be discovered');
  assert(send!.description !== undefined && send!.description.length > 0, 'send should have a description');
});

await test('optique: extracts named options with correct types', () => {
  if (!fastCliExists) { console.log('    (skipped — fast-sdk not present)'); return; }
  const snapshot = discoverCliSurfaceFromSources([FAST_CLI]);
  const send = snapshot.actions.find((a) => a.name === 'send');
  assert(send !== undefined, 'send command should be discovered');
  const byName = new Map(send!.args.map((a) => [a.name, a]));
  assertEqual(byName.get('--token')?.type, 'string', '--token should be string');
  assertEqual(byName.get('--eip-7702')?.type, 'boolean', '--eip-7702 should be boolean');
  assertEqual(byName.get('--from-chain')?.type, 'string', '--from-chain should be string');
});

await test('optique: positional arguments marked required and use property key as name', () => {
  if (!fastCliExists) { console.log('    (skipped — fast-sdk not present)'); return; }
  const snapshot = discoverCliSurfaceFromSources([FAST_CLI]);
  const send = snapshot.actions.find((a) => a.name === 'send');
  assert(send !== undefined, 'send command should be discovered');
  const byName = new Map(send!.args.map((a) => [a.name, a]));
  assert(byName.get('address')?.required === true, 'address should be required');
  assert(byName.get('amount')?.required === true, 'amount should be required');
});

await test('optique: optional/withDefault wrappers produce non-required args', () => {
  if (!fastCliExists) { console.log('    (skipped — fast-sdk not present)'); return; }
  const snapshot = discoverCliSurfaceFromSources([FAST_CLI]);
  const accountExport = snapshot.actions.find((a) => a.name === 'account export');
  assert(accountExport !== undefined, 'account export should be discovered');
  // `name` is optional(argument(...)) → required: false
  const nameArg = accountExport!.args.find((a) => a.name === 'name');
  assert(nameArg !== undefined, 'name arg should be present');
  assert(nameArg!.required === false, 'optional argument should not be required');
});

await test('optique: static — does not execute source file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'optique-static-'));
  const sourcePath = join(dir, 'cli.ts');
  try {
    writeFileSync(sourcePath, [
      "import { command, object, or } from '@optique/core/primitives';",
      "throw new Error('must never execute');",
      "const listParser = command('list', object({}), {});",
      "export const parser = command('items', or(listParser), {});",
    ].join('\n'), 'utf-8');
    // discoverCliSurfaceFromSources uses static AST — no execution
    // We just verify it doesn't throw (the file would throw if imported)
    const snapshot = discoverCliSurfaceFromSources([sourcePath]);
    assert(Array.isArray(snapshot.actions), 'should return actions array without executing the file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
