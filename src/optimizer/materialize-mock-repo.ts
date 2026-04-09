#!/usr/bin/env node

import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { listMockRepoTemplates, materializeMockRepo } from './mock-repos.js';

function printUsage(): void {
  console.log(`
Usage:
  tsx src/optimizer/materialize-mock-repo.ts <sdk-demo|cli-demo|mcp-demo> [destination-root]

Examples:
  tsx src/optimizer/materialize-mock-repo.ts sdk-demo
  tsx src/optimizer/materialize-mock-repo.ts cli-demo ./.tmp/mock-repos
`);
}

async function main(): Promise<void> {
  const [name, destinationRootArg] = process.argv.slice(2);
  if (!name || name === '--help' || name === '-h') {
    printUsage();
    process.exit(name ? 0 : 1);
  }

  if (!listMockRepoTemplates().includes(name as never)) {
    throw new Error(`Unknown mock repo '${name}'. Expected one of: ${listMockRepoTemplates().join(', ')}`);
  }

  const destinationRoot = destinationRootArg
    ? resolve(destinationRootArg)
    : mkdtempSync(join(tmpdir(), 'skill-benchmark-materialized-'));

  const repoPath = await materializeMockRepo(name as never, destinationRoot);
  console.log(repoPath);
}

main().catch((error) => {
  console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
