import { createHash } from 'node:crypto';

import type { ExpectedAction, CoverageReport } from '../benchmark/types.js';

import type { ActionDefinition } from '../actions/types.js';
import { computeUncovered, buildRetryPrompt, computeCoverage } from './coverage.js';
import type { DiscoveredTaskSurface, GeneratedTask, TaskGeneratorConfig, TaskGeneratorDeps } from './types.js';

// Derive a stable task ID from the expected action names.
// Action names are surface-stable (they come from discovered code, not LLM free-form output),
// so the same surface produces the same IDs across regenerations.
function stableTaskId(actionNames: string[]): string {
  const key = [...actionNames].sort().join('\x00');
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
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

  // For prompt surface, pass the known capability keys so parseGeneratedTasks
  // can attach capabilityId to each task; membership validation is in ground.ts.
  const knownCapabilityKeys = surface.snapshot.surface === 'prompt'
    ? surface.snapshot.actions.map((a) => a.name)
    : undefined;

  const tasks = parseGeneratedTasks(completion, knownCapabilityKeys);
  return tasks.slice(0, Math.max(1, Math.floor(config.maxTasks)));
}

function buildPrompt(surface: DiscoveredTaskSurface, config: TaskGeneratorConfig): string {
  const clampedMax = Math.max(1, Math.floor(config.maxTasks));
  const referenceContext = buildReferenceContext(surface);

  if (surface.snapshot.surface === 'prompt') {
    const capKeys = surface.snapshot.actions.map((a) => a.name);
    return [
      'Generate benchmark evaluation tasks for a prompt/skill document.',
      'These tasks will be evaluated by content quality, not action matching.',
      '',
      'Return a JSON object with EXACTLY this shape:',
      '{"tasks":[{"id":"string","prompt":"string","expected_actions":[],"capabilityId":"string"}]}',
      '',
      'RULES:',
      '- Each task has EXACTLY four keys: id, prompt, expected_actions, capabilityId.',
      '- expected_actions MUST always be an empty array [].',
      '- id: short snake_case identifier (e.g. "deploy_service_to_staging").',
      '- prompt: ask the model to perform a realistic task from the skill.',
      '- capabilityId: set to the action key of the discovered capability this task exercises.',
      `- Valid capabilityId values: ${capKeys.join(', ')}.`,
      '- Every task MUST have a capabilityId from the valid list above — no other values are accepted.',
      `- Produce at most ${clampedMax} tasks. Seed: ${config.seed}.`,
      '',
      'Full SKILL.md:',
      '---BEGIN SKILL---',
      surface.skillMarkdown,
      '---END SKILL---',
      referenceContext,
      '',
      'Discovered prompt surface snapshot (capabilities for reference):',
      '---BEGIN SURFACE SNAPSHOT---',
      JSON.stringify(surface.snapshot, null, 2),
      '---END SURFACE SNAPSHOT---',
    ].join('\n');
  }

  return [
    `Generate benchmark tasks for a ${surface.snapshot.surface} callable surface.`,
    '',
    'Return a JSON object with EXACTLY this shape and no other keys:',
    '{"tasks":[{"id":"string","prompt":"string","expected_actions":[{"name":"string","args":{"key":"value"}}]}]}',
    'Optional when a task requires a companion skill file: add "expected_reads":["exact/reference/path.md"].',
    '',
    'STRICT SCHEMA RULES - violations cause test failures:',
    '- Each task object has id, prompt, expected_actions, and may include expected_reads.',
    '- Do NOT add keys like: cli_command, instruction, action, description, expected_outcome, expected_args, source, steps, calls.',
    '- expected_actions is an ARRAY of objects, each with exactly two keys: name and args.',
    '- name is the action name string (e.g. "account create", "network list").',
    '- args is a flat object of key-value argument pairs (e.g. {"name": "my-wallet"}).',
    '- expected_reads must use exact paths from the Companion skill references section when the task requires them.',
    '',
    `Task count limit: produce at most ${clampedMax} tasks.`,
    `Seed for deterministic variety: ${config.seed}.`,
    'Variety requirement: include a mix of simple, medium, and multi-step tasks using different actions and argument combinations.',
    '',
    'Additional rules:',
    '1) Use ONLY action names that exist in the provided discovered surface snapshot.',
    '2) For each expected_actions entry, args keys MUST match discovered action argument names.',
    '3) Include required params in args when an action marks them as required.',
    '4) expected_actions must never be empty.',
    '',
    'Full SKILL.md:',
    '---BEGIN SKILL---',
    surface.skillMarkdown,
    '---END SKILL---',
    referenceContext,
    '',
    `Discovered ${surface.snapshot.surface} surface snapshot:`,
    '---BEGIN SURFACE SNAPSHOT---',
    JSON.stringify(surface.snapshot, null, 2),
    '---END SURFACE SNAPSHOT---',
  ].join('\n');
}

