import type { CoverageReport, ExpectedAction } from '../benchmark/types.js';
import type { ResolvedProjectConfig, SurfaceSnapshot } from '../project/types.js';

export interface GeneratedTask {
  id: string;
  prompt: string;
  expected_actions?: ExpectedAction[];
  expected_tools?: ExpectedAction[];
}

export interface TaskGeneratorConfig {
  maxTasks: number;
  seed: number;
}

export interface TaskGeneratorDeps {
  complete(input: { system: string; prompt: string }): Promise<string>;
}

export interface DiscoveredTaskSurface {
  project: ResolvedProjectConfig;
  skillMarkdown: string;
  skillPath: string;
  snapshot: SurfaceSnapshot;
}

export interface GroundedTasksResult {
  kept: GeneratedTask[];
  rejected: Array<{ task: GeneratedTask; reason: string }>;
}

export interface FrozenTaskArtifacts {
  tasksPath: string;
  benchmarkPath: string;
  logPath: string;
  snapshotPath: string;
}

export interface GenerateTasksForProjectResult extends GroundedTasksResult {
  surface: DiscoveredTaskSurface;
  generated: GeneratedTask[];
  artifacts: FrozenTaskArtifacts;
  coverage: CoverageReport;
}
