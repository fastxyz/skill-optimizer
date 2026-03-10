import type { FetchedSkill, TaskDefinition } from './types.js';

export type PromptMode = 'code' | 'mcp';
export type CodeStyle = 'sdk';

export interface PromptOptions {
  mode: PromptMode;
  style?: CodeStyle; // only used when mode === 'code'
}

/**
 * Build the system prompt with the skill documentation.
 *
 * @param skill - The fetched skill documentation (may be null if no skill configured)
 * @param sdkName - The name of the SDK/tool set from config
 * @param styleOrOptions - Either a CodeStyle string (backward compat) or a PromptOptions object
 */
export function buildSystemPrompt(
  skill: FetchedSkill | null,
  sdkName: string,
  styleOrOptions: CodeStyle | PromptOptions = 'sdk',
): string {
  const opts: PromptOptions =
    typeof styleOrOptions === 'string'
      ? { mode: 'code', style: styleOrOptions }
      : styleOrOptions;

  // ── MCP mode ──────────────────────────────────────────────────────────
  if (opts.mode === 'mcp') {
    const skillSection = skill
      ? `\n\nIf the documentation below provides additional context about parameters, refer to it:\n\n--- DOCUMENTATION ---\n${skill.content}\n--- END DOCUMENTATION ---`
      : '';

    return (
      `You are a helpful assistant with access to tools. The user will ask you to accomplish tasks using ${sdkName}.\n` +
      `Use the provided tools to accomplish each task. Call the appropriate tool(s) with the correct arguments.\n` +
      `Do NOT write code. Do NOT invent tools that are not provided. Only use the tools available to you.\n` +
      `If multiple steps are needed, call multiple tools in sequence.` +
      skillSection
    );
  }

  // ── Code mode (sdk) ───────────────────────────────────────────────────
  const style = opts.style ?? 'sdk';

  if (!skill) {
    return `You are a helpful coding assistant. Write clean, working code.`;
  }

  let formatInstruction: string;
  switch (style) {
    case 'sdk':
    default:
      formatInstruction =
        `Respond with a single TypeScript code block.\n` +
        `Use only the SDK methods from the documentation. Do not invent methods or APIs.`;
      break;
  }

  return (
    `You are an expert developer. The user will ask you to accomplish tasks using ${sdkName}.\n` +
    `Use ONLY the documentation below.\n` +
    `${formatInstruction}\n\n` +
    `--- DOCUMENTATION ---\n${skill.content}\n--- END DOCUMENTATION ---`
  );
}

/**
 * Build the user prompt for a specific task.
 *
 * @param task - The task definition
 * @param styleOrOptions - Either a CodeStyle string (backward compat) or a PromptOptions object
 */
export function buildTaskPrompt(
  task: TaskDefinition,
  styleOrOptions: CodeStyle | PromptOptions = 'sdk',
): string {
  const opts: PromptOptions =
    typeof styleOrOptions === 'string'
      ? { mode: 'code', style: styleOrOptions }
      : styleOrOptions;

  // ── MCP mode ──────────────────────────────────────────────────────────
  if (opts.mode === 'mcp') {
    return (
      `Task: ${task.prompt}\n\n` +
      `Use the provided tools to accomplish this task. Call the correct tool(s) with the appropriate arguments. ` +
      `Do not write code — only make tool calls.`
    );
  }

  // ── Code mode (sdk) ───────────────────────────────────────────────────
  const style = opts.style ?? 'sdk';

  let outputInstruction: string;
  switch (style) {
    case 'sdk':
    default:
      outputInstruction =
        `Write a complete, runnable TypeScript script that accomplishes this task. ` +
        `Use only the SDK/API from the documentation provided. ` +
        `Include all necessary imports and wrap in an async main function if needed.`;
      break;
  }

  return `Task: ${task.prompt}\n\n${outputInstruction}`;
}
