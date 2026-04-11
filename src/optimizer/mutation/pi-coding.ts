import type { MutationCandidate, MutationContext } from '../types.js';
import { collectGitChangedFiles } from './git-changes.js';
import { buildReportContext } from './report-context.js';
import { createCodingOrchestratorSession } from '../../runtime/pi/index.js';

export class PiCodingMutationExecutor {
  async apply(context: MutationContext): Promise<MutationCandidate> {
    const mutation = context.manifest.mutation;
    if (!mutation) {
      throw new Error('Optimize manifest must define a "mutation" section for pi-coding execution');
    }

    const { session } = await createCodingOrchestratorSession({
      cwd: context.manifest.targetRepo.path,
      modelRef: `${mutation.provider}/${mutation.model}`,
      apiKeyEnv: mutation.apiKeyEnv,
      thinkingLevel: mutation.thinkingLevel ?? 'medium',
    });

    await session.prompt(buildMutationPrompt(context));
    const changedFiles = await collectGitChangedFiles(context.manifest.targetRepo.path);
    const toolActivity = extractToolActivity(session.state.messages);
    const summary = extractLatestAssistantText(session.state.messages)
      ?? context.failureBuckets[0]?.kind
      ?? 'benchmark failures';

    return {
      summary,
      changedFiles,
      toolActivity,
    };
  }
}

function buildMutationPrompt(context: MutationContext): string {
  const allowedPaths = context.manifest.targetRepo.allowedPaths.map((path) => `- ${path}`).join('\n');
  const reportContext = buildReportContext(
    context.reportPath,
    context.manifest.mutation?.reportContextMaxBytes ?? 16_000,
  );
  const fallbackFailureSummary = context.failureBuckets.length === 0
    ? '- No failure buckets were detected; improve benchmark pass rate conservatively.'
    : context.failureBuckets
      .slice(0, 5)
      .map((bucket) => `- ${bucket.kind}: ${bucket.count} failures`)
      .join('\n');

  return [
    'Improve this repository for LLM usability based on benchmark feedback.',
    '',
    'Constraints:',
    '- The benchmark tool schema is frozen. Do not modify benchmark tool definitions, expected tool APIs, or benchmark task contracts.',
    '- Only edit files under these allowed paths:',
    allowedPaths,
    '- Do not edit files outside the allowed paths, even if they seem related.',
    '- Preserve overall product correctness.',
    '- Prefer the smallest change that improves agent usability.',
    '- If the tool names are cryptic, you may introduce a friendly alias glossary in the docs (for example, "get_ticket -> get_tkt") without changing the actual schema.',
    '- Make the docs explicit about what each parameter means and which values are allowed.',
    '',
    `Current overall pass rate: ${context.currentReport.summary.overallPassRate.toFixed(3)}`,
    reportContext
      ? 'Use the following persisted benchmark details as the primary source of truth:'
      : 'Fallback failure summary (use this only because no persisted report context is available):',
    reportContext ?? fallbackFailureSummary,
    '',
    'Make the changes directly in the repo and stop when the changes are applied.',
    'In your final response, explain in 2-4 concise bullet points:',
    '- what you changed',
    '- why it should improve model tool use',
    '- any remaining weak spots you still see',
  ].join('\n');
}

function extractLatestAssistantText(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as {
      role?: string;
      content?: Array<{ type?: string; text?: string }> | string;
    };
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

function extractToolActivity(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];

  const lines: string[] = [];
  for (const message of messages as Array<{
    role?: string;
    toolName?: string;
    content?: Array<{ type?: string; text?: string; name?: string; arguments?: Record<string, unknown> }> | string;
  }>) {
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
