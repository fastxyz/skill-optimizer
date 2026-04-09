import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { OptimizeManifest, ResolvedOptimizeManifest } from './types.js';

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_STABILITY_WINDOW = 2;
const DEFAULT_MIN_OVERALL_PASS_DELTA = 0.01;
const DEFAULT_MAX_GENERATED = 10;
const DEFAULT_TASK_SEED = 1;

export function loadOptimizeManifest(manifestPath: string): ResolvedOptimizeManifest {
  const resolvedManifestPath = resolve(manifestPath);
  if (!existsSync(resolvedManifestPath)) {
    throw new Error(`Optimize manifest not found: ${resolvedManifestPath}`);
  }

  const raw = readFileSync(resolvedManifestPath, 'utf-8');
  let parsed: OptimizeManifest;
  try {
    parsed = JSON.parse(raw) as OptimizeManifest;
  } catch (error) {
    throw new Error(`Invalid JSON in optimize manifest: ${resolvedManifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const baseDir = dirname(resolvedManifestPath);
  validateManifest(parsed, resolvedManifestPath);

  return {
    benchmarkConfig: resolve(baseDir, parsed.benchmarkConfig),
    targetRepo: {
      path: resolve(baseDir, parsed.targetRepo.path),
      surface: parsed.targetRepo.surface,
      allowedPaths: parsed.targetRepo.allowedPaths,
      validation: parsed.targetRepo.validation,
      requireCleanGit: parsed.targetRepo.requireCleanGit ?? true,
    },
    optimizer: {
      maxIterations: parsed.optimizer?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      stabilityWindow: parsed.optimizer?.stabilityWindow ?? DEFAULT_STABILITY_WINDOW,
      minOverallPassDelta: parsed.optimizer?.minOverallPassDelta ?? DEFAULT_MIN_OVERALL_PASS_DELTA,
      taskGeneration: {
        enabled: parsed.optimizer?.taskGeneration?.enabled ?? false,
        maxGenerated: parsed.optimizer?.taskGeneration?.maxGenerated ?? DEFAULT_MAX_GENERATED,
        seed: parsed.optimizer?.taskGeneration?.seed ?? DEFAULT_TASK_SEED,
      },
    },
    mutation: parsed.mutation,
  };
}

function validateManifest(manifest: OptimizeManifest, manifestPath: string): void {
  if (!manifest.benchmarkConfig) {
    throw new Error(`Optimize manifest ${manifestPath}: "benchmarkConfig" is required`);
  }
  if (!manifest.targetRepo?.path) {
    throw new Error(`Optimize manifest ${manifestPath}: "targetRepo.path" is required`);
  }
  if (!manifest.targetRepo.surface) {
    throw new Error(`Optimize manifest ${manifestPath}: "targetRepo.surface" is required`);
  }
  if (!Array.isArray(manifest.targetRepo.allowedPaths) || manifest.targetRepo.allowedPaths.length === 0) {
    throw new Error(`Optimize manifest ${manifestPath}: "targetRepo.allowedPaths" must be a non-empty array`);
  }
  if (!Array.isArray(manifest.targetRepo.validation) || manifest.targetRepo.validation.length === 0) {
    throw new Error(`Optimize manifest ${manifestPath}: "targetRepo.validation" must be a non-empty array`);
  }
  if (manifest.targetRepo.requireCleanGit === false) {
    throw new Error(`Optimize manifest ${manifestPath}: "targetRepo.requireCleanGit" must remain true in v1`);
  }

  const maxIterations = manifest.optimizer?.maxIterations;
  if (maxIterations !== undefined && (!Number.isInteger(maxIterations) || maxIterations <= 0)) {
    throw new Error(`Optimize manifest ${manifestPath}: "optimizer.maxIterations" must be a positive integer`);
  }

  const stabilityWindow = manifest.optimizer?.stabilityWindow;
  if (stabilityWindow !== undefined && (!Number.isInteger(stabilityWindow) || stabilityWindow <= 0)) {
    throw new Error(`Optimize manifest ${manifestPath}: "optimizer.stabilityWindow" must be a positive integer`);
  }

  const minOverallPassDelta = manifest.optimizer?.minOverallPassDelta;
  if (minOverallPassDelta !== undefined && (!Number.isFinite(minOverallPassDelta) || minOverallPassDelta < 0)) {
    throw new Error(`Optimize manifest ${manifestPath}: "optimizer.minOverallPassDelta" must be a non-negative number`);
  }

  const maxGenerated = manifest.optimizer?.taskGeneration?.maxGenerated;
  if (maxGenerated !== undefined && (!Number.isInteger(maxGenerated) || maxGenerated <= 0)) {
    throw new Error(`Optimize manifest ${manifestPath}: "optimizer.taskGeneration.maxGenerated" must be a positive integer`);
  }

  const seed = manifest.optimizer?.taskGeneration?.seed;
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0)) {
    throw new Error(`Optimize manifest ${manifestPath}: "optimizer.taskGeneration.seed" must be a non-negative integer`);
  }
}
