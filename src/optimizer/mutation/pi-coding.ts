import { readFileSync, statSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import type { MutationCandidate, MutationContext } from '../types.js';
import { collectGitChangedFiles } from './git-changes.js';
import { buildMutationContext } from '../feedback/mutation-context.js';
import { createCodingOrchestratorSession } from '../../runtime/pi/index.js';
import { SKILL_WRITING_GUIDE } from './skill-writing-guide.js';

export class PiCodingMutationExecutor {
  async apply(context: MutationContext): Promise<MutationCandidate> {
    const mutation = context.manifest.mutation;
    if (!mutation) {
      throw new Error('Optimize manifest must define a "mutation" section for pi-coding execution');
    }

    // When localSkillPath is provided, the skill file is a local versioned copy
    // outside the target repo. Set cwd to the skill file's directory so the agent
    // operates in isolation — it can't see or accidentally edit the target repo,
    // and the file it needs to edit is right in its working directory.
    const agentCwd = context.localSkillPath
      ? dirname(context.localSkillPath)
      : context.manifest.targetRepo.path;

    console.log(`[mutation] cwd: ${agentCwd}`);
    if (context.localSkillPath) {
      console.log(`[mutation] skill file: ${basename(context.localSkillPath)}`);
      try {
        const before = statSync(context.localSkillPath);
        console.log(`[mutation] skill file size before: ${before.size} bytes`);
      } catch {
        console.log('[mutation] skill file not found before mutation');
      }
    }

    const { session } = await createCodingOrchestratorSession({
      cwd: agentCwd,
      modelRef: `${mutation.provider}/${mutation.model}`,
      apiKeyEnv: mutation.apiKeyEnv,
      thinkingLevel: mutation.thinkingLevel ?? 'medium',
    });

    await session.prompt(buildMutationPrompt(context));

    const messages = session.state.messages as unknown[];
    const toolActivity = extractToolActivity(messages);
    console.log(`[mutation] session messages: ${messages.length}, tool calls: ${toolActivity.length}`);
    if (toolActivity.length === 0) {
      console.log('[mutation] WARNING: agent made no tool calls — skill file was not modified');
    }

    if (context.localSkillPath) {
      try {
        const after = statSync(context.localSkillPath);
        console.log(`[mutation] skill file size after: ${after.size} bytes`);
      } catch {
        console.log('[mutation] skill file missing after mutation');
      }
    }

    // If we wrote to a local skill file, return it directly — no git detection needed.
    // Otherwise fall back to git status for target-repo mutations.
    const changedFiles = context.localSkillPath
      ? [context.localSkillPath]
      : await collectGitChangedFiles(context.manifest.targetRepo.path);
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
  // If we have a local skill path, that's the only file the agent should edit.
  // The path is absolute so the agent can find it regardless of cwd.
  const allowedPaths = context.localSkillPath
    ? `- ${basename(context.localSkillPath)}  (in current working directory)`
    : context.manifest.targetRepo.allowedPaths.map((p) => `- ${p}`).join('\n');
  const feedbackCtx = buildMutationContext(
    context.currentReport,
    context.manifest.mutation?.reportContextMaxBytes ?? 16_000,
  );
  const reportContext = feedbackCtx.serialized || null;
  const fallbackFailureSummary = context.failureBuckets.length === 0
    ? '- No failure buckets were detected; improve benchmark pass rate conservatively.'
    : context.failureBuckets
      .slice(0, 5)
      .map((bucket) => `- ${bucket.kind}: ${bucket.count} failures`)
      .join('\n');

  const skillWritingSection = context.localSkillPath
    ? [
        '',
        SKILL_WRITING_GUIDE,
        '',
      ].join('\n')
    : '';

  const skillFileName = context.localSkillPath ? basename(context.localSkillPath) : null;
  const skillPreamble = skillFileName
    ? [
        `Improve the skill documentation file: ${skillFileName}`,
        '(This file is in your current working directory.)',
        '',
        'IMPORTANT: Read the file first, then make surgical edits.',
        '- Do NOT rewrite or replace the file — patch only the sections that are weak or missing.',
        '- Preserve every command/action that is already documented and passing.',
        '- The skill must continue to cover ALL commands in the surface, not just the failing ones.',
        '- Add or expand only the sections that address the benchmark failures below.',
      ].join('\n')
    : 'Improve this repository for LLM usability based on benchmark feedback.';

  return [
    skillPreamble,
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
    skillWritingSection,
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
