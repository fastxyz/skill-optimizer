import { discoverTaskSurface } from './discover.js';
import { freezeTaskArtifacts } from './freeze.js';
import { generateCandidateTasks, generateCandidateTasksWithCoverage } from './generate.js';
import { groundTasks } from './ground.js';
import { resolveScope } from './scope.js';
import { computeCoverage } from './coverage.js';

import type { GenerateTasksForProjectResult, GeneratedTask, TaskGeneratorDeps } from './types.js';
import { buildSurfaceSnapshot } from '../project/index.js';
import type { ResolvedProjectConfig } from '../project/types.js';
import type { SurfaceSnapshotAction } from '../project/types.js';

export * from './default-pi-critic.js';
export * from './default-pi-generator.js';
export * from './discover.js';
export * from './freeze.js';
export * from './generate.js';
export * from './ground.js';
export * from './scope.js';
export * from './types.js';

export function discoverActionsOnly(project: ResolvedProjectConfig): SurfaceSnapshotAction[] {
  const snapshot = buildSurfaceSnapshot(project);
  return snapshot.actions;
}

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
  const surface = await discoverTaskSurface(params.configPath);
  console.log(`[optimize] Loaded ${surface.snapshot.surface} surface with ${surface.snapshot.actions.length} actions.`);

  const { inScope, outOfScope } = resolveScope(surface.snapshot.actions, surface.project.target.scope);
  if (inScope.length === 0) {
    console.warn(
      `[warn] Discovery found 0 in-scope actions for surface "${surface.snapshot.surface}".` +
      ` If using CLI surface, add target.cli.commands in your config.` +
      ` Run 'npx skill-optimizer doctor' for a full diagnosis.`
    );
  }
  console.log(`[optimize] Scope filter: ${inScope.length} in scope, ${outOfScope.length} out of scope.`);

  const maxTasks = params.maxTasks;
  if (surface.snapshot.surface !== 'prompt' && maxTasks < inScope.length) {
    throw new Error(
      `benchmark.taskGeneration.maxTasks (${maxTasks}) is smaller than in-scope action count (${inScope.length}). ` +
        `Raise maxTasks in ${params.configPath} or tighten target.scope.exclude.`,
    );
  }

  const filteredSurface = {
    ...surface,
    snapshot: {
      ...surface.snapshot,
      actions: inScope,
    },
  };

  console.log('[optimize] Generating candidate tasks...');
  // Synthesize key=name: SurfaceSnapshotAction omits 'key', but ActionDefinition requires it.
  // Coverage matching only reads action.name so key=name is always correct here.
  const inScopeActions = inScope.map((a) => ({ key: a.name, ...a }));
  const outOfScopeActions = outOfScope.map((a) => ({ key: a.name, ...a }));

  let generated: GeneratedTask[];
  if (filteredSurface.snapshot.surface === 'prompt') {
    // Prompt surface: tasks have expected_actions:[] and are evaluated on content.
    // Coverage enforcement does not apply — skip the retry/coverage-gap loop.
    generated = await generateCandidateTasks(
      filteredSurface,
      { maxTasks: params.maxTasks, seed: params.seed },
      params.deps,
    );
  } else {
    ({ tasks: generated } = await generateCandidateTasksWithCoverage(
      filteredSurface,
      { maxTasks: params.maxTasks, seed: params.seed },
      params.deps,
      inScopeActions,
      outOfScopeActions,
    ));
  }
  console.log(`[optimize] Model proposed ${generated.length} tasks.`);

  console.log('[optimize] Grounding generated tasks against the discovered surface snapshot...');
  const grounded = groundTasks(generated, filteredSurface.snapshot);
  if (grounded.kept.length === 0) {
    throw new Error('Task generation produced zero valid tasks after grounding');
  }

  // Recompute from kept tasks only — pre-grounding coverage may include rejected tasks.
  const taskCoverage = computeCoverage(inScopeActions, grounded.kept, outOfScopeActions);
  console.log(`[optimize] Grounded ${grounded.kept.length} tasks, rejected ${grounded.rejected.length}.`);
  console.log('[optimize] Benchmark tasks:');
  for (const task of grounded.kept) {
    console.log(`  - ${task.id}: ${task.prompt}`);
  }

  console.log('[optimize] Freezing generated benchmark artifacts...');
  const artifacts = freezeTaskArtifacts({
    project: filteredSurface.project,
    snapshot: filteredSurface.snapshot,
    outputDir: params.outputDir,
    kept: grounded.kept,
    rejected: grounded.rejected,
  });

  return {
    surface: filteredSurface,
    generated,
    kept: grounded.kept,
    rejected: grounded.rejected,
    artifacts,
    coverage: taskCoverage,
  };
}
