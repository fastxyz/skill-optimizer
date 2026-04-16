import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { fromSurfaceSnapshot, writeActionSnapshotFile } from '../actions/snapshot.js';
import type { ResolvedProjectConfig, SurfaceSnapshot } from '../project/types.js';

import type { FrozenTaskArtifacts, GeneratedTask } from './types.js';

export interface FreezeTaskArtifactsParams {
  project: ResolvedProjectConfig;
  snapshot: SurfaceSnapshot;
  outputDir: string;
  kept: GeneratedTask[];
  rejected: Array<{ task: GeneratedTask; reason: string }>;
}

export function freezeTaskArtifacts(params: FreezeTaskArtifactsParams): FrozenTaskArtifacts {
  if (!params.project.target.skill?.source) {
    throw new Error('Project config must define target.skill before freezing generated benchmark');
  }

  const outputDir = resolve(params.outputDir);
  mkdirSync(outputDir, { recursive: true });

  const tasksPath = join(outputDir, 'tasks.generated.json');
  const benchmarkPath = join(outputDir, 'benchmark.generated.json');
  const logPath = join(outputDir, 'generation.log.json');
  const snapshotPath = join(outputDir, 'surface.snapshot.json');

  writeFileSync(tasksPath, JSON.stringify({ tasks: params.kept }, null, 2), 'utf-8');
  writeActionSnapshotFile(snapshotPath, fromSurfaceSnapshot(params.snapshot));

  const generatedProject = {
    name: params.project.name,
    target: {
      surface: params.project.target.surface,
      repoPath: params.project.target.repoPath,
      skill: {
        source: params.project.target.skill.source,
        cache: params.project.target.skill.cache,
      },
      discovery: params.project.target.discovery,
      sdk: params.project.target.sdk,
      cli: params.project.target.cli,
      mcp: params.project.target.mcp,
      scope: params.project.target.scope,
    },
    benchmark: {
      format: params.project.benchmark.format,
      baseUrl: params.project.benchmark.baseUrl,
      authMode: params.project.benchmark.authMode,
      apiKeyEnv: params.project.benchmark.apiKeyEnv,
      timeout: params.project.benchmark.timeout,
      headers: params.project.benchmark.headers,
      models: params.project.benchmark.models,
      tasks: tasksPath,
      surfaceSnapshot: snapshotPath,
      verdict: params.project.benchmark.verdict,
      taskGeneration: {
        enabled: false,
        maxTasks: params.project.benchmark.taskGeneration.maxTasks,
        seed: params.project.benchmark.taskGeneration.seed,
        outputDir: params.project.benchmark.taskGeneration.outputDir,
      },
      output: params.project.benchmark.output,
      agentic: params.project.benchmark.agentic,
    },
  };
  writeFileSync(benchmarkPath, JSON.stringify(generatedProject, null, 2), 'utf-8');

  writeFileSync(logPath, JSON.stringify({
    benchmarkConfigPath: params.project.configPath,
    generatedAt: new Date().toISOString(),
    keptCount: params.kept.length,
    rejectedCount: params.rejected.length,
    rejected: params.rejected.map((entry) => ({ id: entry.task.id, reason: entry.reason })),
  }, null, 2), 'utf-8');

  return { tasksPath, benchmarkPath, logPath, snapshotPath };
}
