import { createHash } from 'node:crypto';

import type { ExpectedAction, CoverageReport } from '../benchmark/types.js';

import type { ActionDefinition } from '../actions/types.js';
import { computeUncovered, buildRetryPrompt, computeCoverage } from './coverage.js';
import type { DiscoveredTaskSurface, GeneratedTask, TaskGeneratorConfig, TaskGeneratorDeps } from './types.js';

type SnapshotAction = DiscoveredTaskSurface['snapshot']['actions'][number];

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
    'You are an expert benchmark dataset designer for LLM tool-selection evals.',
    `Design ${surface.snapshot.surface.toUpperCase()} tasks that are realistic, discriminative, and automatically scorable.`,
    'Return strict JSON only: no markdown, no code fences, no explanatory prose.',
    'Use only action names, capability ids, and argument keys present in the supplied surface snapshot.',
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
    return buildPromptSurfacePrompt(surface, clampedMax, config.seed, referenceContext);
  }

  return buildCallableSurfacePrompt(surface, clampedMax, config.seed, referenceContext);
}

function buildCallableSurfacePrompt(
  surface: DiscoveredTaskSurface,
  clampedMax: number,
  seed: number,
  referenceContext: string,
): string {
  return [
    '<task>',
    `Generate benchmark tasks for a ${surface.snapshot.surface} callable surface.`,
    'Each task is a user-facing prompt plus the exact gold action trace that should satisfy it.',
    'The benchmark is static: generate only task data, never executable code or shell commands.',
    '</task>',
    '',
    '<context>',
    '<skill_document path="SKILL.md">',
    surface.skillMarkdown,
    '</skill_document>',
    referenceContext,
    `<surface_snapshot surface="${surface.snapshot.surface}">`,
    JSON.stringify(surface.snapshot, null, 2),
    '</surface_snapshot>',
    '</context>',
    '',
    '<objective>',
    `Produce at most ${clampedMax} tasks. Seed for deterministic variety: ${seed}.`,
    'Optimize for benchmark signal: tasks should expose whether a model can identify the right callable action and arguments from skill/docs context.',
    '</objective>',
    '',
    '<dataset_quality_bar>',
    '- Write realistic user requests, not action-name wrappers. The prompt should sound like a real user goal.',
    '- Include a balanced mix of happy path, edge/constraint, prerequisite/read-dependent, and multi-step tasks when the surface supports them.',
    '- Prefer concrete values over placeholders: names, ids, dates, paths, addresses, filters, limits, or options.',
    '- Make each task automatically scorable from expected_actions; avoid vague outcomes that require human judgment.',
    '- Cover different actions and argument combinations. Do not generate near-duplicates with only cosmetic wording changes.',
    '- Keep expected_actions minimal: include exactly the call(s) needed, in the order a correct model should perform them.',
    '- Do not ask for behavior outside the surface snapshot, external services, hidden state, or execution of generated code.',
    '</dataset_quality_bar>',
    '',
    '<surface_specific_rules>',
    ...surfaceSpecificRules(surface.snapshot.surface),
    '</surface_specific_rules>',
    '',
    '<output_schema>',
    'Return a JSON object with EXACTLY this shape and no other keys:',
    '{"tasks":[{"id":"string","prompt":"string","expected_actions":[{"name":"string","args":{"key":"value"}}]}]}',
    'Optional when a task requires a companion skill file: add "expected_reads":["exact/reference/path.md"].',
    '</output_schema>',
    '',
    '<field_rules>',
    '- Each task object has id, prompt, expected_actions, and may include expected_reads.',
    '- Do not add keys like cli_command, instruction, action, description, expected_outcome, expected_args, source, steps, or calls.',
    '- expected_actions is an array of objects. Each object has exactly name and args.',
    '- name must exactly match an action name from <surface_snapshot>. Preserve spaces, dots, dashes, underscores, and casing.',
    '- args must include every required argument from the action definition.',
    '- args keys must exactly match argument names from that action definition. Do not invent aliases.',
    '- args values should be concrete and type-appropriate. Use nested JSON only when the argument itself expects structured JSON.',
    '- expected_actions must never be empty for callable surfaces.',
    '- expected_reads may only contain exact paths listed in <companion_skill_references>. Do not use ../ paths, leading slashes, or inferred aliases.',
    '</field_rules>',
    '',
    '<good_examples>',
    buildCallableExamples(surface),
    '</good_examples>',
    '',
    '<bad_patterns_to_avoid>',
    '- A task that names an action but omits required args.',
    '- A prompt that says "call create_wallet" instead of describing the user goal.',
    '- expected_reads for a file that is not listed in <companion_skill_references>.',
    '- Extra schema keys that the loader will ignore or reject.',
    '</bad_patterns_to_avoid>',
    '',
    '<final_self_check>',
    'Before responding, silently verify every task against this checklist:',
    '- JSON parses as one object with a top-level tasks array.',
    `- tasks.length <= ${clampedMax}.`,
    '- Every action name appears exactly in <surface_snapshot>.',
    '- Every args key appears exactly under that action in <surface_snapshot>.',
    '- Every required arg is present.',
    '- Every expected_reads path, if any, appears exactly in <companion_skill_references>.',
    '- Prompts are realistic, concrete, and not near-duplicates.',
    'If any check fails, fix the JSON before returning it. Return the JSON only.',
    '</final_self_check>',
  ].join('\n');
}

