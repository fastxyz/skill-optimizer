import type { ProjectConfig } from './types.js';
import { isSdkLanguage } from './types.js';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface Issue {
  code: string;
  severity: IssueSeverity;
  field: string;
  message: string;
  hint?: string;
  fixable: boolean;
}

export async function checkConfig(
  config: ProjectConfig,
  _configPath: string,
): Promise<Issue[]> {
  const issues: Issue[] = [];

  function err(code: string, field: string, message: string, hint?: string): void {
    issues.push({ code, severity: 'error', field, message, hint, fixable: false });
  }

  if (!config.name || typeof config.name !== 'string') {
    err('missing-name', 'name', '"name" is required');
    return issues;
  }

  if (!config.target || typeof config.target !== 'object') {
    err('missing-target', 'target', '"target" is required');
    return issues;
  }

  const { target, benchmark, optimize } = config;

  if (target.surface !== 'sdk' && target.surface !== 'cli' && target.surface !== 'mcp') {
    err('invalid-surface', 'target.surface', '"target.surface" must be sdk, cli, or mcp');
  }

  if (target.skill !== undefined) {
    const skillSource = typeof target.skill === 'string' ? target.skill : target.skill?.source;
    if (!skillSource || typeof skillSource !== 'string') {
      err('invalid-skill', 'target.skill', '"target.skill" must be a path string or { source } object');
    }
  }

  if (target.scope !== undefined) {
    if (target.scope.include !== undefined) {
      if (!Array.isArray(target.scope.include) || target.scope.include.some((s) => typeof s !== 'string')) {
        err('invalid-scope-include', 'target.scope.include', '"target.scope.include" must be an array of glob strings');
      }
    }
    if (target.scope.exclude !== undefined) {
      if (!Array.isArray(target.scope.exclude) || target.scope.exclude.some((s) => typeof s !== 'string')) {
        err('invalid-scope-exclude', 'target.scope.exclude', '"target.scope.exclude" must be an array of glob strings');
      }
    }
  }

  if (benchmark?.taskGeneration?.enabled === true && target.skill === undefined) {
    err('missing-skill-for-generation', 'target.skill', '"target.skill" is required when benchmark.taskGeneration.enabled=true');
  }

  if (target.surface === 'sdk') {
    const sdkLanguage = target.sdk?.language ?? target.discovery?.language;
    if (!sdkLanguage || !isSdkLanguage(sdkLanguage)) {
      err('invalid-sdk-language', 'target.sdk.language', '"target.sdk.language" must be typescript, python, or rust');
    }
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery.sources.length > 0;
    const hasApiSurface = Array.isArray(target.sdk?.apiSurface) && target.sdk.apiSurface.length > 0;
    if (!hasCodeSources && !hasApiSurface) {
      err('missing-sdk-surface', 'target', 'SDK targets need discovery.sources or target.sdk.apiSurface');
    }
  }

  if (target.surface === 'cli') {
    const discoveryMode = target.discovery?.mode ?? 'auto';
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery.sources.length > 0;
    const hasManifest = Boolean(target.cli?.commands || target.discovery?.fallbackManifest);
    if (discoveryMode === 'manifest' && !hasManifest) {
      err('missing-cli-manifest', 'target', 'CLI manifest mode requires target.cli.commands or target.discovery.fallbackManifest');
    }
    if (!hasManifest && !hasCodeSources) {
      err('missing-cli-surface', 'target', 'CLI targets need discovery.sources, target.cli.commands, or target.discovery.fallbackManifest');
    }
  }

  if (target.surface === 'mcp') {
    const discoveryMode = target.discovery?.mode ?? 'auto';
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery!.sources.length > 0;
    const hasManifest = Boolean(target.mcp?.tools || target.discovery?.fallbackManifest);
    if (discoveryMode === 'manifest' && !hasManifest) {
      err('missing-mcp-manifest', 'target', 'MCP manifest mode requires target.mcp.tools or target.discovery.fallbackManifest');
    }
    if (!hasManifest && !hasCodeSources) {
      err('missing-mcp-surface', 'target', 'MCP targets need discovery.sources, target.mcp.tools, or target.discovery.fallbackManifest');
    }
  }

  if (target.discovery) {
    if (target.discovery.mode && target.discovery.mode !== 'auto' && target.discovery.mode !== 'manifest') {
      err('invalid-discovery-mode', 'target.discovery.mode', '"target.discovery.mode" must be auto or manifest');
    }
    if (target.discovery.sources !== undefined && !Array.isArray(target.discovery.sources)) {
      err('invalid-discovery-sources', 'target.discovery.sources', '"target.discovery.sources" must be an array when present');
    }
    if (target.discovery.language !== undefined && !isSdkLanguage(target.discovery.language)) {
      err('invalid-discovery-language', 'target.discovery.language', '"target.discovery.language" must be typescript, python, or rust when present');
    }
  }

  if (!benchmark || typeof benchmark !== 'object') {
    err('missing-benchmark', 'benchmark', '"benchmark" is required');
    return issues;
  }

  if (!Array.isArray(benchmark.models) || benchmark.models.length === 0) {
    err('missing-models', 'benchmark.models', '"benchmark.models" must be a non-empty array');
  } else {
    for (const model of benchmark.models) {
      if (!model.id || !model.name || !model.tier) {
        err('invalid-model', 'benchmark.models', 'each benchmark model needs id, name, and tier');
      }
    }

    for (const model of benchmark.models) {
      if (model.weight !== undefined && (!Number.isFinite(model.weight) || model.weight < 0)) {
        err('invalid-model-weight', `benchmark.models[${model.id}].weight`, `model "${model.id}" has invalid weight; must be a non-negative number`);
      }
    }
  }

  if (benchmark.verdict !== undefined) {
    if (benchmark.verdict.perModelFloor !== undefined) {
      const v = benchmark.verdict.perModelFloor;
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        err('invalid-per-model-floor', 'benchmark.verdict.perModelFloor', '"benchmark.verdict.perModelFloor" must be between 0 and 1');
      }
    }
    if (benchmark.verdict.targetWeightedAverage !== undefined) {
      const v = benchmark.verdict.targetWeightedAverage;
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        err('invalid-target-weighted-average', 'benchmark.verdict.targetWeightedAverage', '"benchmark.verdict.targetWeightedAverage" must be between 0 and 1');
      }
    }
  }

  if (benchmark.format && benchmark.format !== 'pi' && benchmark.format !== 'openai' && benchmark.format !== 'anthropic') {
    err('invalid-format', 'benchmark.format', '"benchmark.format" must be pi, openai, or anthropic');
  }

  if (!benchmark.taskGeneration?.enabled && !benchmark.tasks) {
    err('missing-tasks', 'benchmark.tasks', '"benchmark.tasks" is required when task generation is disabled');
  }

  if (benchmark.taskGeneration?.maxTasks !== undefined && (!Number.isInteger(benchmark.taskGeneration.maxTasks) || benchmark.taskGeneration.maxTasks <= 0)) {
    err('invalid-max-tasks', 'benchmark.taskGeneration.maxTasks', '"benchmark.taskGeneration.maxTasks" must be a positive integer');
  }

  if (benchmark.taskGeneration?.seed !== undefined && (!Number.isInteger(benchmark.taskGeneration.seed) || benchmark.taskGeneration.seed < 0)) {
    err('invalid-seed', 'benchmark.taskGeneration.seed', '"benchmark.taskGeneration.seed" must be a non-negative integer');
  }

  if (optimize) {
    if (optimize.mode !== undefined && optimize.mode !== 'stable-surface' && optimize.mode !== 'surface-changing') {
      err('invalid-optimize-mode', 'optimize.mode', '"optimize.mode" must be stable-surface or surface-changing');
    }
    if (optimize.mode === 'surface-changing' && benchmark.taskGeneration?.enabled !== true) {
      err('surface-changing-needs-generation', 'optimize.mode', 'surface-changing optimization requires benchmark.taskGeneration.enabled=true');
    }
    if (optimize.enabled !== false) {
      if (!Array.isArray(optimize.allowedPaths) || optimize.allowedPaths.length === 0) {
        err('missing-allowed-paths', 'optimize.allowedPaths', '"optimize.allowedPaths" must be a non-empty array when optimization is enabled');
      }
    }

    if (optimize.maxIterations !== undefined && (!Number.isInteger(optimize.maxIterations) || optimize.maxIterations <= 0)) {
      err('invalid-max-iterations', 'optimize.maxIterations', '"optimize.maxIterations" must be a positive integer');
    }

    if (optimize.stabilityWindow !== undefined && (!Number.isInteger(optimize.stabilityWindow) || optimize.stabilityWindow <= 0)) {
      err('invalid-stability-window', 'optimize.stabilityWindow', '"optimize.stabilityWindow" must be a positive integer');
    }

    if (optimize.minImprovement !== undefined && (!Number.isFinite(optimize.minImprovement) || optimize.minImprovement < 0)) {
      err('invalid-min-improvement', 'optimize.minImprovement', '"optimize.minImprovement" must be a non-negative number');
    }

    if (optimize.reportContextMaxBytes !== undefined && (!Number.isInteger(optimize.reportContextMaxBytes) || optimize.reportContextMaxBytes <= 0)) {
      err('invalid-report-context-max-bytes', 'optimize.reportContextMaxBytes', '"optimize.reportContextMaxBytes" must be a positive integer');
    }

    if (optimize.requireCleanGit === false) {
      err('require-clean-git-disabled', 'optimize.requireCleanGit', '"optimize.requireCleanGit" must remain true in v1');
    }
  }

  // filesystem and environment checks will be added in Task 2

  return issues;
}

export async function validateProjectConfig(config: ProjectConfig, configPath: string): Promise<void> {
  const issues = await checkConfig(config, configPath);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(errors.map((i) => `${i.field}: ${i.message}${i.hint ? ` — ${i.hint}` : ''}`).join('\n'));
  }
}
