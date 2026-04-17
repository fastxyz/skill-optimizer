import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Parses the top version block of CHANGELOG.md and checks that every
 * item mentioned in Added/Fixed has at least one test file containing
 * a relevant token.
 *
 * Guards against "shipped feature, forgot the test" — the class that
 * let P1/P2/P3 escape in the first place.
 */

const repoRoot = resolve(process.cwd());
const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf-8');

// Grab the first ## block
const blocks = changelog.split(/^##\s+/m).slice(1);
assert.ok(blocks.length > 0, 'CHANGELOG.md must have at least one ## version heading');
const topBlock = blocks[0]!;

function extractSection(block: string, name: string): string[] {
  // Split block on ### headings and find the named section
  const parts = block.split(/^###\s+/m);
  for (const part of parts) {
    if (part.trimStart().toLowerCase().startsWith(name.toLowerCase())) {
      return part
        .split('\n')
        .slice(1) // skip the section heading line
        .map((l) => l.trim())
        .filter((l) => l.startsWith('-'))
        .map((l) => l.replace(/^-\s*/, ''));
    }
  }
  return [];
}

const added = extractSection(topBlock, 'Added');
const fixed = extractSection(topBlock, 'Fixed');
const items = [...added, ...fixed];

// If no items exist in the top block, skip the check (pre-release state).
if (items.length === 0) {
  console.log('SKIP: no Added/Fixed items in top CHANGELOG block');
  process.exit(0);
}

const STOP = new Set([
  'this', 'that', 'from', 'with', 'into', 'when', 'then',
  'some', 'have', 'been', 'does', 'must', 'will', 'true', 'false',
  'none', 'more', 'less', 'only', 'each', 'other', 'also',
  'added', 'fixed', 'remove', 'removed', 'change', 'changed',
  'every', 'their', 'where', 'which', 'about', 'bench', 'mark',
]);

const testFiles = readdirSync(resolve(repoRoot, 'tests'))
  .filter((f) => f.startsWith('smoke-') && f.endsWith('.ts'))
  .map((f) => readFileSync(resolve(repoRoot, 'tests', f), 'utf-8'));

let failures = 0;
for (const item of items) {
  const tokens = item
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP.has(t))
    .slice(0, 8);
  if (tokens.length === 0) continue;
  // Require at least 2 tokens to co-occur in a single test file (whole-word match).
  // Prevents false-passes where a lone generic word like "prompt" or "coverage"
  // appears somewhere in the corpus but no test actually covers the claimed behavior.
  const minMatch = Math.min(2, tokens.length);
  const hit = testFiles.some((content) => {
    const matched = tokens.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(content));
    return matched.length >= minMatch;
  });
  if (!hit) {
    console.error(`[FAIL] CHANGELOG entry has no test reference: "${item}"`);
    console.error(`       searched for tokens: ${tokens.join(', ')}`);
    failures += 1;
  }
}

assert.strictEqual(failures, 0,
  `${failures} CHANGELOG item(s) have no matching test file — ` +
  `either add a test or remove the CHANGELOG claim`);

console.log(`PASS: smoke-changelog-coverage (${items.length} items, all with tests)`);
