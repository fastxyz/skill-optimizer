import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverSdkSurfaceFromSources } from '../src/discovery/sdk.js';
import { discoverActions } from '../src/actions/index.js';
import { buildSurfaceSnapshot, loadProjectConfig } from '../src/project/index.js';

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

console.log('\n=== SDK Discovery Smoke Tests ===\n');

await test('discovers exported class constructor and methods', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const sourcePath = join(dir, 'client.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        'export class MyClient {',
        '  constructor(network: string, retries = 3) {}',
        '  public getBalance(accountId: string) { return accountId; }',
        '  private sign(secret: string) { return secret; }',
        '  protected refresh() {}',
        '  static fromKey(key: string) { return new MyClient(key); }',
        '}',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverSdkSurfaceFromSources([sourcePath]);
    assertEqual(snapshot.surface, 'sdk', 'surface should be sdk');

    const names = snapshot.actions.map((action) => action.name).sort();
    assertEqual(
      names.join(','),
      'MyClient.constructor,MyClient.fromKey,MyClient.getBalance',
      'should discover class callable actions',
    );

    const ctor = snapshot.actions.find((action) => action.name === 'MyClient.constructor');
    assert(ctor !== undefined, 'constructor action should exist');
    if (ctor) {
      assertEqual(ctor.args.map((arg) => arg.name).join(','), 'network,retries', 'constructor arg names should match');
      assertEqual(ctor.args[0].required, true, 'network should be required');
      assertEqual(ctor.args[1].required, false, 'retries should be optional');
    }

    const getBalance = snapshot.actions.find((action) => action.name === 'MyClient.getBalance');
    assert(getBalance !== undefined, 'getBalance action should exist');
    if (getBalance) {
      assertEqual(getBalance.args.map((arg) => arg.name).join(','), 'accountId', 'method arg names should match');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers exported standalone functions and default exports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const sourcePath = join(dir, 'functions.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        'export function sendTokens(to: string, amount: number) {}',
        'export default function createClient(network: string) { return network; }',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverSdkSurfaceFromSources([sourcePath]);
    const names = snapshot.actions.map((action) => action.name).sort();

    assertEqual(
      names.join(','),
      'createClient,sendTokens',
      'should discover exported named and default functions',
    );

    const sendTokens = snapshot.actions.find((action) => action.name === 'sendTokens');
    assert(sendTokens !== undefined, 'sendTokens should exist');
    if (sendTokens) {
      assertEqual(sendTokens.args.map((arg) => arg.name).join(','), 'to,amount', 'function arg names should match');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers re-exported SDK actions from a barrel file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const barrelPath = join(dir, 'index.ts');
  const clientPath = join(dir, 'client.ts');

  try {
    writeFileSync(
      clientPath,
      [
        'export class MyClient {',
        '  constructor(network: string) {}',
        '  getBalance(accountId: string) { return accountId; }',
        '}',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(barrelPath, 'export { MyClient } from "./client";\n', 'utf-8');

    const snapshot = discoverSdkSurfaceFromSources([barrelPath]);
    const names = snapshot.actions.map((action) => action.name).sort();
    assertEqual(names.join(','), 'MyClient.constructor,MyClient.getBalance', 'barrel discovery should follow named re-exports');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers re-exported SDK actions when barrel uses explicit file extensions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const barrelPath = join(dir, 'index.ts');
  const clientPath = join(dir, 'client.js');

  try {
    writeFileSync(
      clientPath,
      [
        'export class MyClient {',
        '  constructor(network) {}',
        '  getBalance(accountId) { return accountId; }',
        '}',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(barrelPath, 'export { MyClient } from "./client.js";\n', 'utf-8');

    const snapshot = discoverSdkSurfaceFromSources([barrelPath]);
    const names = snapshot.actions.map((action) => action.name).sort();
    assertEqual(names.join(','), 'MyClient.constructor,MyClient.getBalance', 'explicit-extension re-export should be followed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers alias names for re-exported SDK actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const barrelPath = join(dir, 'index.ts');
  const clientPath = join(dir, 'client.ts');

  try {
    writeFileSync(
      clientPath,
      [
        'export class MyClient {',
        '  constructor(network: string) {}',
        '  getBalance(accountId: string) { return accountId; }',
        '}',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(barrelPath, 'export { MyClient as Client } from "./client";\n', 'utf-8');

    const snapshot = discoverSdkSurfaceFromSources([barrelPath]);
    const names = snapshot.actions.map((action) => action.name).sort();
    assertEqual(names.join(','), 'Client.constructor,Client.getBalance', 're-export alias should become the public SDK action prefix');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('project snapshot falls back to sdk.apiSurface when discovery returns zero actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const sourcePath = join(dir, 'index.ts');
  const configPath = join(dir, 'skill-optimizer.json');

  try {
    writeFileSync(sourcePath, 'const sendTokens = () => {}; export { sendTokens };\n', 'utf-8');
    writeFileSync(configPath, JSON.stringify({
      name: 'sdk-fallback',
      target: {
        surface: 'sdk',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./index.ts'],
          language: 'typescript',
        },
        sdk: {
          language: 'typescript',
          apiSurface: ['sendTokens'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    const snapshot = buildSurfaceSnapshot(project);
    assertEqual(snapshot.actions.length, 1, 'sdk apiSurface should be used as fallback');
    assertEqual(snapshot.actions[0]?.name, 'sendTokens', 'fallback action should come from sdk.apiSurface');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('parses files statically and never executes source code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-'));
  const sourcePath = join(dir, 'safe.ts');

  try {
    writeFileSync(
      sourcePath,
      [
        "throw new Error('this must never run during discovery');",
        'export class Wallet {',
        '  transfer(to: string) {}',
        '}',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverSdkSurfaceFromSources([sourcePath]);
    assertEqual(snapshot.actions.length, 1, 'should discover action from static parse');
    assertEqual(snapshot.actions[0].name, 'Wallet.transfer', 'discovered action should match exported class method');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers sdk actions via public action discovery entrypoint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-actions-'));
  const sourcePath = join(dir, 'client.ts');
  const configPath = join(dir, 'skill-optimizer.json');

  try {
    writeFileSync(
      sourcePath,
      [
        'export class Wallet {',
        '  constructor(network: string) {}',
        '  send(to: string, amount: number) {}',
        '}',
      ].join('\n'),
      'utf-8',
    );

    writeFileSync(configPath, JSON.stringify({
      name: 'sdk-actions-entrypoint',
      target: {
        surface: 'sdk',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./client.ts'],
          language: 'typescript',
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
    assertEqual(catalog.surface, 'sdk', 'surface should be sdk');

    const actionKeys = catalog.actions.map((action) => action.key).sort();
    assertEqual(actionKeys.join(','), 'Wallet.constructor,Wallet.send', 'action keys should match discovered sdk methods');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discoverActions falls back to sdk.apiSurface when discovery returns zero actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-discovery-actions-fallback-'));
  const sourcePath = join(dir, 'index.ts');
  const configPath = join(dir, 'skill-optimizer.json');

  try {
    writeFileSync(sourcePath, 'const sendTokens = () => {}; export { sendTokens };\n', 'utf-8');
    writeFileSync(configPath, JSON.stringify({
      name: 'sdk-actions-fallback-entrypoint',
      target: {
        surface: 'sdk',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./index.ts'],
          language: 'typescript',
        },
        sdk: {
          language: 'typescript',
          apiSurface: ['sendTokens'],
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
    assertEqual(catalog.surface, 'sdk', 'surface should be sdk');
    assertEqual(catalog.actions.length, 1, 'sdk apiSurface should be used as fallback');
    assertEqual(catalog.actions[0]?.key, 'sendTokens', 'fallback action key should come from sdk.apiSurface');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