function buildReferenceContext(surface: DiscoveredTaskSurface): string {
  const references = surface.skillReferences ?? [];
  if (references.length === 0) return '';

  return [
    '',
    'Companion skill references available at benchmark runtime via skill_read(path):',
    'If generated tasks depend on these companion instructions, include expected_reads with the exact path.',
    ...references.flatMap((reference) => [
      `---BEGIN REFERENCE path="${reference.path}"---`,
      reference.content,
      '---END REFERENCE---',
    ]),
  ].join('\n');
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return match ? match[1].trim() : trimmed;
}

function parseGeneratedTasks(raw: string, knownCapabilityKeys?: string[]): GeneratedTask[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
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

  const validated = tasks.map((task, index) => validateTask(task, index, knownCapabilityKeys));

  // Sort by (id, prompt) before deduplication so the numeric suffix assigned to
  // colliding IDs is determined by content order, not by the LLM's output order.
  // Without this sort, swapping two same-action tasks between runs would swap their
  // suffixes (e.g. id-1 and id-2), making --task filters unstable for multi-variant cases.
  validated.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.prompt < b.prompt ? -1 : 1);

  // Deduplicate IDs: two tasks with the same action-name set get a numeric suffix.
  const seen = new Map<string, number>();
  return validated.map(task => {
    const n = seen.get(task.id) ?? 0;
    seen.set(task.id, n + 1);
    return n > 0 ? { ...task, id: `${task.id}-${n}` } : task;
  });
}

function resolveStringField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof obj[key] === 'string' && (obj[key] as string).trim() !== '') {
      return (obj[key] as string).trim();
    }
  }
  return null;
}

/**
 * Last-resort prompt recovery: pick the longest non-empty string value in the object.
 * Models routinely invent field names (name, command, task_description, …).
 * Rather than maintaining an ever-growing alias list, we grab whatever string is there.
 * Longest wins because action names tend to be short while natural-language prompts are longer.
 */
function pickLongestStringValue(obj: Record<string, unknown>): string | null {
  let best: string | null = null;
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed && (!best || trimmed.length > best.length)) {
        best = trimmed;
      }
    }
  }
  return best;
}

