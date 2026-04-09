import type { FetchedSkill, TaskDefinition, SdkLanguage } from './types.js';

export type PromptSurface = 'sdk' | 'cli' | 'mcp';

export interface PromptOptions {
  surface: PromptSurface;
  agentic?: boolean;
  shell?: 'bash' | 'sh';
  sdkLanguage?: SdkLanguage;
}

const SDK_LANGUAGE_LABELS: Record<SdkLanguage, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
};

const SDK_FENCE_LABELS: Record<SdkLanguage, string> = {
  typescript: 'typescript',
  python: 'python',
  rust: 'rust',
};

/**
 * Build the system prompt with the skill documentation.
 *
 * @param skill - The fetched skill documentation (may be null if no skill configured)
 * @param sdkName - The name of the SDK/tool set from config
 * @param options - Prompt options
 */
export function buildSystemPrompt(
  skill: FetchedSkill | null,
  sdkName: string,
  options: PromptOptions,
): string {
  const guidanceSection = skill
    ? `\n\nOptional guidance context (SKILL.md):\n--- GUIDANCE ---\n${skill.content}\n--- END GUIDANCE ---`
    : '';

  if (options.surface === 'mcp') {
    return (
      `You are a helpful assistant with access to tools for ${sdkName}.\n` +
      `Use the provided tools to complete the task.\n` +
      `Output must be tool calls only. Do not include code blocks or prose explanations.\n` +
      `Never invent tool names that are not available.` +
      guidanceSection
    );
  }

  if (options.surface === 'cli') {
    const shell = options.shell ?? 'bash';
    return (
      `You are a command-line assistant for ${sdkName}.\n` +
      `Respond with exactly one fenced code block tagged ${shell}.\n` +
      `The block must contain commands only (no comments, no explanations, no surrounding prose).\n` +
      `Use only commands documented in the provided context.` +
      guidanceSection
    );
  }

  const sdkLanguage = options.sdkLanguage ?? 'typescript';
  const sdkFence = SDK_FENCE_LABELS[sdkLanguage];
  const sdkLabel = SDK_LANGUAGE_LABELS[sdkLanguage];

  return (
    `You are an expert developer using ${sdkName}.\n` +
    `Respond with exactly one fenced ${sdkFence} code block.\n` +
    `Write ${sdkLabel} code.\n` +
    `Use SDK APIs only; do not invent SDK classes or methods.\n` +
    (options.agentic
      ? `A \`web_fetch\` tool is available for additional documentation lookup when needed.\n`
      : '') +
    guidanceSection
  );
}

/**
 * Build the user prompt for a specific task.
 *
 * @param task - The task definition
 * @param options - Prompt options
 */
export function buildTaskPrompt(
  task: TaskDefinition,
  options: PromptOptions,
): string {
  if (options.surface === 'mcp') {
    return (
      `Task: ${task.prompt}\n\n` +
      `Use only tool calls to complete this task. Do not write code.`
    );
  }

  if (options.surface === 'cli') {
    const shell = options.shell ?? 'bash';
    return (
      `Task: ${task.prompt}\n\n` +
      `Return exactly one fenced ${shell} block with commands only. No prose.`
    );
  }

  const sdkLanguage = options.sdkLanguage ?? 'typescript';
  const sdkFence = SDK_FENCE_LABELS[sdkLanguage];
  const sdkLabel = SDK_LANGUAGE_LABELS[sdkLanguage];

  return (
    `Task: ${task.prompt}\n\n` +
    `Write a complete ${sdkLabel} solution in a single fenced ${sdkFence} code block. ` +
    `Use only the documented SDK APIs. ` +
    (options.agentic ? 'Use available documentation tools if needed. ' : '')
  );
}
