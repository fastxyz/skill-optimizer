#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createBenchmarkAdapter,
  createJsonLedger,
  createRepoStateManager,
  createValidationRunner,
  loadOptimizeManifest,
  PiCodingMutationExecutor,
  runOptimizeLoop,
} from './index.js';
import { createDefaultPiTaskGenerator, generateTasksForProject } from '../tasks/index.js';
import { renderProgressTable } from './progress-table.js';

function printUsage(): void {
  console.log(`
Usage:
  tsx src/optimizer/main.ts <skill-optimizer.json> [--max-iterations <n>] [--skip-generation]

Examples:
  tsx src/optimizer/main.ts ./skill-optimizer.json
  tsx src/optimizer/main.ts ./skill-optimizer.json --max-iterations 8
  tsx src/optimizer/main.ts ./skill-optimizer.json --skip-generation
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

  const { result, resolvedManifest, ledgerPath } = await runOptimizeFromConfig(manifestPath, {
    maxIterationsRaw: getFlag(args, '--max-iterations'),
    skipGeneration: args.includes('--skip-generation'),
  });

  printOptimizeSummary(result, resolvedManifest, ledgerPath);
}

export async function runOptimizeFromConfig(
  manifestPath: string,
  options: { maxIterationsRaw?: string; skipGeneration?: boolean } = {},
) {
  const manifest = await loadOptimizeManifest(manifestPath);
  const maxIterations = options.maxIterationsRaw ? Number(options.maxIterationsRaw) : undefined;
  if (options.maxIterationsRaw && (!Number.isInteger(maxIterations) || (maxIterations ?? 0) <= 0)) {
    throw new Error(`Invalid --max-iterations value '${options.maxIterationsRaw}'. Must be a positive integer.`);
  }

  const resolvedManifest = maxIterations
    ? {
        ...manifest,
        optimizer: {
          ...manifest.optimizer,
          maxIterations,
          taskGeneration: {
            ...manifest.optimizer.taskGeneration,
            enabled: options.skipGeneration ? false : manifest.optimizer.taskGeneration.enabled,
          },
        },
      }
    : {
        ...manifest,
        optimizer: {
          ...manifest.optimizer,
          taskGeneration: {
            ...manifest.optimizer.taskGeneration,
            enabled: options.skipGeneration ? false : manifest.optimizer.taskGeneration.enabled,
          },
        },
      };

  const taskGenerator = resolvedManifest.optimizer.taskGeneration.enabled
    ? {
        generate: async (loopManifest: typeof resolvedManifest, opts: { outputDir: string }) => {
          const mutation = loopManifest.mutation;
          if (!mutation) {
            throw new Error('Optimize manifest must define a mutation section when task generation is enabled');
          }

          const deps = createDefaultPiTaskGenerator({
            provider: mutation.provider,
            model: mutation.model,
            apiKeyEnv: mutation.apiKeyEnv,
          });
          const generation = await generateTasksForProject({
            configPath: loopManifest.benchmarkConfig,
            maxTasks: loopManifest.optimizer.taskGeneration.maxGenerated,
            seed: loopManifest.optimizer.taskGeneration.seed,
            outputDir: opts.outputDir,
            deps,
          });
          return {
            benchmarkConfigPath: generation.artifacts.benchmarkPath,
            taskCount: generation.kept.length,
            rejectedCount: generation.rejected.length,
          };
        },
      }
    : undefined;

  const ledgerPath = resolve(resolvedManifest.optimizer.taskGeneration.outputDir, 'optimize-ledger.json');
  const result = await runOptimizeLoop(resolvedManifest, {
    benchmark: createBenchmarkAdapter(),
    repo: createRepoStateManager(),
    mutation: new PiCodingMutationExecutor(),
    taskGenerator,
    validation: createValidationRunner(),
    ledger: createJsonLedger(ledgerPath),
  });

  return { result, resolvedManifest, ledgerPath };
}

export function printOptimizeSummary(
  result: Awaited<ReturnType<typeof runOptimizeLoop>>,
  resolvedManifest: Awaited<ReturnType<typeof loadOptimizeManifest>>,
  ledgerPath: string,
): void {
  console.log('');
  if (result.generation) {
    console.log(`Generated tasks: ${result.generation.taskCount} (rejected: ${result.generation.rejectedCount})`);
    console.log(`Frozen config: ${result.generation.benchmarkConfigPath}`);
  }
  console.log(`Iterations: ${result.iterations.length}`);
  if (result.stopReason === 'stable') {
    console.log(
      `Stop reason: stable (${resolvedManifest.optimizer.stabilityWindow} consecutive iterations without a meaningful improvement)`,
    );
  } else {
    console.log(`Stop reason: max iterations reached (${resolvedManifest.optimizer.maxIterations})`);
  }
  console.log(`Run log: ${ledgerPath}`);
  console.log(renderProgressTable(result.baselineReport, result.bestReport, result.iterations));
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isExecutedDirectly()) {
  main().catch((error) => {
    console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
