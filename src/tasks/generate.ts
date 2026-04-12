import type { ExpectedAction, CoverageReport } from '../benchmark/types.js';
import { getExpectedActionName } from '../benchmark/types.js';

import type { ActionDefinition } from '../actions/types.js';
import { computeUncovered, buildRetryPrompt, computeCoverage } from './coverage.js';
import type { DiscoveredTaskSurface, GeneratedTask, TaskGeneratorConfig, TaskGeneratorDeps } from './types.js';

const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/;

function isSafeTaskId(taskId: string): boolean {
  return SAFE_TASK_ID.test(taskId) && taskId !== '.' && taskId !== '..';
}

export async function generateCandidateTasks(
  surface: DiscoveredTaskSurface,
  config: TaskGeneratorConfig,
  deps: TaskGeneratorDeps,
): Promise<GeneratedTask[]> {
  const system = [
    `You generate ${surface.snapshot.surface.toUpperCase()} benchmark tasks.`,
    'Output strict JSON only with no markdown and no extra prose.',
    'Never invent action names or arguments that are not present in the provided discovered surface snapshot.',
  ].join(' ');

  const prompt = buildPrompt(surface, config);
  const completion = await deps.complete({ system, prompt });
  const tasks = parseGeneratedTasks(completion);
  return tasks.slice(0, Math.max(1, Math.floor(config.maxTasks)));
}

function buildPrompt(surface: DiscoveredTaskSurface, config: TaskGeneratorConfig): string {
  const clampedMax = Math.max(1, Math.floor(config.maxTasks));

  return [
    `Generate benchmark tasks for a ${surface.snapshot.surface} callable surface.`,
    '',
    'Return JSON only. The top-level shape must be:',
    '{"tasks":[{"id":"string","prompt":"string","expected_actions":[{"name":"string","args":{"key":"value"}}]}]}',
    '',
    `Task count limit: produce at most ${clampedMax} tasks.`,
    `Seed for deterministic variety: ${config.seed}.`,
    'Variety requirement: include a mix of simple, medium, and multi-step tasks using different actions and argument combinations.',
    '',
    'Critical rules:',
    '1) Use ONLY action names that exist in the provided discovered surface snapshot.',
    '2) For each expected_actions entry, args keys MUST match discovered action argument names.',
    '3) Include required params in args when an action marks them as required.',
    '4) expected_actions must never be empty.',
    '5) Do not include any keys beyond id, prompt, expected_actions at task level; and name, args at expected_actions level.',
    '',
    'Full SKILL.md:',
    '---BEGIN SKILL---',
    surface.skillMarkdown,
    '---END SKILL---',
    '',
    `Discovered ${surface.snapshot.surface} surface snapshot:`,
    '---BEGIN SURFACE SNAPSHOT---',
    JSON.stringify(surface.snapshot, null, 2),
    '---END SURFACE SNAPSHOT---',
  ].join('\n');
}

function parseGeneratedTasks(raw: string): GeneratedTask[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Task generator returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Task generator response must be a JSON object');
  }

  const tasks = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) {
    throw new Error('Task generator response must contain a top-level "tasks" array');
  }

  return tasks.map((task, index) => validateTask(task, index));
}

function validateTask(task: unknown, index: number): GeneratedTask {
  if (!task || typeof task !== 'object') {
    throw new Error(`Task at index ${index} must be an object`);
  }

  const candidate = task as {
    id?: unknown;
    prompt?: unknown;
    expected_actions?: unknown;
    expected_tools?: unknown;
  };

  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
    throw new Error(`Task at index ${index} must include a non-empty string id`);
  }
  if (typeof candidate.prompt !== 'string' || candidate.prompt.trim() === '') {
    throw new Error(`Task ${candidate.id} must include a non-empty string prompt`);
  }
  const taskId = candidate.id;
  const taskPrompt = candidate.prompt;
  if (!isSafeTaskId(taskId)) {
    throw new Error(`Task ${taskId} must match ${SAFE_TASK_ID.toString()} and cannot be . or ..`);
  }

  const rawExpectedActions = Array.isArray(candidate.expected_actions)
    ? candidate.expected_actions
    : Array.isArray(candidate.expected_tools)
      ? candidate.expected_tools
      : null;

  if (!rawExpectedActions) {
    throw new Error(`Task ${taskId} must include an expected_actions array`);
  }

  const expected_actions = rawExpectedActions.map((action, actionIndex) => validateExpectedAction(taskId, action, actionIndex));

  return {
    id: taskId,
    prompt: taskPrompt,
    expected_actions,
    expected_tools: expected_actions,
  };
}

function validateExpectedAction(taskId: string, action: unknown, actionIndex: number): ExpectedAction {
  if (!action || typeof action !== 'object') {
    throw new Error(`Task ${taskId} expected_actions[${actionIndex}] must be an object`);
  }

  const typed = action as { name?: unknown; method?: unknown; args?: unknown };
  const name = typeof typed.name === 'string' ? typed.name : typeof typed.method === 'string' ? typed.method : null;
  if (!name || name.trim() === '') {
    throw new Error(`Task ${taskId} expected_actions[${actionIndex}] must include a non-empty name`);
  }

  if (typed.args !== undefined && (!typed.args || typeof typed.args !== 'object' || Array.isArray(typed.args))) {
    throw new Error(`Task ${taskId} expected_actions[${actionIndex}] args must be an object when present`);
  }

  const normalized: ExpectedAction = {
    name,
    method: name,
    args: typed.args as Record<string, unknown> | undefined,
  };
  // Touch helper so transitional action alias stays normalized consistently.
  getExpectedActionName(normalized);
  return normalized;
}

export async function generateCandidateTasksWithCoverage(
  surface: DiscoveredTaskSurface,
  config: TaskGeneratorConfig,
  deps: TaskGeneratorDeps,
  inScopeActions: ActionDefinition[],
  outOfScopeActions: ActionDefinition[] = [],
): Promise<{ tasks: GeneratedTask[]; coverage: CoverageReport }> {
  // Iteration 1 — existing one-shot prompt
  const firstPass = await generateCandidateTasks(surface, config, deps);

  let uncovered = computeUncovered(inScopeActions, firstPass);
  if (uncovered.length === 0) {
    return { tasks: firstPass, coverage: computeCoverage(inScopeActions, firstPass, outOfScopeActions) };
  }

  // Iteration 2 — focused retry for uncovered actions
  const retrySystem = 'You generate benchmark tasks targeting specific missing actions. JSON only.';
  const retryPrompt = [
    buildRetryPrompt(uncovered),
    '',
    `Respond with {"tasks":[...]} using the same schema as before.`,
    '',
    'Surface snapshot:',
    '---BEGIN SURFACE SNAPSHOT---',
    JSON.stringify(surface.snapshot, null, 2),
    '---END SURFACE SNAPSHOT---',
  ].join('\n');

  const retryRaw = await deps.complete({ system: retrySystem, prompt: retryPrompt });
  const retryTasks = parseGeneratedTasks(retryRaw);

  // Dedup by id
  const byId = new Map<string, GeneratedTask>();
  for (const t of [...firstPass, ...retryTasks]) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  const combined = [...byId.values()];

  uncovered = computeUncovered(inScopeActions, combined);
  if (uncovered.length > 0) {
    throw new Error(
      `Task generation could not cover ${uncovered.length} in-scope action(s) after 2 iterations: ` +
        `${uncovered.join(', ')}. ` +
        `Improve SKILL.md guidance for these actions, or add them to target.scope.exclude.`,
    );
  }

  return { tasks: combined, coverage: computeCoverage(inScopeActions, combined, outOfScopeActions) };
}
