import { mkdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { analyzeFailures } from './failure-analysis.js';
import type { BenchmarkReport } from '../benchmark/types.js';
import { getExpectedActionName } from '../benchmark/types.js';
import type {
  MutationCandidate,
  OptimizeIteration,
  OptimizeLoopDependencies,
  OptimizeManifest,
  OptimizeResult,
  ResolvedOptimizeManifest,
  TaskGenerationResult,
} from './types.js';

export async function runOptimizeLoop(
  manifest: OptimizeManifest | ResolvedOptimizeManifest,
  deps: OptimizeLoopDependencies,
): Promise<OptimizeResult> {
  const resolvedManifest = resolveManifest(manifest);
  const sourceBenchmarkConfig = resolvedManifest.benchmarkConfig;
  console.log(`[optimize] Target repo: ${resolvedManifest.targetRepo.path}`);
  await deps.repo.ensureReady(resolvedManifest.targetRepo);
  console.log('[optimize] Repository is ready.');

  const outputDir = resolvedManifest.optimizer.taskGeneration.outputDir;
  mkdirSync(outputDir, { recursive: true });
  console.log(`[optimize] Artifact output dir: ${outputDir}`);

  let generation: TaskGenerationResult | undefined;
  if (resolvedManifest.optimizer.taskGeneration.enabled) {
    if (!deps.taskGenerator) {
      throw new Error('Optimize loop requires a task generator when optimizer.taskGeneration.enabled=true');
    }

    console.log('[optimize] Task generation is enabled.');
    generation = await deps.taskGenerator.generate(resolvedManifest, { outputDir });
    resolvedManifest.benchmarkConfig = generation.benchmarkConfigPath;
    console.log(
      `[optimize] Using generated benchmark config: ${generation.benchmarkConfigPath} ` +
        `(tasks=${generation.taskCount}, rejected=${generation.rejectedCount})`,
    );
  }
  if (resolvedManifest.optimizer.mode === 'surface-changing' && !resolvedManifest.optimizer.taskGeneration.enabled) {
    throw new Error('surface-changing optimize mode requires task generation to stay enabled so new epochs can regenerate tasks');
  }

  let acceptedCheckpoint = await deps.repo.captureCheckpoint(resolvedManifest.targetRepo);
  console.log('[optimize] Captured initial checkpoint.');
  console.log('[optimize] Running baseline benchmark...');
  const baselineResult = await deps.benchmark.run(resolvedManifest.benchmarkConfig, {
    outputDir,
    label: 'baseline',
  });
  const baselineReport = baselineResult.report;
  let bestReport = baselineResult.report;
  let lastReportPath = baselineResult.reportPath;
  console.log(
    `[optimize] Baseline complete: ${(baselineReport.summary.overallPassRate * 100).toFixed(1)}% ` +
      `(report: ${baselineResult.reportPath})`,
  );
  let consecutiveStableIterations = 0;
  const iterations: OptimizeIteration[] = [];

  await deps.ledger.record({
    type: 'baseline',
    score: baselineReport.summary.overallPassRate,
  });

  for (let index = 1; index <= resolvedManifest.optimizer.maxIterations; index++) {
    console.log(`\n[optimize] Iteration ${index}/${resolvedManifest.optimizer.maxIterations}`);
    const failureBuckets = analyzeFailures(bestReport);
    const failureSummaryLines = summarizeTopFailures(bestReport);
    if (failureSummaryLines.length > 0) {
      console.log('[optimize] Benchmark failure analysis (derived from the report, not agent output):');
      for (const line of failureSummaryLines) {
        console.log(`  - ${line}`);
      }
    }
    let candidate: MutationCandidate | null = null;

    try {
      console.log('[optimize] Applying mutation...');
      candidate = await deps.mutation.apply({
        manifest: resolvedManifest,
        iteration: index,
        currentReport: bestReport,
        failureBuckets,
        reportPath: lastReportPath,
      });
      if (candidate.toolActivity && candidate.toolActivity.length > 0) {
        console.log('[optimize] Orchestrator tool activity:');
        for (const line of candidate.toolActivity) {
          console.log(`  ${line}`);
        }
      }
      console.log('[optimize] Orchestrator response:');
      for (const line of candidate.summary.split('\n')) {
        if (line.trim()) {
          console.log(`  ${line}`);
        }
      }

      let changedFiles = await getChangedFiles(deps, resolvedManifest, candidate);
      console.log(
        `[optimize] Changed files: ${changedFiles.length > 0 ? changedFiles.join(', ') : '(none)'}`,
      );
      const scopeValidation = validateChangedFiles(changedFiles, resolvedManifest);
      console.log('[optimize] Running validation...');
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
        console.log(
          `[optimize] Validation failed: ${validation.commands.map((command) => command.stderr || command.command).join(' | ')}`,
        );
        console.log('[optimize] Restoring checkpoint.');
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }

      changedFiles = await getChangedFiles(deps, resolvedManifest, candidate);
      iteration.changedFiles = changedFiles;
      const postValidationScopeValidation = validateChangedFiles(changedFiles, resolvedManifest);
      if (postValidationScopeValidation) {
        console.log('[optimize] Validation introduced out-of-scope changes. Restoring checkpoint.');
        iteration.validation = postValidationScopeValidation;
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }

      const surfaceChanged = didSurfaceChange(changedFiles, resolvedManifest);
      if (surfaceChanged && resolvedManifest.optimizer.mode === 'stable-surface') {
        console.log('[optimize] Callable surface changed during stable-surface mode. Restoring checkpoint.');
        iteration.validation = buildInvariantValidationError(
          'surface-invariant',
          'stable-surface mode rejects callable surface changes; switch to surface-changing mode to allow them',
        );
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }
      if (surfaceChanged && resolvedManifest.optimizer.mode === 'surface-changing') {
        console.log('[optimize] Callable surface changed. Starting a new benchmark epoch...');
        if (resolvedManifest.optimizer.taskGeneration.enabled) {
          if (!deps.taskGenerator) {
            throw new Error('Optimize loop requires a task generator to regenerate tasks after surface changes');
          }
          const regenerated = await deps.taskGenerator.generate(
            { ...resolvedManifest, benchmarkConfig: sourceBenchmarkConfig },
            { outputDir },
          );
          resolvedManifest.benchmarkConfig = regenerated.benchmarkConfigPath;
          generation = regenerated;
          console.log(
            `[optimize] New epoch uses regenerated benchmark config: ${regenerated.benchmarkConfigPath} ` +
              `(tasks=${regenerated.taskCount}, rejected=${regenerated.rejectedCount})`,
          );
        }

        const epochBaseline = await deps.benchmark.run(resolvedManifest.benchmarkConfig, {
          outputDir,
          label: `epoch-${index + 1}-baseline`,
        });
        iteration.accepted = true;
        iteration.scoreAfter = epochBaseline.report.summary.overallPassRate;
        iteration.delta = epochBaseline.report.summary.overallPassRate - bestReport.summary.overallPassRate;
        bestReport = epochBaseline.report;
        lastReportPath = epochBaseline.reportPath;
        acceptedCheckpoint = await deps.repo.updateAcceptedCheckpoint(
          resolvedManifest.targetRepo,
          acceptedCheckpoint,
          candidate,
          changedFiles,
        );
        consecutiveStableIterations = 0;
        console.log(
          `[optimize] Started new epoch baseline at ${(bestReport.summary.overallPassRate * 100).toFixed(1)}% ` +
            `(report: ${epochBaseline.reportPath}).`,
        );
        iterations.push(iteration);
        await deps.ledger.record({ type: 'iteration', iteration });
        continue;
      }

      console.log('[optimize] Re-running benchmark for candidate changes...');
      const candidateResult = await deps.benchmark.run(resolvedManifest.benchmarkConfig, {
        outputDir,
        label: `iteration-${index}`,
      });
      const candidateReport = candidateResult.report;
      changedFiles = await getChangedFiles(deps, resolvedManifest, candidate);
      iteration.changedFiles = changedFiles;
      const postBenchmarkScopeValidation = validateChangedFiles(changedFiles, resolvedManifest);
      if (postBenchmarkScopeValidation) {
        console.log('[optimize] Benchmark rerun introduced out-of-scope changes. Restoring checkpoint.');
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
        lastReportPath = candidateResult.reportPath;
        const beforePercent = iteration.scoreBefore * 100;
        const afterPercent = candidateReport.summary.overallPassRate * 100;
        const deltaPoints = delta * 100;
        console.log(
          `[optimize] Accepted iteration ${index}: overall pass rate improved by ${deltaPoints.toFixed(1)} points ` +
            `(${beforePercent.toFixed(1)}% -> ${afterPercent.toFixed(1)}%).`,
        );
        acceptedCheckpoint = await deps.repo.updateAcceptedCheckpoint(
          resolvedManifest.targetRepo,
          acceptedCheckpoint,
          candidate,
          changedFiles,
        );
        consecutiveStableIterations = 0;
      } else {
        const beforePercent = iteration.scoreBefore * 100;
        const afterPercent = candidateReport.summary.overallPassRate * 100;
        const minDeltaPoints = resolvedManifest.optimizer.minOverallPassDelta * 100;
        console.log(
          `[optimize] Rejected iteration ${index}: no meaningful improvement ` +
            `(${beforePercent.toFixed(1)}% -> ${afterPercent.toFixed(1)}%; threshold ${minDeltaPoints.toFixed(1)} points).`,
        );
        console.log('[optimize] Restoring checkpoint.');
        await deps.repo.restoreCheckpoint(resolvedManifest.targetRepo, acceptedCheckpoint);
        consecutiveStableIterations += 1;
      }

      iterations.push(iteration);
      await deps.ledger.record({ type: 'iteration', iteration });

      if (consecutiveStableIterations >= resolvedManifest.optimizer.stabilityWindow) {
        console.log(
          `[optimize] Stopping because we saw ${resolvedManifest.optimizer.stabilityWindow} consecutive iterations ` +
            'without a meaningful improvement.',
        );
        return { baselineReport, bestReport, iterations, stopReason: 'stable', generation };
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
    generation,
  };
}

function summarizeTopFailures(report: BenchmarkReport, limit = 3): string[] {
  const grouped = new Map<string, {
    prompt: string;
    failCount: number;
    models: Set<string>;
    missing: Set<string>;
    badArgs: Set<string>;
  }>();

  for (const result of report.results) {
    if (result.metrics.taskPassed) continue;

    const existing = grouped.get(result.task.id) ?? {
      prompt: result.task.prompt,
      failCount: 0,
      models: new Set<string>(),
      missing: new Set<string>(),
      badArgs: new Set<string>(),
    };
    existing.failCount += 1;
    existing.models.add(result.model.name);

    for (const match of result.actionMatches ?? result.toolMatches) {
      if (!match.methodFound) {
        existing.missing.add(getExpectedActionName(match.expected));
      } else if (!match.argsCorrect) {
        existing.badArgs.add(getExpectedActionName(match.expected));
      }
    }

    grouped.set(result.task.id, existing);
  }

  return [...grouped.entries()]
    .sort((a, b) => b[1].failCount - a[1].failCount)
    .slice(0, limit)
    .map(([taskId, info]) => {
      const details: string[] = [];
      if (info.missing.size > 0) {
        details.push(`missing tools: ${[...info.missing].join(', ')}`);
      }
      if (info.badArgs.size > 0) {
        details.push(`bad args: ${[...info.badArgs].join(', ')}`);
      }

      return `${taskId} fails on ${[...info.models].join(', ')}. ${details.join('; ') || 'See report for details.'}`;
    });
}

function validateChangedFiles(changedFiles: string[], manifest: ResolvedOptimizeManifest) {
  const disallowedFiles = changedFiles.filter(
    (file) => !isFrameworkArtifactPath(file, manifest) && !isAllowedPath(file, manifest.targetRepo.allowedPaths),
  );
  if (disallowedFiles.length === 0) {
    return null;
  }

  return buildInvariantValidationError('scope-check', `Changed files outside allowed paths: ${disallowedFiles.join(', ')}`);
}

function buildInvariantValidationError(command: string, message: string) {
  return {
    ok: false,
    commands: [
      {
        command,
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: message,
      },
    ],
  };
}

function didSurfaceChange(changedFiles: string[], manifest: ResolvedOptimizeManifest): boolean {
  const surfacePaths = manifest.targetRepo.surfacePaths ?? [];
  const relevantSurfacePaths = new Set(
    surfacePaths.map((surfacePath) => normalizeRelativePath(toRelativeTargetPath(surfacePath, manifest))),
  );

  return changedFiles.some((file) => relevantSurfacePaths.has(normalizeRelativePath(file)));
}

function toRelativeTargetPath(path: string, manifest: ResolvedOptimizeManifest): string {
  if (path.startsWith('/') || path.startsWith('\\')) {
    return relative(manifest.targetRepo.path, path);
  }

  return path;
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
  const changedFiles = deps.repo.listChangedFiles
    ? deps.repo.listChangedFiles(manifest.targetRepo)
    : [...candidate.changedFiles];
  return (await changedFiles).filter((file) => !isFrameworkArtifactPath(file, manifest));
}

function isFrameworkArtifactPath(file: string, manifest: ResolvedOptimizeManifest): boolean {
  const artifactDir = relative(manifest.targetRepo.path, manifest.optimizer.taskGeneration.outputDir);
  if (!artifactDir || artifactDir.startsWith('..')) {
    return false;
  }

  const normalizedFile = normalizeRelativePath(file);
  const normalizedArtifactDir = normalizeRelativePath(artifactDir);
  return normalizedFile === normalizedArtifactDir || normalizedFile.startsWith(`${normalizedArtifactDir}/`);
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
      surfacePaths: unresolved.targetRepo.surfacePaths ?? [],
      cleanIgnorePaths: unresolved.targetRepo.cleanIgnorePaths ?? deriveCleanIgnorePaths(
        unresolved.targetRepo.path,
        unresolved.optimizer?.taskGeneration?.outputDir,
      ),
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
        outputDir: resolve(unresolved.optimizer?.taskGeneration?.outputDir ?? '.skill-optimizer'),
      },
      mode: unresolved.optimizer?.mode ?? 'stable-surface',
    },
    mutation: unresolved.mutation
      ? {
          ...unresolved.mutation,
          reportContextMaxBytes: unresolved.mutation.reportContextMaxBytes ?? 16_000,
        }
      : undefined,
  };
}

function deriveCleanIgnorePaths(targetRepoPath: string, outputDir?: string): string[] {
  if (!outputDir) {
    return [];
  }

  const relativeOutputDir = relative(targetRepoPath, resolve(outputDir));
  if (!relativeOutputDir || relativeOutputDir.startsWith('..')) {
    return [];
  }

  return [relativeOutputDir];
}
