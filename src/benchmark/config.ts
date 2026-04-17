import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BenchmarkConfig,
  TaskDefinition,
  ModelConfig,
  ExpectedAction,
} from './types.js';
import { DEFAULT_PROJECT_CONFIG_NAME, loadProjectConfig, toBenchmarkConfig } from '../project/index.js';
export { loadMcpTools, loadCliCommands } from '../actions/loaders.js';

const DEFAULT_CONFIG_NAME = DEFAULT_PROJECT_CONFIG_NAME;
const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/;

function isSafeTaskId(taskId: string): boolean {
  return SAFE_TASK_ID.test(taskId) && taskId !== '.' && taskId !== '..';
}

/**
 * Load benchmark config from the given path or search for benchmark.config.json
 * in the current working directory.
 */
export async function loadConfig(configPath?: string): Promise<{ config: BenchmarkConfig; configDir: string }> {
  // Skip the dirty-git check here — it runs on every benchmark invocation (baseline,
  // each iteration) which causes false failures when the mutation agent operates in
  // the target repo between iterations. The optimizer manages git state via ensureReady
  // (run once before the loop); the standalone `run` command validates via its own
  // loadProjectConfig call in cli.ts before generating tasks.
  const project = await loadProjectConfig(configPath ?? DEFAULT_CONFIG_NAME, { skipDirtyGitCheck: true });
  return {
    config: toBenchmarkConfig(project),
    configDir: project.configDir,
  };
}

/**
 * Load task definitions from the tasks.json path specified in config.
 * Resolves the path relative to the config file's directory or CWD.
 */
export function loadTasks(tasksPath: string, baseDir?: string): TaskDefinition[] {
  const resolved = resolve(baseDir ?? process.cwd(), tasksPath);
  if (!existsSync(resolved)) {
    throw new Error(`Tasks file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read tasks: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  let parsed: { tasks: Array<{ id?: unknown; prompt?: unknown; expected_actions?: unknown; verify?: unknown; expected_fetches?: unknown; capabilityId?: unknown }> };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch (err) {
    throw new Error(`Invalid JSON in tasks file: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error(`Tasks file ${resolved}: must have a "tasks" array at the root`);
  }

  return parsed.tasks.map((task, index) => normalizeTaskDefinition(task, resolved, index));
}

function normalizeTaskDefinition(
  task: { id?: unknown; prompt?: unknown; expected_actions?: unknown; verify?: unknown; expected_fetches?: unknown; capabilityId?: unknown },
  resolvedPath: string,
  index: number,
): TaskDefinition {
  if (typeof task.id !== 'string' || task.id.trim() === '') {
    throw new Error(`Tasks file ${resolvedPath}: task at index ${index} must include a non-empty string id`);
  }
  if (!isSafeTaskId(task.id)) {
    throw new Error(`Tasks file ${resolvedPath}: task id "${task.id}" must match ${SAFE_TASK_ID.toString()} and cannot be . or ..`);
  }
  if (typeof task.prompt !== 'string' || task.prompt.trim() === '') {
    throw new Error(`Tasks file ${resolvedPath}: task ${task.id} must include a non-empty string prompt`);
  }

  const rawExpectedActions = Array.isArray(task.expected_actions) ? task.expected_actions : null;

  if (!rawExpectedActions) {
    throw new Error(`Tasks file ${resolvedPath}: task at index ${index} must include an expected_actions array`);
  }

  const expected_actions = rawExpectedActions.map((rawAction, actionIndex) => normalizeExpectedAction(rawAction, resolvedPath, index, actionIndex));

  const rawVerify = Array.isArray(task.verify) ? task.verify : undefined;
  if (rawVerify !== undefined) {
    for (let i = 0; i < rawVerify.length; i++) {
      if (!rawVerify[i] || typeof rawVerify[i] !== 'object') {
        throw new Error(`Tasks file ${resolvedPath}: task ${task.id} verify[${i}] must be an object`);
      }
    }
  }

  const rawFetches = Array.isArray(task.expected_fetches) ? task.expected_fetches : undefined;
  if (rawFetches !== undefined) {
    for (let i = 0; i < rawFetches.length; i++) {
      if (typeof rawFetches[i] !== 'string' || !(rawFetches[i] as string).trim()) {
        throw new Error(`Tasks file ${resolvedPath}: task ${task.id} expected_fetches[${i}] must be a non-empty string`);
      }
    }
  }

  const capabilityId = typeof task.capabilityId === 'string' ? task.capabilityId : undefined;

  return {
    id: task.id,
    prompt: task.prompt,
    expected_actions,
    verify: rawVerify as TaskDefinition['verify'] | undefined,
    expected_fetches: rawFetches as string[] | undefined,
    ...(capabilityId !== undefined ? { capabilityId } : {}),
  };
}

function normalizeExpectedAction(
  rawAction: unknown,
  resolvedPath: string,
  taskIndex: number,
  actionIndex: number,
): ExpectedAction {
  if (!rawAction || typeof rawAction !== 'object') {
    throw new Error(`Tasks file ${resolvedPath}: task ${taskIndex} action ${actionIndex} must be an object`);
  }

  const candidate = rawAction as { name?: unknown; args?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : null;

  if (!name || name.trim() === '') {
    throw new Error(`Tasks file ${resolvedPath}: task ${taskIndex} action ${actionIndex} must include a non-empty name`);
  }

  if (candidate.args !== undefined && (!candidate.args || typeof candidate.args !== 'object' || Array.isArray(candidate.args))) {
    throw new Error(`Tasks file ${resolvedPath}: task ${taskIndex} action ${actionIndex} args must be an object when present`);
  }

  return {
    name,
    args: (candidate.args as Record<string, unknown> | undefined) ?? {},
  };
}

/**
 * Helper to get a model by slug (lowercased name with non-alphanumeric replaced by hyphens).
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getModelBySlug(config: BenchmarkConfig, slug: string): ModelConfig | undefined {
  return config.llm.models.find(m => slugify(m.name) === slug || m.id === slug);
}

export function getModelsByTier(config: BenchmarkConfig, tier: string): ModelConfig[] {
  return config.llm.models.filter(m => m.tier === tier);
}
