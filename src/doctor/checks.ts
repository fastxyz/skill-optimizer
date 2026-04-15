import type { ResolvedProjectConfig } from '../project/types.js';
import type { Issue } from '../project/validate.js';
import { discoverActionsOnly, resolveScope } from '../tasks/index.js';
import { requireConfiguredApiKey } from '../runtime/pi/index.js';

/**
 * Tier-2: discover actions and verify scope + maxTasks.
 */
export function checkDiscovery(project: ResolvedProjectConfig): Issue[] {
  const issues: Issue[] = [];
  let discovered: ReturnType<typeof discoverActionsOnly>;

  try {
    discovered = discoverActionsOnly(project);
  } catch (err) {
    issues.push({
      code: 'discovery-failed', severity: 'error', field: 'target.discovery',
      message: `Discovery threw an error: ${err instanceof Error ? err.message : String(err)}`,
      hint: `Check target.discovery.sources and your manifest file`,
      fixable: false,
    });
    return issues;
  }

  const { inScope } = resolveScope(discovered, project.target.scope);

  if (inScope.length === 0) {
    let surfaceHint: string;
    if (project.target.surface === 'cli') {
      surfaceHint = `Add target.cli.commands pointing at a cli-commands.json manifest, or fix target.discovery.sources`;
    } else if (project.target.surface === 'mcp') {
      surfaceHint = `Add target.mcp.tools pointing at a tools.json manifest, or fix target.discovery.sources`;
    } else {
      surfaceHint = `Fix target.discovery.sources to point at your SDK entry file`;
    }
    issues.push({
      code: 'zero-actions-discovered', severity: 'error', field: 'target.discovery',
      message: `Discovery found 0 in-scope actions`,
      hint: surfaceHint,
      fixable: false,
    });
  } else {
    const maxTasks = project.benchmark.taskGeneration?.maxTasks ?? 0;
    if (project.benchmark.taskGeneration?.enabled && maxTasks < inScope.length) {
      issues.push({
        code: 'max-tasks-too-low', severity: 'error', field: 'benchmark.taskGeneration.maxTasks',
        message: `maxTasks (${maxTasks}) is less than the number of in-scope actions (${inScope.length})`,
        hint: `Raise benchmark.taskGeneration.maxTasks to at least ${inScope.length}`,
        fixable: false,
      });
    }
    issues.push({
      code: 'discovery-ok', severity: 'info', field: 'target.discovery',
      message: `${inScope.length} action(s) discovered (${project.target.surface} surface)`,
      fixable: false,
    });
  }

  return issues;
}

/**
 * Tier-3: ping each model with a 1-token request.
 */
export async function checkModelReachability(project: ResolvedProjectConfig): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Only PI format uses OpenRouter; skip reachability for other formats
  if (project.benchmark.format && project.benchmark.format !== 'pi') {
    issues.push({
      code: 'reachability-skipped', severity: 'info', field: 'benchmark.format',
      message: `Skipping reachability check — model probing is only implemented for openrouter/* model IDs via the OpenRouter API`,
      fixable: false,
    });
    return issues;
  }

  const openrouterEntries = project.benchmark.models
    .map((model, i) => ({ model, i }))
    .filter(({ model }) => model.id.startsWith('openrouter/'));
  const skippedCount = project.benchmark.models.length - openrouterEntries.length;

  if (skippedCount > 0) {
    issues.push({
      code: 'reachability-skipped', severity: 'info', field: 'benchmark.models',
      message: `Skipping reachability for ${skippedCount} non-OpenRouter model(s) (only OpenRouter models can be probed)`,
      fixable: false,
    });
  }

  if (openrouterEntries.length === 0) {
    return issues;
  }

  let apiKey: string;
  try {
    apiKey = requireConfiguredApiKey({
      provider: 'openrouter',
      authMode: project.benchmark.authMode,
      apiKeyEnv: project.benchmark.apiKeyEnv,
    });
  } catch {
    return issues; // already reported by checkConfig
  }

  for (const { model, i } of openrouterEntries) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id.replace(/^openrouter\//, ''),
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        issues.push({
          code: 'model-unreachable', severity: 'error', field: `benchmark.models[${i}].id`,
          message: `Model "${model.id}" returned HTTP ${res.status}: ${body.slice(0, 120)}`,
          hint: `Check the model ID at https://openrouter.ai/models and verify your API key`,
          fixable: false,
        });
      }
    } catch (err) {
      issues.push({
        code: 'model-unreachable', severity: 'error', field: `benchmark.models[${i}].id`,
        message: `Model "${model.id}" unreachable: ${err instanceof Error ? err.message : String(err)}`,
        hint: `Check your network and API key`,
        fixable: false,
      });
    }
  }

  return issues;
}