function buildPromptSurfacePrompt(
  surface: DiscoveredTaskSurface,
  clampedMax: number,
  seed: number,
  referenceContext: string,
): string {
  const capKeys = surface.snapshot.actions.map((a) => a.name);

  return [
    '<task>',
    'Generate benchmark evaluation tasks for a prompt/skill document.',
    'These tasks will be evaluated by content quality against the specific capability they exercise, not by action matching.',
    '</task>',
    '',
    '<context>',
    '<skill_document path="SKILL.md">',
    surface.skillMarkdown,
    '</skill_document>',
    referenceContext,
    '<surface_snapshot surface="prompt">',
    JSON.stringify(surface.snapshot, null, 2),
    '</surface_snapshot>',
    '</context>',
    '',
    '<objective>',
    `Produce at most ${clampedMax} tasks. Seed for deterministic variety: ${seed}.`,
    'Optimize for benchmark signal: tasks should reveal whether a model follows the skill instructions for one discovered capability.',
    '</objective>',
    '',
    '<dataset_quality_bar>',
    '- Write realistic user requests that exercise the skill, not meta-prompts about the benchmark.',
    '- Include concrete inputs and success criteria the response can be judged against.',
    '- Cover different valid capabilityId values when possible. Avoid near-duplicate prompts.',
    '- Include harder cases when the skill supports them: ambiguous input, constraints, formatting requirements, or missing context that the skill explains how to handle.',
    '- Do not ask for tools, APIs, files, or actions outside the skill document and discovered capabilities.',
    '</dataset_quality_bar>',
    '',
    '<prompt_surface_rules>',
    '- expected_actions must always be [].',
    '- capabilityId must exactly match one discovered capability key.',
    `- Valid capabilityId values: ${capKeys.join(', ')}.`,
    '- Each task should primarily exercise one capabilityId so scoring is attributable.',
    '</prompt_surface_rules>',
    '',
    '<output_schema>',
    'Return a JSON object with EXACTLY this shape and no other keys:',
    '{"tasks":[{"id":"string","prompt":"string","expected_actions":[],"capabilityId":"string"}]}',
    '</output_schema>',
    '',
    '<field_rules>',
    '- Each task has exactly four keys: id, prompt, expected_actions, capabilityId.',
    '- id is a short snake_case identifier.',
    '- prompt is a realistic user request from the skill domain.',
    '- expected_actions must be an empty array [].',
    '- capabilityId must be one of the valid values above.',
    '</field_rules>',
    '',
    '<good_examples>',
    buildPromptSurfaceExamples(surface),
    '</good_examples>',
    '',
    '<final_self_check>',
    'Before responding, silently verify every task against this checklist:',
    '- JSON parses as one object with a top-level tasks array.',
    `- tasks.length <= ${clampedMax}.`,
    '- expected_actions is [] for every task.',
    '- every capabilityId appears exactly in the valid list.',
    '- prompts are concrete, realistic, and not near-duplicates.',
    'If any check fails, fix the JSON before returning it. Return the JSON only.',
    '</final_self_check>',
  ].join('\n');
}

function buildReferenceContext(surface: DiscoveredTaskSurface): string {
  const references = surface.skillReferences ?? [];
  if (references.length === 0) {
    return [
      '<companion_skill_references>',
      'No companion skill references are configured for this benchmark.',
      '</companion_skill_references>',
    ].join('\n');
  }

  return [
    '<companion_skill_references>',
    'Companion skill references available at benchmark runtime via skill_read(path):',
    'If generated tasks depend on these companion instructions, include expected_reads with the exact path.',
    'Only these exact paths are valid. Do not infer relative aliases, parent-directory paths, or leading-slash paths.',
    ...references.flatMap((reference) => [
      `---BEGIN REFERENCE path="${reference.path}"---`,
      reference.content,
      '---END REFERENCE---',
    ]),
    '</companion_skill_references>',
  ].join('\n');
}

