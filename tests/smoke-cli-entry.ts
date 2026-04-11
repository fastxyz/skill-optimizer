import { positionals } from '../src/cli.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== CLI Entry Smoke Tests ===\n');

await test('positionals keeps optimize command when boolean flag appears first', () => {
  const result = positionals(['--skip-generation', 'optimize', '--config', './skill-benchmark.json']);
  assertEqual(result[0], 'optimize', 'optimize command should remain positional');
});

await test('positionals keeps run command when boolean flag appears first', () => {
  const result = positionals(['--no-cache', 'run', '--config', './skill-benchmark.json']);
  assertEqual(result[0], 'run', 'run command should remain positional');
});

await test('positionals rejects unknown flags instead of swallowing the command', () => {
  let threw = false;
  try {
    positionals(['--verbose', 'optimize', '--config', './skill-benchmark.json']);
  } catch (error: any) {
    threw = true;
    assertEqual(error.message, 'Unknown flag: --verbose', 'unknown flag error should be explicit');
  }
  if (!threw) {
    throw new Error('unknown flag should throw');
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
