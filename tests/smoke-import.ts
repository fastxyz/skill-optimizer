import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliCommandDefinition } from '../src/import/types.js';
import { writeOutput } from '../src/import/output.js';

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

console.log('smoke-import: all tests passed');
