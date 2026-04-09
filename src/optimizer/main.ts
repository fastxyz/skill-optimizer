#!/usr/bin/env node

import { dirname, resolve } from 'node:path';

import {
  createBenchmarkAdapter,
  createJsonLedger,
  createRepoStateManager,
  createValidationRunner,
  loadOptimizeManifest,
  PiCodingMutationExecutor,
  runOptimizeLoop,
} from './index.js';

function printUsage(): void {
  console.log(`
Usage:
  tsx src/optimizer/main.ts <optimize-config.json> [--max-iterations <n>]

Examples:
  tsx src/optimizer/main.ts ./optimize.config.json
  tsx src/optimizer/main.ts ./optimize.config.json --max-iterations 8
`);
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Flag ${flag} requires a value`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const manifestPath = args[0];
  if (!manifestPath || manifestPath.startsWith('--')) {
    printUsage();
    process.exit(1);
  }

  const manifest = loadOptimizeManifest(manifestPath);
  const maxIterationsRaw = getFlag(args, '--max-iterations');
  const maxIterations = maxIterationsRaw ? Number(maxIterationsRaw) : undefined;
  if (maxIterationsRaw && (!Number.isInteger(maxIterations) || (maxIterations ?? 0) <= 0)) {
    throw new Error(`Invalid --max-iterations value '${maxIterationsRaw}'. Must be a positive integer.`);
  }

  const resolvedManifest = maxIterations
    ? {
        ...manifest,
        optimizer: {
          ...manifest.optimizer,
          maxIterations,
        },
      }
    : manifest;

  const ledgerPath = resolve(dirname(resolve(manifestPath)), 'optimize-ledger.json');
  const result = await runOptimizeLoop(resolvedManifest, {
    benchmark: createBenchmarkAdapter(),
    repo: createRepoStateManager(),
    mutation: new PiCodingMutationExecutor(),
    validation: createValidationRunner(),
    ledger: createJsonLedger(ledgerPath),
  });

  console.log('');
  console.log(`Baseline overall pass rate: ${(result.baselineReport.summary.overallPassRate * 100).toFixed(1)}%`);
  console.log(`Best overall pass rate: ${(result.bestReport.summary.overallPassRate * 100).toFixed(1)}%`);
  console.log(`Iterations: ${result.iterations.length}`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Ledger: ${ledgerPath}`);
}

main().catch((error) => {
  console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