function surfaceSpecificRules(surface: DiscoveredTaskSurface['snapshot']['surface']): string[] {
  if (surface === 'cli') {
    return [
      '- expected_actions.name is the canonical command path from the snapshot, not the full shell command string.',
      '- args keys are canonical option or positional names from the snapshot. Include required flags/options as args.',
      '- User prompts may mention desired flags or output formats naturally, but do not invent unsupported flags.',
    ];
  }

  if (surface === 'sdk') {
    return [
      '- expected_actions.name is the SDK method/function name from the snapshot.',
      '- args keys are method parameter names from the snapshot.',
      '- User prompts should describe developer intent, not paste implementation code unless the skill is code-oriented.',
    ];
  }

  if (surface === 'mcp') {
    return [
      '- expected_actions.name is the MCP tool name from the snapshot.',
      '- args keys are tool input fields from the snapshot.',
      '- User prompts should describe the external task the tool performs, not mention internal benchmark mechanics.',
    ];
  }

  return [];
}

function buildCallableExamples(surface: DiscoveredTaskSurface): string {
  const first = surface.snapshot.actions[0];
  if (!first) return '{"tasks":[]}';

  const tasks: Array<Record<string, unknown>> = [
    {
      id: 'example_single_action',
      prompt: `${describeAction(first)} using concrete user-provided values.`,
      expected_actions: [buildExampleAction(first)],
    },
  ];

  const second = surface.snapshot.actions.find((action) => action.name !== first.name);
  if (second) {
    tasks.push({
      id: 'example_multi_step',
      prompt: `${describeAction(first)}, then ${describeAction(second)} for the same user request.`,
      expected_actions: [buildExampleAction(first), buildExampleAction(second)],
    });
  }

  const firstReference = surface.skillReferences?.[0]?.path;
  if (firstReference) {
    tasks.push({
      id: 'example_reference_required',
      prompt: `${describeAction(first)} after applying the companion instructions from ${firstReference}.`,
      expected_reads: [firstReference],
      expected_actions: [buildExampleAction(first)],
    });
  }

  return JSON.stringify({ tasks }, null, 2);
}

function buildPromptSurfaceExamples(surface: DiscoveredTaskSurface): string {
  const first = surface.snapshot.actions[0];
  const second = surface.snapshot.actions.find((action) => action.name !== first?.name);
  const tasks = [
    {
      id: 'example_prompt_capability',
      prompt: first ? `${describeAction(first)} for the concrete input supplied by the user.` : 'Perform one concrete skill capability for the user input.',
      expected_actions: [],
      capabilityId: first?.name ?? 'capability_id_from_snapshot',
    },
  ];

  if (second) {
    tasks.push({
      id: 'example_second_capability',
      prompt: `${describeAction(second)} with explicit formatting constraints.`,
      expected_actions: [],
      capabilityId: second.name,
    });
  }

  return JSON.stringify({ tasks }, null, 2);
}

function buildExampleAction(action: SnapshotAction): { name: string; args: Record<string, unknown> } {
  const required = action.args.filter((arg) => arg.required);
  const selectedArgs = required.length > 0 ? required : action.args.slice(0, 1);
  return {
    name: action.name,
    args: Object.fromEntries(selectedArgs.map((arg) => [arg.name, sampleValueForArg(arg)])),
  };
}

function sampleValueForArg(arg: SnapshotAction['args'][number]): unknown {
  const name = arg.name.toLowerCase();
  const schemaType = typeof arg.schema?.type === 'string' ? arg.schema.type : undefined;
  const type = (arg.type ?? schemaType ?? '').toLowerCase();

  if (type === 'number' || type === 'integer') return 5;
  if (type === 'boolean') return true;
  if (type === 'array') return [`sample-${arg.name}`];
  if (type === 'object') return { value: `sample-${arg.name}` };
  if (name.includes('email')) return 'user@example.com';
  if (name === 'id' || name.endsWith('id') || name.includes('_id') || name.includes('-id')) return `${arg.name}-123`;
  if (name.includes('address')) return '0x123';
  if (name.includes('limit') || name.includes('page') || name.includes('count')) return 5;
  return `sample-${arg.name}`;
}

function describeAction(action: SnapshotAction): string {
  const description = action.description?.trim().replace(/[.\s]+$/, '');
  if (description) return description;
  return action.name.replace(/[_.:-]+/g, ' ');
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
