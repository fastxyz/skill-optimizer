import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`FAIL: ${name} — ${message}`);
    process.exit(1);
  }
}

const ERRORS_MD = resolve(REPO_ROOT, 'docs/reference/errors.md');
const CONFIG_SCHEMA_MD = resolve(REPO_ROOT, 'docs/reference/config-schema.md');

function assertContainsAllErrorCodes(content: string, contextMsg: string): Promise<void> {
  return import('../src/errors.js').then(({ ERRORS }) => {
    for (const key of Object.keys(ERRORS)) {
      assert.ok(content.includes(`\`${key}\``), `${contextMsg}: missing error code \`${key}\``);
    }
  });
}

async function main() {
  await test('gen-docs: errors.md exists and contains AUTO-GENERATED header', () => {
    assert.ok(existsSync(ERRORS_MD), `errors.md should exist at ${ERRORS_MD}`);
    const content = readFileSync(ERRORS_MD, 'utf-8');
    assert.ok(content.includes('AUTO-GENERATED'), 'errors.md should contain AUTO-GENERATED header comment');
    assert.ok(content.includes('# Error Reference'), 'errors.md should contain "# Error Reference" heading');
    assert.ok(
      content.includes('| Code | Description | Quick fix |'),
      'errors.md should contain summary table header'
    );
  });

  await test('gen-docs: errors.md contains all ERRORS codes', async () => {
    await assertContainsAllErrorCodes(readFileSync(ERRORS_MD, 'utf-8'), 'errors.md');
  });

  await test('gen-docs: config-schema.md exists and contains expected fields', () => {
    assert.ok(existsSync(CONFIG_SCHEMA_MD), `config-schema.md should exist at ${CONFIG_SCHEMA_MD}`);
    const content = readFileSync(CONFIG_SCHEMA_MD, 'utf-8');
    assert.ok(content.includes('AUTO-GENERATED'), 'config-schema.md should contain AUTO-GENERATED header comment');
    assert.ok(content.includes('# Config Schema Reference'), 'config-schema.md should contain "# Config Schema Reference" heading');
    assert.ok(content.includes('`target.surface`'), 'config-schema.md should contain `target.surface` field');
    assert.ok(content.includes('`benchmark.models`'), 'config-schema.md should contain `benchmark.models` field');
    assert.ok(
      content.includes('| Field | Type | Default | Description |'),
      'config-schema.md should contain table header'
    );
  });

  await test('gen-docs: script runs cleanly and output is stable', async () => {
    const result = spawnSync('npm', ['run', 'gen-docs'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      shell: true,
    });
    assert.strictEqual(
      result.status,
      0,
      `gen-docs should exit 0, got ${result.status}. stderr: ${result.stderr}`
    );

    await assertContainsAllErrorCodes(readFileSync(ERRORS_MD, 'utf-8'), 'errors.md after re-run');
  });

  console.log('\nALL PASS: smoke-gen-docs');
}

main().catch((err) => { console.error('FAIL: smoke-gen-docs', err); process.exit(1); });
