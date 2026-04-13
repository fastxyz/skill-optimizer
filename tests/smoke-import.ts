import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliCommandDefinition } from '../src/import/types.js';
import { writeOutput } from '../src/import/output.js';
import { parseHelpOutput } from '../src/import/extractors/help-scraper.js';
import { extractCommander } from '../src/import/extractors/ts-commander.js';
import { extractYargs } from '../src/import/extractors/ts-yargs.js';
import { extractClick } from '../src/import/extractors/py-click.js';
import { extractArgparse } from '../src/import/extractors/py-argparse.js';
import { extractClap } from '../src/import/extractors/rs-clap.js';
import { detectFramework } from '../src/import/detect.js';
import { importCommands } from '../src/import/index.js';

// === Types check ===
const _typeCheck: CliCommandDefinition = { command: 'create', description: 'Create item' };
assert.strictEqual(typeof _typeCheck.command, 'string');

// === writeOutput ===
{
  const dir = mkdtempSync(join(tmpdir(), 'import-test-'));
  const outPath = join(dir, 'cli-commands.json');
  const commands: CliCommandDefinition[] = [
    { command: 'create', description: 'Create item', options: [{ name: '--name', takesValue: true }] },
  ];
  await writeOutput(commands, outPath);
  assert.strictEqual(existsSync(outPath), true);
  const written = JSON.parse(readFileSync(outPath, 'utf-8')) as CliCommandDefinition[];
  assert.strictEqual(written.length, 1);
  assert.strictEqual(written[0]!.command, 'create');
}

// === help-scraper: parseHelpOutput (root) ===
{
  const rootHelp = readFileSync('tests/fixtures/import-commands/help-output-sample.txt', 'utf-8');
  const commands = parseHelpOutput(rootHelp, []);
  assert.ok(commands.length >= 5, `Expected >=5 commands, got ${commands.length}: ${commands.map(c => c.command).join(', ')}`);
  const accountCmd = commands.find(c => c.command === 'account');
  assert.ok(accountCmd !== undefined, 'Should find "account" command');
  assert.strictEqual(accountCmd?.description, 'Account management');
}

// === help-scraper: parseHelpOutput (subcommand with prefix) ===
{
  const subHelp = readFileSync('tests/fixtures/import-commands/help-output-account.txt', 'utf-8');
  const commands = parseHelpOutput(subHelp, ['account']);
  assert.strictEqual(commands.length, 3, `Expected 3, got ${commands.length}: ${commands.map(c => c.command).join(', ')}`);
  assert.ok(commands.find(c => c.command === 'account create') !== undefined);
  assert.ok(commands.find(c => c.command === 'account delete') !== undefined);
}

// === ts-commander extractor ===
{
  const fixturePath = 'tests/fixtures/import-commands/commander-sample.ts';
  const commands = extractCommander(fixturePath);
  assert.strictEqual(commands.length, 3, `Expected 3 commands, got ${commands.length}: ${commands.map(c => c.command).join(', ')}`);

  const create = commands.find(c => c.command === 'create');
  assert.ok(create !== undefined, 'Should find "create" command');
  assert.strictEqual(create?.description, 'Create a new item');

  const nameOpt = create?.options?.find(o => o.name === '--name <value>');
  assert.ok(nameOpt !== undefined, 'Should find --name option');
  assert.strictEqual(nameOpt?.takesValue, true);

  const dryRun = create?.options?.find(o => o.name === '--dry-run');
  assert.ok(dryRun !== undefined, 'Should find --dry-run option');
  assert.strictEqual(dryRun?.takesValue, false);

  const deleteCmd = commands.find(c => c.command === 'delete');
  assert.ok(deleteCmd !== undefined, 'Should find "delete" command (positional stripped)');
}

// === ts-yargs extractor ===
{
  const fixturePath = 'tests/fixtures/import-commands/yargs-sample.ts';
  const commands = extractYargs(fixturePath);
  assert.strictEqual(commands.length, 2, `Expected 2 commands, got ${commands.length}: ${commands.map(c => c.command).join(', ')}`);

  const create = commands.find(c => c.command === 'create');
  assert.ok(create !== undefined, 'Should find "create" command');
  assert.strictEqual(create?.description, 'Create a new item');

  const nameOpt = create?.options?.find(o => o.name === '--name');
  assert.ok(nameOpt !== undefined, 'Should find --name option');
  assert.strictEqual(nameOpt?.takesValue, true);

  const verboseOpt = create?.options?.find(o => o.name === '--verbose');
  assert.ok(verboseOpt !== undefined, 'Should find --verbose option');
  assert.strictEqual(verboseOpt?.takesValue, false);

  const deleteCmd = commands.find(c => c.command === 'delete');
  assert.ok(deleteCmd !== undefined, 'Should find "delete" command (positional stripped)');
}