function validateTask(task: unknown, index: number, knownCapabilityKeys?: string[]): GeneratedTask {
  if (!task || typeof task !== 'object') {
    throw new Error(`Task at index ${index} must be an object`);
  }

  const candidate = task as Record<string, unknown>;

  // Resolve prompt — try known aliases first, then fall back to any string in the object.
  // Models frequently invent field names; we recover rather than crash.
  const taskPrompt =
    resolveStringField(candidate, 'prompt', 'user_prompt', 'description', 'instruction', 'task', 'action', 'method', 'name', 'command') ??
    pickLongestStringValue(candidate);

  // Resolve expected_actions before computing the ID so action names can anchor the ID.
  // LLM-supplied IDs are intentionally ignored — they vary across runs for the same task,
  // breaking --task filters after regeneration. For SDK/CLI/MCP surfaces, action names come
  // from the surface definition and are stable across runs. Prompt-surface tasks have no
  // actions (expected_actions is always []), so they fall back to hashing the prompt text.
  let rawExpectedActions = (
    ['expected_actions', 'actions', 'steps', 'calls', 'expected_calls', 'tool_calls', 'cli_command'] as const
  )
    .map((key) => candidate[key])
    .find((v) => Array.isArray(v)) as unknown[] | undefined;

  // Fallback: model returned a single action at task level (e.g. {action:"send", args:{...}})
  if (!rawExpectedActions) {
    const actionName =
      typeof candidate['action'] === 'string' ? candidate['action'] :
      typeof candidate['command'] === 'string' ? candidate['command'] : null;
    if (actionName && actionName.trim()) {
      rawExpectedActions = [{ name: actionName.trim(), args: candidate['args'] }];
    }
  }

  const actionNamesForId = (rawExpectedActions ?? [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map(a => (typeof a['name'] === 'string' ? a['name'].trim() : ''))
    .filter(Boolean);

  const taskId =
    actionNamesForId.length > 0 ? stableTaskId(actionNamesForId)
    : taskPrompt ? stableTaskId([taskPrompt])
    : `task-${index}`;

  if (!taskPrompt) {
    // Only reachable if the object has no string values at all.
    const received = JSON.stringify(Object.keys(candidate));
    throw new Error(`Task ${taskId} must include a non-empty string prompt (received keys: ${received})`);
  }

  if (!rawExpectedActions && knownCapabilityKeys !== undefined) {
    rawExpectedActions = [];
  }

  if (!rawExpectedActions) {
    const received = JSON.stringify(Object.keys(candidate));
    throw new Error(`Task ${taskId} must include an expected_actions array (received keys: ${received})`);
  }

  const expected_actions = rawExpectedActions.map((action, actionIndex) => validateExpectedAction(taskId, action, actionIndex));
  const expected_reads = validateExpectedReads(candidate['expected_reads'], taskId);

  // Extract capabilityId for prompt-surface tasks. The field is stored as-is here;
  // grounding validates it against the known capability keys and rejects bad values.
  const rawCapabilityId = typeof candidate['capabilityId'] === 'string' ? candidate['capabilityId'].trim() : undefined;
  const capabilityId = knownCapabilityKeys !== undefined && rawCapabilityId ? rawCapabilityId : undefined;

  return {
    id: taskId,
    prompt: taskPrompt,
    expected_actions,
    ...(expected_reads ? { expected_reads } : {}),
    ...(capabilityId !== undefined ? { capabilityId } : {}),
  };
}

function validateExpectedReads(rawReads: unknown, taskId: string): string[] | undefined {
  if (rawReads === undefined) return undefined;
  if (!Array.isArray(rawReads)) {
    throw new Error(`Task ${taskId} expected_reads must be an array when present`);
  }
  for (const [index, entry] of rawReads.entries()) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new Error(`Task ${taskId} expected_reads[${index}] must be a non-empty string`);
    }
  }
  return rawReads.map((entry) => entry.trim());
}

function validateExpectedAction(taskId: string, action: unknown, actionIndex: number): ExpectedAction {
  if (!action || typeof action !== 'object') {
    throw new Error(`Task ${taskId} expected_actions[${actionIndex}] must be an object`);
  }

  const typed = action as { name?: unknown; args?: unknown };
  const name = typeof typed.name === 'string' ? typed.name : null;
  if (!name || name.trim() === '') {
    throw new Error(`Task ${taskId} expected_actions[${actionIndex}] must include a non-empty name`);
  }

  if (typed.args !== undefined && (!typed.args || typeof typed.args !== 'object' || Array.isArray(typed.args))) {
    throw new Error(`Task ${taskId} expected_actions[${actionIndex}] args must be an object when present`);
  }

  return {
    name,
    args: typed.args as Record<string, unknown> | undefined,
  };
}

export async function generateCandidateTasksWithCoverage(
  surface: DiscoveredTaskSurface,
  config: TaskGeneratorConfig,
  deps: TaskGeneratorDeps,
  inScopeActions: ActionDefinition[],
  outOfScopeActions: ActionDefinition[] = [],
): Promise<{ tasks: GeneratedTask[]; coverage: CoverageReport }> {
  if (surface.snapshot.surface === 'prompt') {
    throw new Error('generateCandidateTasksWithCoverage must not be called for prompt surface — use generateCandidateTasks directly');
  }

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
