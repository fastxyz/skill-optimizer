import { discoverTaskSurface } from './discover.js';
import { freezeTaskArtifacts } from './freeze.js';
import { generateCandidateTasks } from './generate.js';
import { groundTasks } from './ground.js';

import type { GenerateTasksForProjectResult, TaskGeneratorDeps } from './types.js';

export * from './default-pi-generator.js';
export * from './discover.js';
export * from './freeze.js';
export * from './generate.js';
export * from './ground.js';
export * from './types.js';

export async function generateTasksForProject(
  params: {
    configPath: string;
    maxTasks: number;
    seed: number;
    outputDir: string;
    deps: TaskGeneratorDeps;
  },
): Promise<GenerateTasksForProjectResult> {
  console.log('[optimize] Discovering surface for task generation...');
  const surface = discoverTaskSurface(params.configPath);
  console.log(`[optimize] Loaded ${surface.snapshot.surface} surface with ${surface.snapshot.actions.length} actions.`);

  console.log('[optimize] Generating candidate tasks...');
  const generated = await generateCandidateTasks(surface, { maxTasks: params.maxTasks, seed: params.seed }, params.deps);
  console.log(`[optimize] Model proposed ${generated.length} tasks.`);

  console.log('[optimize] Grounding generated tasks against the discovered surface snapshot...');
  const grounded = groundTasks(generated, surface.snapshot);
  if (grounded.kept.length === 0) {
    throw new Error('Task generation produced zero valid tasks after grounding');
  }

  console.log(`[optimize] Grounded ${grounded.kept.length} tasks, rejected ${grounded.rejected.length}.`);
  console.log('[optimize] Benchmark tasks:');
  for (const task of grounded.kept) {
    console.log(`  - ${task.id}: ${task.prompt}`);
  }

  console.log('[optimize] Freezing generated benchmark artifacts...');
  const artifacts = freezeTaskArtifacts({
    project: surface.project,
    snapshot: surface.snapshot,
    outputDir: params.outputDir,
    kept: grounded.kept,
    rejected: grounded.rejected,
  });

  return {
    surface,
    generated,
    kept: grounded.kept,
    rejected: grounded.rejected,
    artifacts,
  };
}
