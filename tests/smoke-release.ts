import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

console.log('\n=== Release Hygiene Smoke Tests ===\n');

await test('package.json includes OSS metadata and publish guardrails', () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as {
    license?: string;
    repository?: unknown;
    bugs?: unknown;
    homepage?: string;
    keywords?: string[];
    exports?: Record<string, unknown>;
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  assert(packageJson.license === 'MIT', 'package.json should declare MIT license');
  assert(typeof packageJson.repository === 'object' && packageJson.repository !== null, 'package.json should declare repository metadata');
  assert(typeof packageJson.bugs === 'object' && packageJson.bugs !== null, 'package.json should declare bugs metadata');
  assert(typeof packageJson.homepage === 'string' && packageJson.homepage.length > 0, 'package.json should declare homepage metadata');
  assert(Array.isArray(packageJson.keywords) && packageJson.keywords.length >= 4, 'package.json should declare discoverable keywords');
  assert(typeof packageJson.exports?.['.'] === 'object', 'package.json should constrain the public root export');
  assert(typeof packageJson.bin?.['skill-optimizer'] === 'string', 'package.json should declare skill-optimizer bin entry');
  assert(packageJson.bin?.['skill-optimizer'] === './dist/cli.js', 'skill-optimizer bin should point at ./dist/cli.js');
  assert(typeof packageJson.scripts?.clean === 'string', 'package.json should include a clean script');
  assert(typeof packageJson.scripts?.prepack === 'string', 'package.json should include a prepack script');
});

await test('repo includes a root LICENSE file', () => {
  assert(existsSync(join(process.cwd(), 'LICENSE')), 'root LICENSE file should exist');
});

await test('mock-repos README matches the tracked templates', () => {
  const readme = readFileSync(join(process.cwd(), 'mock-repos', 'README.md'), 'utf-8');
  assert(readme.includes('mcp-tracker-demo'), 'mock-repos README should mention mcp-tracker-demo');
  assert(readme.includes('cli-taskfile-demo'), 'mock-repos README should mention cli-taskfile-demo');
  assert(!readme.includes('sdk-demo'), 'mock-repos README should not mention removed sdk-demo template');
  assert(!readme.includes('cli-demo'), 'mock-repos README should not mention removed cli-demo template');
  assert(!readme.includes('mcp-demo'), 'mock-repos README should not mention removed mcp-demo template');
});

// CHANGELOG must have a heading for current package version
await test('CHANGELOG.md has a section for the current package version', () => {
  const pkgVersion = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version: string }).version;
  const changelogContent = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8');
  const versionHeaderRe = new RegExp(`^##\\s*\\[?${pkgVersion.replace(/\./g, '\\.')}\\]?`, 'm');
  assert(versionHeaderRe.test(changelogContent), `CHANGELOG.md must have a section for version ${pkgVersion}`);
  console.log(`PASS: CHANGELOG has section for v${pkgVersion}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
