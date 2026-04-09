import { analyzeFailures } from './failure-analysis.js';
import type {
  MutationCandidate,
  OptimizeIteration,
  OptimizeLoopDependencies,
  OptimizeManifest,
  OptimizeResult,
  ResolvedOptimizeManifest,
} from './types.js';

export async function runOptimizeLoop(
  manifest: OptimizeManifest | ResolvedOptimizeManifest,
  deps: OptimizeLoopDependencies,
): Promise<OptimizeResult> {
  const resolvedManifest = resolveManifest(manifest);
  await deps.repo.ensureReady(resolvedManifest.targetRepo);

  let acceptedCheckpoint = await deps.repo.captureCheckpoint(resolvedManifest.targetRepo);
  const baselineReport = await deps.benchmark.run(resolvedManifest.benchmarkConfig);
  let bestReport = baselineReport;
  let consecutiveStableIterations = 0;
  const iterations: OptimizeIteration[] = [];

  await deps.ledger.record({
    type: 'baseline',
    score: baselineReport.summary.overallPassRate,
  });

  for (let index = 1; index <= resolvedManifest.optimizer.maxIterations; index++) {
    const failureBuckets = analyzeFailures(bestReport);
    let candidate: MutationCandidate | null = null;

    try {
      candidate = await deps.mutation.apply({
        manifest: resolvedManifest,
        iteration: index,
        currentReport: bestReport,
        failureBuckets,
      });

      let changedFiles = await getChangedFiles(deps, resolvedManifest, candidate);
      const scopeValidation = validateChangedFiles(changedFiles, resolvedManifest);
      let validation = scopeValidation ?? await deps.validation.run(resolvedManifest.targetRepo);

      const iteration: OptimizeIteration = {
        index,
        accepted: false,
        summary: candidate.summary,
        changedFiles,
        validation,
        scoreBefore: bestReport.summary.overallPassRate,
        delta: 0,
        failureBuckets,
      };

      if (!validation.ok) {
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }

      changedFiles = await getChangedFiles(deps, resolvedManifest, candidate);
      iteration.changedFiles = changedFiles;
      const postValidationScopeValidation = validateChangedFiles(changedFiles, resolvedManifest);
      if (postValidationScopeValidation) {
        iteration.validation = postValidationScopeValidation;
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }

      const candidateReport = await deps.benchmark.run(resolvedManifest.benchmarkConfig);
      changedFiles = await getChangedFiles(deps, resolvedManifest, candidate);
      iteration.changedFiles = changedFiles;
      const postBenchmarkScopeValidation = validateChangedFiles(changedFiles, resolvedManifest);
      if (postBenchmarkScopeValidation) {
        iteration.validation = postBenchmarkScopeValidation;
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }

      const delta = candidateReport.summary.overallPassRate - bestReport.summary.overallPassRate;
      iteration.scoreAfter = candidateReport.summary.overallPassRate;
      iteration.delta = delta;

      if (delta >= resolvedManifest.optimizer.minOverallPassDelta) {
        iteration.accepted = true;
        bestReport = candidateReport;
        acceptedCheckpoint = await deps.repo.updateAcceptedCheckpoint(
          resolvedManifest.targetRepo,
          acceptedCheckpoint,
          candidate,
          changedFiles,
        );
        consecutiveStableIterations = 0;
      } else {
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        consecutiveStableIterations += 1;
      }

      iterations.push(iteration);
      await deps.ledger.record({ type: 'iteration', iteration });

      if (consecutiveStableIterations >= resolvedManifest.optimizer.stabilityWindow) {
        return { baselineReport, bestReport, iterations, stopReason: 'stable' };
      }
    } catch (error) {
      try {
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          'Optimize iteration failed and checkpoint restore also failed',
        );
      }
      throw error;
    }
  }

  return {
    baselineReport,
    bestReport,
    iterations,
    stopReason: 'max-iterations',
  };
}

function validateChangedFiles(changedFiles: string[], manifest: ResolvedOptimizeManifest) {
  const disallowedFiles = changedFiles.filter((file) => !isAllowedPath(file, manifest.targetRepo.allowedPaths));
  if (disallowedFiles.length === 0) {
    return null;
  }

  return {
    ok: false,
    commands: [
      {
        command: 'scope-check',
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: `Changed files outside allowed paths: ${disallowedFiles.join(', ')}`,
      },
    ],
  };
}

function isAllowedPath(file: string, allowedPaths: string[]): boolean {
  const normalizedFile = normalizeRelativePath(file);
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowed = normalizeRelativePath(allowedPath);
    return normalizedFile === normalizedAllowed || normalizedFile.startsWith(`${normalizedAllowed}/`);
  });
}

function normalizeRelativePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
}

async function getChangedFiles(
  deps: OptimizeLoopDependencies,
  manifest: ResolvedOptimizeManifest,
  candidate: MutationCandidate,
): Promise<string[]> {
  return deps.repo.listChangedFiles
    ? deps.repo.listChangedFiles(manifest.targetRepo)
    : [...candidate.changedFiles];
}

function resolveManifest(manifest: OptimizeManifest | ResolvedOptimizeManifest): ResolvedOptimizeManifest {
  const unresolved = manifest as OptimizeManifest;
  if (unresolved.targetRepo.requireCleanGit === false) {
    throw new Error('Optimize target repos must keep requireCleanGit=true in v1');
  }

  return {
    benchmarkConfig: unresolved.benchmarkConfig,
    targetRepo: {
      ...unresolved.targetRepo,
      requireCleanGit: unresolved.targetRepo.requireCleanGit ?? true,
    },
    optimizer: {
      maxIterations: unresolved.optimizer?.maxIterations ?? 5,
      stabilityWindow: unresolved.optimizer?.stabilityWindow ?? 2,
      minOverallPassDelta: unresolved.optimizer?.minOverallPassDelta ?? 0.01,
      taskGeneration: {
        enabled: unresolved.optimizer?.taskGeneration?.enabled ?? false,
        maxGenerated: unresolved.optimizer?.taskGeneration?.maxGenerated ?? 10,
        seed: unresolved.optimizer?.taskGeneration?.seed ?? 1,
      },
    },
    mutation: unresolved.mutation,
  };
}
