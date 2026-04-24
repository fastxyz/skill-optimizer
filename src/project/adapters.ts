import type { BenchmarkConfig, SkillConfig } from '../benchmark/types.js';
import type { ResolvedOptimizeManifest } from '../optimizer/types.js';
import type { ResolvedProjectConfig } from './types.js';
import { parseModelRef } from './types.js';
import { buildMcpToolDefinitionsFromSnapshot, buildSurfaceSnapshot } from './snapshot.js';
import { buildCanonicalSkillReferenceEntries } from './skill-references.js';

export function toBenchmarkConfig(project: ResolvedProjectConfig): BenchmarkConfig {
  const surfaceSnapshot = buildSurfaceSnapshot(project);
  return {
    name: project.name,
    surface: project.target.surface,
    sdk: project.target.sdk && {
      language: project.target.sdk.language,
      style: project.target.sdk.style,
      apiSurface: project.target.sdk.apiSurface,
    },
    cli: project.target.cli,
    mcp: project.target.mcp,
    skill: project.target.skill as SkillConfig | undefined,
    tasks: project.benchmark.tasks ?? '__generated__',
    llm: {
      format: project.benchmark.format,
      baseUrl: project.benchmark.baseUrl,
      authMode: project.benchmark.authMode,
      apiKeyEnv: project.benchmark.apiKeyEnv,
      timeout: project.benchmark.timeout,
      headers: project.benchmark.headers,
      models: project.benchmark.models,
    },
    output: project.benchmark.output,
    agentic: project.benchmark.agentic,
    surfaceSnapshot,
    mcpToolDefinitions: project.target.surface === 'mcp'
      ? buildMcpToolDefinitionsFromSnapshot(surfaceSnapshot)
      : undefined,
  };
}

export function toOptimizeManifest(project: ResolvedProjectConfig): ResolvedOptimizeManifest {
  const optimize = project.optimize;
  if (!optimize || !optimize.enabled) {
    throw new Error(`Project ${project.configPath} does not have optimization enabled`);
  }

  const mutationModel = parseModelRef(optimize.model);

  // Resolve the local skill path — only for file-system sources (not github:/https:)
  const skillSource = project.target.skill?.source;
  const skillPath = skillSource && !skillSource.startsWith('github:') && !skillSource.startsWith('http')
    ? skillSource
    : undefined;

  return {
    benchmarkConfig: project.configPath,
    skillPath,
    skillReferences: skillPath && project.target.skill?.references
      ? buildCanonicalSkillReferenceEntries(skillPath, project.target.skill.references)
      : undefined,
    targetRepo: {
      path: project.target.repoPath,
      surface: project.target.surface,
      allowedPaths: optimize.allowedPaths,
      surfacePaths: getProjectSurfacePaths(project),
      validation: optimize.validation,
      requireCleanGit: optimize.requireCleanGit,
    },
    optimizer: {
      mode: optimize.mode,
      maxIterations: optimize.maxIterations,
      stabilityWindow: optimize.stabilityWindow,
      minImprovement: optimize.minImprovement,
      taskGeneration: {
        enabled: project.benchmark.taskGeneration.enabled,
        maxGenerated: project.benchmark.taskGeneration.maxTasks,
        seed: project.benchmark.taskGeneration.seed,
        outputDir: project.benchmark.taskGeneration.outputDir,
      },
      perModelFloor: project.benchmark.verdict.perModelFloor,
      targetWeightedAverage: project.benchmark.verdict.targetWeightedAverage,
      models: project.benchmark.models,
    },
    mutation: {
      provider: mutationModel.provider,
      model: mutationModel.model,
      authMode: optimize.authMode,
      apiKeyEnv: optimize.apiKeyEnv,
      thinkingLevel: optimize.thinkingLevel,
      reportContextMaxBytes: optimize.reportContextMaxBytes,
    },
  };
}

function getProjectSurfacePaths(project: ResolvedProjectConfig): string[] {
  const paths = new Set<string>();

  for (const source of project.target.discovery?.sources ?? []) {
    paths.add(source);
  }

  if (project.target.discovery?.fallbackManifest) {
    paths.add(project.target.discovery.fallbackManifest);
  }

  for (const entrypoint of project.target.sdk?.entrypoints ?? []) {
    paths.add(entrypoint);
  }

  if (project.target.cli?.commands) {
    paths.add(project.target.cli.commands);
  }

  if (project.target.mcp?.tools) {
    paths.add(project.target.mcp.tools);
  }

  // Pinned surface snapshots are part of the surface definition — edits to
  // them must be tracked so stable-surface mode can detect drift.
  if (project.benchmark.surfaceSnapshot) {
    paths.add(project.benchmark.surfaceSnapshot);
  }

  return [...paths];
}
