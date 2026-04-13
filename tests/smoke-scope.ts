import { strict as assert } from 'node:assert';

import { resolveScope, matchesGlob } from '../src/tasks/scope.js';
import type { ActionDefinition } from '../src/actions/types.js';

function mk(name: string): ActionDefinition {
  return { key: name, name, args: [] };
}

function testDefaultIncludeEverything() {
  const actions = [mk('Wallet.send'), mk('Wallet.receive'), mk('Token.mint')];
  const { inScope, outOfScope } = resolveScope(actions, { include: ['*'], exclude: [] });
  assert.strictEqual(inScope.length, 3);
  assert.strictEqual(outOfScope.length, 0);
  console.log('PASS: default ["*"] includes everything');
}

function testIncludeNarrowsToPrefix() {
  const actions = [mk('Wallet.send'), mk('Wallet.receive'), mk('Token.mint')];
  const { inScope, outOfScope } = resolveScope(actions, { include: ['Wallet.*'], exclude: [] });
  assert.deepStrictEqual(inScope.map((a) => a.name).sort(), ['Wallet.receive', 'Wallet.send']);
  assert.deepStrictEqual(outOfScope.map((a) => a.name), ['Token.mint']);
  console.log('PASS: include narrows to prefix');
}

function testExcludeSubtracts() {
  const actions = [mk('Wallet.send'), mk('Wallet.internalDebit'), mk('Token.mint')];
  const { inScope } = resolveScope(actions, { include: ['*'], exclude: ['*.internal*'] });
  assert.deepStrictEqual(inScope.map((a) => a.name).sort(), ['Token.mint', 'Wallet.send']);
  console.log('PASS: exclude removes matches');
}

function testStarMatchesSeparators() {
  assert.strictEqual(matchesGlob('Wallet.send', '*'), true);
  assert.strictEqual(matchesGlob('Wallet.send', 'Wallet.*'), true);
  assert.strictEqual(matchesGlob('Wallet.Inner.send', 'Wallet.*'), true); // * matches dots
  console.log('PASS: * matches any sequence including separators');
}

function testEmptyScopeIsAnError() {
  const actions = [mk('Wallet.send')];
  const { inScope } = resolveScope(actions, { include: ['NoMatch.*'], exclude: [] });
  assert.strictEqual(inScope.length, 0);
  console.log('PASS: scope can resolve to empty (caller decides if that is an error)');
}

function testEmptyIncludeDefaultsToStar() {
  const actions = [mk('Wallet.send'), mk('Token.mint')];
  const { inScope, outOfScope } = resolveScope(actions, { include: [], exclude: [] });
  assert.strictEqual(inScope.length, 2);
  assert.strictEqual(outOfScope.length, 0);
  console.log('PASS: empty include defaults to ["*"]');
}

async function main() {
  testDefaultIncludeEverything();
  testIncludeNarrowsToPrefix();
  testExcludeSubtracts();
  testStarMatchesSeparators();
  testEmptyScopeIsAnError();
  testEmptyIncludeDefaultsToStar();
  console.log('\nALL PASS: smoke-scope');
}

main().catch((err) => {
  console.error('FAIL: smoke-scope', err);
  process.exit(1);
});
