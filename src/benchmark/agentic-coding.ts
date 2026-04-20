/**
 * Agentic-coding benchmark path.
 *
 * The default `prompt` surface evaluates a skill by making a single chat
 * completion against the LLM with the skill as system prompt. For skills that
 * direct the model to use real tools (Read, Bash, Grep, Edit), the single-shot
 * path cannot give the model tool access — the model hallucinates `<tool_call>`
 * blocks and the evaluator grades fabricated output.
 *
 * Setting `benchmark.agentic.coding.enabled` routes each task through a coding
 * orchestrator session (the same one the optimizer already uses for mutations)
 * so the model can actually read the fixture repo, run Bash, grep files, etc.
 * The final assistant message is returned and graded by the existing prompt
 * evaluator. No new providers or evaluators are introduced.
 *
 * The session factory is accepted as an injected dependency so tests can
 * exercise the dispatch, prompt building, and response extraction without
 * making real LLM calls.
 */

import type { PiAuthMode } from '../runtime/pi/auth.js';

export interface AgenticCodingConfig {
  /**
   * Opt-in flag. When true, prompt-surface benchmarks are routed through a
   * coding orchestrator with real tool access. Off by default so existing
   * skills that don't need tools are unaffected.
   */
  enabled: boolean;
  /**
   * Working directory the orchestrator agent can read. All tool access
   * (Read, Bash, Grep, Glob) is scoped here. Must be an absolute path.
   */
  cwd: string;
  /**
   * Thinking level for the orchestrator. Maps to pi-coding-agent thinking
   * levels. Defaults to `medium`.
   */
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface NormalizedAgenticCodingConfig {
  cwd: string;
  thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface CodingSessionMessage {
  role?: string;
  toolName?: string;
  content?: Array<{
    type?: string;
    text?: string;
    name?: string;
    arguments?: Record<string, unknown>;
  }> | string;
}

export interface CodingSession {
  prompt(input: string): Promise<void>;
  state: { messages: CodingSessionMessage[] | unknown[] };
}

export interface CreateSessionOptions {
  cwd: string;
  modelRef: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  thinkingLevel?: NormalizedAgenticCodingConfig['thinkingLevel'];
}

export interface AgenticCodingDeps {
  createSession: (opts: CreateSessionOptions) => Promise<{ session: CodingSession }>;
}

export interface RunAgenticCodingTaskOptions {
  cwd: string;
  modelRef: string;
  systemPrompt: string;
  taskPrompt: string;
  thinkingLevel?: NormalizedAgenticCodingConfig['thinkingLevel'];
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
}

export interface AgenticCodingTaskResult {
  content: string;
  toolActivity: string[];
}

/**
 * Validate and normalise an `AgenticCodingConfig`. Returns `null` when disabled,
 * a resolved config when valid, and throws with an actionable message when
 * required fields are missing.
 */
export function normalizeAgenticCodingConfig(
  config: AgenticCodingConfig | undefined,
): NormalizedAgenticCodingConfig | null {
  if (!config || !config.enabled) return null;
  if (!config.cwd || typeof config.cwd !== 'string') {
    throw new Error(
      'benchmark.agentic.coding.enabled is true but cwd is missing. ' +
      'Set benchmark.agentic.coding.cwd to an absolute path the agent may read (e.g. a fixture repo).',
    );
  }
  return {
    cwd: config.cwd,
    thinkingLevel: config.thinkingLevel ?? 'medium',
  };
}

/**
 * Run a single benchmark task through a coding orchestrator session.
 *
 * Injects the session factory so tests can run without a real LLM. Production
 * callers pass a wrapper around `createCodingOrchestratorSession` from
 * `src/runtime/pi/index.ts`.
 */
export async function runAgenticCodingTask(
  deps: AgenticCodingDeps,
  opts: RunAgenticCodingTaskOptions,
): Promise<AgenticCodingTaskResult> {
  const { session } = await deps.createSession({
    cwd: opts.cwd,
    modelRef: opts.modelRef,
    authMode: opts.authMode,
    apiKeyEnv: opts.apiKeyEnv,
    thinkingLevel: opts.thinkingLevel,
  });

  await session.prompt(buildCombinedPrompt(opts.systemPrompt, opts.taskPrompt));

  const messages = session.state.messages as CodingSessionMessage[];
  const content = extractLatestAssistantText(messages);
  const toolActivity = extractToolActivity(messages);

  if (!content && toolActivity.length === 0) {
    throw new Error(
      `Agentic coding session for model "${opts.modelRef}" produced no output ` +
      `(no tool calls, no assistant text). The model may be too weak, or the API ` +
      `call failed silently. Try a more capable model such as ` +
      `anthropic/claude-sonnet-4-6 or openrouter/anthropic/claude-sonnet-4.6.`,
    );
  }

  return { content: content ?? '', toolActivity };
}

function buildCombinedPrompt(systemPrompt: string, taskPrompt: string): string {
  // The orchestrator's `session.prompt` accepts a single user message. We
  // prepend the skill as a `system:` block so the model sees both the skill
  // guidance and the benchmark task without relying on a separate system-prompt
  // channel (which pi-coding-agent handles internally per provider).
  return `${systemPrompt.trim()}\n\n---\n\n${taskPrompt.trim()}`;
}

function extractLatestAssistantText(messages: CodingSessionMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    if (typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim();
    }
    if (Array.isArray(message.content)) {
      const text = message.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text!.trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      if (text) return text;
    }
  }
  return null;
}

function extractToolActivity(messages: CodingSessionMessage[]): string[] {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block?.type !== 'toolCall' || typeof block.name !== 'string') continue;
        const args = block.arguments && Object.keys(block.arguments).length > 0
          ? ` ${JSON.stringify(block.arguments)}`
          : '';
        lines.push(`tool call: ${block.name}${args}`);
      }
      continue;
    }
    if (message.role === 'toolResult' && Array.isArray(message.content)) {
      const text = message.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text!.trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) {
        lines.push(`tool result (${message.toolName ?? 'tool'}): ${text}`);
      }
    }
  }
  return lines;
}