// === py-click extractor ===
{
  const fixturePath = 'tests/fixtures/import-commands/click-sample.py';
  const commands = await extractClick(fixturePath);
  assert.strictEqual(commands.length, 2, `Expected 2 commands, got ${commands.length}: ${commands.map(c => c.command).join(', ')}`);

  const create = commands.find(c => c.command === 'create');
  assert.ok(create !== undefined, 'Should find "create" command');
  assert.strictEqual(create?.description, 'Create a new item.');

  const nameOpt = create?.options?.find(o => o.name === '--name');
  assert.ok(nameOpt !== undefined, 'Should find --name option');
  assert.strictEqual(nameOpt?.takesValue, true);  // no is_flag → takesValue true

  const verboseOpt = create?.options?.find(o => o.name === '--verbose');
  assert.ok(verboseOpt !== undefined, 'Should find --verbose option');
  assert.strictEqual(verboseOpt?.takesValue, false);  // is_flag=True → takesValue false

  const deleteCmd = commands.find(c => c.command === 'delete');
  assert.ok(deleteCmd !== undefined, 'Should find "delete" command');
}

// === py-argparse extractor ===
{
  const fixturePath = 'tests/fixtures/import-commands/argparse-sample.py';
  const commands = await extractArgparse(fixturePath);
  assert.strictEqual(commands.length, 2, `Expected 2 commands, got ${commands.length}: ${commands.map(c => c.command).join(', ')}`);

  const create = commands.find(c => c.command === 'create');
  assert.ok(create !== undefined, 'Should find "create" command');
  assert.strictEqual(create?.description, 'Create a new item');

  const nameOpt = create?.options?.find(o => o.name === '--name');
  assert.ok(nameOpt !== undefined, 'Should find --name option');
  assert.strictEqual(nameOpt?.takesValue, true);

  const listCmd = commands.find(c => c.command === 'list');
  assert.ok(listCmd !== undefined, 'Should find "list" command');
  assert.strictEqual(listCmd?.description, 'List all items');
}

// === rs-clap extractor ===
{
  const fixturePath = 'tests/fixtures/import-commands/clap-sample.rs';
  const commands = await extractClap(fixturePath);
  assert.ok(commands.length >= 2, `Expected >=2 commands, got ${commands.length}`);

  const create = commands.find(c => c.command === 'create');
  assert.ok(create !== undefined, 'Should find "create" command');
  assert.strictEqual(create?.description, 'Create a new item');

  const nameOpt = create?.options?.find(o => o.name === '--name');
  assert.ok(nameOpt !== undefined, 'Should find --name option');
  assert.strictEqual(nameOpt?.takesValue, true);

  const verboseOpt = create?.options?.find(o => o.name === '--verbose');
  assert.ok(verboseOpt !== undefined, 'Should find --verbose option');
  assert.strictEqual(verboseOpt?.takesValue, false); // SetTrue → takesValue false

  const deleteCmd = commands.find(c => c.command === 'delete');
  assert.ok(deleteCmd !== undefined, 'Should find "delete" command');
}

// === detectFramework ===
{
  const result = detectFramework('tests/fixtures/import-commands/click-sample.py', process.cwd());
  assert.strictEqual(result.kind, 'click');
}

{
  const result = detectFramework('tests/fixtures/import-commands/argparse-sample.py', process.cwd());
  assert.strictEqual(result.kind, 'argparse');
}

{
  const result = detectFramework('tests/fixtures/import-commands/commander-sample.ts', process.cwd());
  assert.strictEqual(result.kind, 'commander');
}

// === importCommands orchestration ===
{
  const dir = mkdtempSync(join(tmpdir(), 'import-orch-'));
  const outPath = join(dir, 'cli-commands.json');
  await importCommands({
    from: 'tests/fixtures/import-commands/commander-sample.ts',
    out: outPath,
    scrape: false,
    depth: 2,
    cwd: process.cwd(),
  });
  assert.strictEqual(existsSync(outPath), true);
  const written = JSON.parse(readFileSync(outPath, 'utf-8')) as CliCommandDefinition[];
  assert.strictEqual(written.length, 3);
}

console.log('smoke-import: all tests passed');
