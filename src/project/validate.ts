import { existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ProjectConfig } from './types.js';
import { isSdkLanguage, parseModelRef } from './types.js';
import { resolveApiKey } from '../runtime/pi/auth.js';

const execFileAsync = promisify(execFile);

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
  config: unknown,
  _configPath: string,
  opts?: { skipDirtyGitCheck?: boolean },
): Promise<Issue[]> {
  const issues: Issue[] = [];

  function err(code: string, field: string, message: string, hint?: string): void {
    issues.push({ code, severity: 'error', field, message, hint, fixable: false });
  }

  const cfg = config as ProjectConfig;

  if (!cfg.name || typeof cfg.name !== 'string') {
    err('missing-name', 'name', '"name" is required');
    return issues;
  }

  if (!cfg.target || typeof cfg.target !== 'object') {
    err('missing-target', 'target', '"target" is required');
    return issues;
  }

  const { target, benchmark, optimize } = cfg;

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
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery?.sources.length > 0;
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

    for (const [i, model] of benchmark.models.entries()) {
      if (model.weight !== undefined && (!Number.isFinite(model.weight) || model.weight < 0)) {
        err('invalid-model-weight', `benchmark.models[${i}].weight`, `model "${model.id}" has invalid weight; must be a non-negative number`);
      }
    }

    if (benchmark.authMode === 'codex') {
      for (const [i, model] of benchmark.models.entries()) {
        try {
          const { provider } = parseModelRef(model.id);
          if (provider !== 'openai') {
            err(
              'codex-auth-provider-mismatch',
              `benchmark.models[${i}].id`,
              `benchmark.authMode="codex" only supports openai/* models, but found "${model.id}"`,
              'Use openai/* model IDs with codex auth, or switch benchmark.authMode to "env" / "auto"',
            );
          }
        } catch {
          // model-id format issues are reported separately
        }
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

    const effectiveOptimizeAuthMode = optimize.authMode ?? benchmark.authMode;
    if (effectiveOptimizeAuthMode === 'codex') {
      const optimizeModelRef = optimize.model
        ?? (Array.isArray(benchmark.models) && benchmark.models.length > 0 ? benchmark.models[0]!.id : undefined);
      if (typeof optimizeModelRef === 'string') {
        try {
          const { provider } = parseModelRef(optimizeModelRef);
          if (provider !== 'openai') {
            err(
              'codex-auth-provider-mismatch',
              'optimize.model',
              `optimize.authMode="codex" only supports openai/* models, but found "${optimizeModelRef}"`,
              'Use an openai/* optimize.model with codex auth, or switch optimize.authMode to "env" / "auto"',
            );
          }
        } catch {
          // model-id format issues are reported separately
        }
      }
    }
  }

  const configDir = dirname(_configPath);

  // Check: target.repoPath exists
  if (target.repoPath !== undefined) {
    const absRepo = isAbsolute(target.repoPath) ? target.repoPath : resolve(configDir, target.repoPath);
    if (!existsSync(absRepo)) {
      issues.push({
        code: 'repo-path-missing', severity: 'error', field: 'target.repoPath',
        message: `"target.repoPath" does not exist: ${absRepo}`,
        hint: `Set target.repoPath to the absolute path of your project root`,
        fixable: false,
      });
    }
  }

  // Check: target.skill file exists (skip for remote sources — github: / https: / http:)
  if (target.skill !== undefined) {
    const skillSource = typeof target.skill === 'string' ? target.skill : target.skill.source;
    const isRemoteSkill = skillSource.startsWith('github:') || skillSource.startsWith('https://') || skillSource.startsWith('http://');
    if (skillSource && !isRemoteSkill) {
      const absSkill = isAbsolute(skillSource) ? skillSource : resolve(configDir, skillSource);
      if (!existsSync(absSkill)) {
        issues.push({
          code: 'skill-file-missing', severity: 'error', field: 'target.skill',
          message: `"target.skill" does not exist: ${absSkill}`,
          hint: `Create SKILL.md at that path or update target.skill`,
          fixable: false,
        });
      }
    }
  }

  // Check: target.discovery.sources all exist
  if (Array.isArray(target.discovery?.sources)) {
    for (const src of target.discovery!.sources) {
      const absSrc = isAbsolute(src) ? src : resolve(configDir, src);
      if (!existsSync(absSrc)) {
        issues.push({
          code: 'discovery-source-missing', severity: 'error', field: 'target.discovery.sources',
          message: `discovery source does not exist: ${absSrc}`,
          hint: `Update target.discovery.sources to point at your entry file`,
          fixable: false,
        });
      }
    }
  }

  // Check: CLI/MCP manifest file exists if configured
  const manifestPath = target.cli?.commands ?? target.mcp?.tools ?? target.discovery?.fallbackManifest;
  if (manifestPath) {
    const absManifest = isAbsolute(manifestPath) ? manifestPath : resolve(configDir, manifestPath);
    if (!existsSync(absManifest)) {
      let field: string;
      if (target.cli?.commands) {
        field = 'target.cli.commands';
      } else if (target.mcp?.tools) {
        field = 'target.mcp.tools';
      } else {
        field = 'target.discovery.fallbackManifest';
      }
      issues.push({
        code: 'manifest-file-missing', severity: 'error', field,
        message: `manifest file does not exist: ${absManifest}`,
        hint: `Run 'skill-optimizer init ${target.surface}' to generate a template manifest`,
        fixable: false,
      });
    }
  }

  // Check: model ID format
  if (Array.isArray(benchmark.models)) {
    for (let i = 0; i < benchmark.models.length; i++) {
      const model = benchmark.models[i]!;
      if (!model.id) continue;

      const hasProviderPrefix = model.id.includes('/') && (
        model.id.startsWith('openrouter/') ||
        model.id.startsWith('anthropic/') ||
        model.id.startsWith('openai/')
      );
      if (!hasProviderPrefix) {
        issues.push({
          code: 'model-id-missing-prefix', severity: 'error', field: `benchmark.models[${i}].id`,
          message: `model ID "${model.id}" is missing a provider prefix`,
          hint: `Change to: openrouter/${model.id}`,
          fixable: true,
        });
      }

      // OpenAI's own API uses dots in some model slugs (e.g. gpt-4.5), so skip the
      // dot check for openai/ IDs. All other providers (openrouter/, anthropic/, etc.)
      // expect hyphens in version segments.
      if (!model.id.startsWith('openai/') && /\d+\.\d+/.test(model.id)) {
        const corrected = model.id.replace(/(\d+)\.(\d+)/g, '$1-$2');
        issues.push({
          code: 'model-id-bad-format', severity: 'warning', field: `benchmark.models[${i}].id`,
          message: `model ID "${model.id}" uses dots in version segment — use hyphens instead`,
          hint: `Change to: ${corrected}`,
          fixable: true,
        });
      }
    }
  }

  // Check: optimize.allowedPaths inside target.repoPath
  if (optimize?.allowedPaths && target.repoPath) {
    const absRepo = isAbsolute(target.repoPath) ? target.repoPath : resolve(configDir, target.repoPath);
    for (const ap of optimize.allowedPaths) {
      const absAp = isAbsolute(ap) ? ap : resolve(absRepo, ap);
      if (!absAp.startsWith(absRepo + '/') && absAp !== absRepo) {
        issues.push({
          code: 'allowed-path-outside-repo', severity: 'error', field: 'optimize.allowedPaths',
          message: `allowedPath "${ap}" is not inside target.repoPath "${absRepo}"`,
          hint: `Use a path inside ${absRepo}`,
          fixable: false,
        });
      }
    }
  }

  // Check: API key env var / Codex auth
  const authMode = benchmark.authMode ?? 'env';
  // Helper: push a missing-credential warning for a given provider
  function warnMissingApiKey(provider: string, effectiveAuthMode: typeof authMode, apiKeyEnv: string | undefined, fieldPrefix: 'benchmark' | 'optimize'): void {
    const defaultEnvName = apiKeyEnv
      ?? (provider === 'openai' ? 'OPENAI_API_KEY'
        : provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
        : 'OPENROUTER_API_KEY');
    const hint = effectiveAuthMode === 'codex'
      ? `Sign in with Codex so ~/.codex/auth.json contains a browser-login access token or OPENAI_API_KEY, or switch ${fieldPrefix}.authMode to "env"`
      : effectiveAuthMode === 'auto' && provider === 'openai'
        ? `Run: export ${defaultEnvName}=... or sign in with Codex`
        : `Run: export ${defaultEnvName}=...`;
    issues.push({
      code: 'api-key-not-set', severity: 'warning',
      field: effectiveAuthMode === 'codex' ? `${fieldPrefix}.authMode` : `${fieldPrefix}.apiKeyEnv`,
      message: effectiveAuthMode === 'codex'
        ? 'Codex auth is enabled but no usable browser-login access token or OPENAI_API_KEY was found in ~/.codex/auth.json'
        : `No API key was found for authMode "${effectiveAuthMode}"`,
      hint,
      fixable: false,
    });
  }

  if (benchmark.format === 'openai' || benchmark.format === 'anthropic') {
    // Single direct-API provider — one credential to check
    const benchmarkProvider = benchmark.format === 'openai' ? 'openai' : 'anthropic';
    const apiKey = resolveApiKey({ provider: benchmarkProvider, authMode, apiKeyEnv: benchmark.apiKeyEnv });
    if (!apiKey) warnMissingApiKey(benchmarkProvider, authMode, benchmark.apiKeyEnv, 'benchmark');
  } else {
    // Pi format: each model may route through a different provider — check all unique ones
    const modelList = Array.isArray(benchmark.models) ? benchmark.models : [];
    const providers = Array.from(new Set(
      modelList.length > 0
        ? modelList.map(m => String(m.id ?? '').split('/')[0] || 'openrouter')
        : ['openrouter'],
    ));
    for (const provider of providers) {
      const apiKey = resolveApiKey({ provider, authMode, apiKeyEnv: benchmark.apiKeyEnv });
      if (!apiKey) warnMissingApiKey(provider, authMode, benchmark.apiKeyEnv, 'benchmark');
    }
  }

  // Check: optimize API key env var / Codex auth
  if (optimize !== undefined) {
    const optimizeAuthMode = optimize.authMode ?? benchmark.authMode ?? 'env';
    const optimizeModelRef = optimize.model
      ?? (Array.isArray(benchmark.models) && benchmark.models.length > 0 ? benchmark.models[0]!.id : undefined);
    const optimizeProvider = typeof optimizeModelRef === 'string'
      ? (optimizeModelRef.split('/')[0] || 'openrouter')
      : 'openrouter';
    const optimizeApiKeyEnv = optimize.apiKeyEnv ?? benchmark.apiKeyEnv;
    const optimizeApiKey = resolveApiKey({ provider: optimizeProvider, authMode: optimizeAuthMode, apiKeyEnv: optimizeApiKeyEnv });
    if (!optimizeApiKey) warnMissingApiKey(optimizeProvider, optimizeAuthMode, optimizeApiKeyEnv, 'optimize');
  }

  // Check: dirty git (injection-safe: fixed arg array, no shell)
  // Skipped when called from within the optimizer benchmark loop — the loop manages
  // git state itself via ensureReady (run once before the loop starts).
  if (!opts?.skipDirtyGitCheck && optimize !== undefined && optimize.requireCleanGit !== false && target.repoPath) {
    const absRepo = isAbsolute(target.repoPath) ? target.repoPath : resolve(configDir, target.repoPath);
    if (existsSync(absRepo)) {
      try {
        // Verify the git root is exactly target.repoPath, not a parent directory.
        // If target.repoPath is a subdirectory of a larger repo (e.g. a mock template
        // inside the tool's own repo), git status would reflect the parent's state —
        // skip the check to avoid false positives.
        const { stdout: rootOut } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: absRepo });
        const gitRoot = rootOut.trim();
        if (gitRoot === absRepo) {
          const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: absRepo });
          const dirtyTracked = stdout.split('\n').filter(l => l.trim() && !l.startsWith('??'));
          if (dirtyTracked.length > 0) {
            issues.push({
              code: 'dirty-git', severity: 'error', field: 'target.repoPath',
              message: `target repo has uncommitted changes (optimize.requireCleanGit is enabled)`,
              hint: `Run: git stash  or commit your changes in ${absRepo}`,
              fixable: false,
            });
          }
        }
      } catch {
        // Not a git repo or git unavailable — skip silently
      }
    }
  }

  // Check: deprecated benchmark.tasks field
  if (benchmark.tasks !== undefined && benchmark.taskGeneration?.enabled === true) {
    issues.push({
      code: 'deprecated-tasks-field', severity: 'warning', field: 'benchmark.tasks',
      message: '"benchmark.tasks" is set but task generation is enabled — the tasks field is deprecated',
      hint: `Remove "tasks" from benchmark — task generation replaces it`,
      fixable: true,
    });
  }

  // Check: legacy skill-benchmark.json alongside skill-optimizer.json
  const legacyPath = resolve(dirname(_configPath), 'skill-benchmark.json');
  if (existsSync(legacyPath)) {
    issues.push({
      code: 'legacy-config-name', severity: 'warning', field: '(config file)',
      message: `Found legacy "skill-benchmark.json" alongside "skill-optimizer.json"`,
      hint: `Delete skill-benchmark.json — it is no longer used`,
      fixable: false,
    });
  }

  return issues;
}

export async function validateProjectConfig(config: ProjectConfig, configPath: string, opts?: { skipDirtyGitCheck?: boolean }): Promise<void> {
  const issues = await checkConfig(config, configPath, opts);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(errors.map((i) => `${i.field}: ${i.message}${i.hint ? ` — ${i.hint}` : ''}`).join('\n'));
  }
}
