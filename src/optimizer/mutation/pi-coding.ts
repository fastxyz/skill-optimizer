import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, basename, relative } from 'node:path';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
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

    const localSkillBundle = getLocalSkillBundleEntries(context);
    const localSkillBundlePaths = localSkillBundle.map((file) => file.absolutePath);
    // Snapshot the local skill bundle before mutation so we can detect no-ops and
    // report which bundle files actually changed.
    const beforeHashes = context.localSkillPath ? hashFiles(localSkillBundlePaths) : null;

    const { session } = await createCodingOrchestratorSession({
      cwd: agentCwd,
      modelRef: `${mutation.provider}/${mutation.model}`,
      authMode: mutation.authMode,
      apiKeyEnv: mutation.apiKeyEnv,
      thinkingLevel: mutation.thinkingLevel ?? 'medium',
    });

    await session.prompt(buildMutationPrompt(context));

    const messages = session.state.messages;
    const toolActivity = extractToolActivity(messages);
    const assistantText = extractLatestAssistantText(messages);

    // If the orchestrator produced no text and no tool calls the model failed to act.
    // This usually means the optimizer model is too weak or the API call silently failed.
    // Throw rather than silently producing an identical skill file and wasting a benchmark run.
    if (!assistantText && toolActivity.length === 0) {
      const modelRef = `${mutation.provider}/${mutation.model}`;
      throw new Error(
        `Orchestrator model "${modelRef}" produced no output (no tool calls, no text response). ` +
        `The model may be too weak for coding-orchestrator tasks or the API call failed silently. ` +
        `Try a more capable model such as openrouter/anthropic/claude-sonnet-4.6.`,
      );
    }

    // Warn when the agent responded with text but never called a tool to modify the file.
    if (context.localSkillPath && toolActivity.length === 0) {
      console.warn('[mutation] WARNING: orchestrator produced text but made no tool calls — skill file unchanged');
    }

    // Detect no-op: agent ran but the file content did not change.
    const afterHashes = context.localSkillPath ? hashFiles(localSkillBundlePaths) : null;
    if (beforeHashes !== null && afterHashes !== null && hashesEqual(beforeHashes, afterHashes)) {
      console.warn('[mutation] WARNING: local skill bundle content is identical before and after mutation');
    }

    // Local skill bundle: report only files whose contents actually changed.
    // Keep the editable bundle separately for logs/iteration metadata.
    const changedFiles = context.localSkillPath
      ? diffHashedFiles(beforeHashes, afterHashes)
      : await collectGitChangedFiles(context.manifest.targetRepo.path);
    const summary = assistantText
      ?? context.failureBuckets[0]?.kind
      ?? 'benchmark failures';

    return {
      summary,
      changedFiles,
      ...(context.localSkillPath ? { editableFiles: localSkillBundlePaths } : {}),
      toolActivity,
    };
  }
}

function buildMutationPrompt(context: MutationContext): string {
  const localSkillBundle = getLocalSkillBundleEntries(context);
  const allowedPaths = context.localSkillPath
    ? localSkillBundle.map((file) => `- ${file.displayPath} (${file.role})`).join('\n')
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

  const skillPreamble = context.localSkillPath
    ? [
        '<task>',
        'Improve the local skill documentation bundle for benchmark performance.',
        'The bundle may include a primary skill file and companion reference files that compose the skill.',
        'Benchmark models will read these same local files after your edits.',
        '</task>',
        '',
        '<editable_files>',
        ...localSkillBundle.map((file) => `- ${file.displayPath}: ${file.role}`),
        '</editable_files>',
      ].join('\n')
    : 'Improve this repository for LLM usability based on benchmark feedback.';

  return [
    skillPreamble,
    '',
    '<constraints>',
    '- The benchmark tool schema is frozen. Do not modify benchmark tool definitions, expected tool APIs, or benchmark task contracts.',
    '- Only edit files under these allowed paths:',
    allowedPaths,
    '- Do not edit files outside the allowed paths, even if they seem related.',
    '- Preserve overall product correctness.',
    '- Prefer the smallest change that improves agent usability.',
    '- If the tool names are cryptic, you may introduce a friendly alias glossary in the docs (for example, "get_ticket -> get_tkt") without changing the actual schema.',
    '- Make the docs explicit about what each parameter means and which values are allowed.',
    '- Read the relevant editable file(s) first, then make surgical edits. Do not rewrite or replace whole files.',
    '- Preserve every command/action that is already documented and passing.',
    '- The skill bundle must continue to cover ALL commands in the surface, not just the failing ones.',
    '</constraints>',
    '',
    '<file_selection_guidance>',
    '- Put product- or surface-specific guidance in the primary skill file.',
    '- Put shared conventions, auth, global flags, output formatting, quoting, and cross-surface parameter patterns in companion reference files when they exist.',
    '- If a failure comes from a shared rule used by multiple skills, edit the companion reference instead of duplicating that rule in the primary skill.',
    '- If a failure is specific to one resource, method, command, or API concept, edit the primary skill near that topic.',
    '- Avoid duplicating the same guidance in multiple files unless the benchmark evidence shows the model misses the companion reference.',
    '- If you mention a companion skill file in markdown, prefer the exact logical path shown above so prompts, tasks, and reads stay consistent.',
    '</file_selection_guidance>',
    '',
    '<benchmark_context>',
    `Current overall pass rate: ${context.currentReport.summary.overallPassRate.toFixed(3)}`,
    reportContext
      ? 'Use the following persisted benchmark details as the primary source of truth:'
      : 'Fallback failure summary (use this only because no persisted report context is available):',
    reportContext ?? fallbackFailureSummary,
    '</benchmark_context>',
    '',
    skillWritingSection,
    '<final_self_check>',
    'Before finishing, verify:',
    '- Edited the most appropriate file(s) in the allowed skill bundle.',
    '- Did not modify target repo source files, benchmark tasks, or tool schemas.',
    '- Added concrete, reusable guidance rather than overfitting to one task wording.',
    '- Avoided conflicting or duplicated instructions across primary and companion files.',
    '</final_self_check>',
    'Make the changes directly in the repo and stop when the changes are applied.',
    'In your final response, explain in 2-4 concise bullet points:',
    '- what you changed',
    '- why it should improve model tool use',
    '- any remaining weak spots you still see',
  ].join('\n');
}

function getLocalSkillBundleEntries(context: MutationContext): Array<{
  absolutePath: string;
  displayPath: string;
  role: string;
}> {
  if (!context.localSkillPath) return [];
  const root = dirname(context.localSkillPath);
  return [
    {
      absolutePath: context.localSkillPath,
      displayPath: basename(context.localSkillPath),
      role: 'primary skill file',
    },
    ...(context.localSkillReferences ?? []).map((reference) => ({
      absolutePath: reference.localPath,
      displayPath: relative(root, reference.localPath),
      role: `companion reference exposed to benchmark models as skill_read("${reference.promptPath}")`,
    })),
  ];
}

function extractLatestAssistantText(messages: AgentMessage[]): string | null {
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

function extractToolActivity(messages: AgentMessage[]): string[] {
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

function hashFiles(files: string[]): Map<string, string> | null {
  const hashes = new Map<string, string>();

  try {
    for (const file of files) {
      hashes.set(file, createHash('sha256').update(readFileSync(file)).digest('hex'));
    }
    return hashes;
  } catch {
    return null;
  }
}

function hashesEqual(before: Map<string, string>, after: Map<string, string>): boolean {
  if (before.size !== after.size) return false;
  for (const [file, hash] of before) {
    if (after.get(file) !== hash) return false;
  }
  return true;
}

function diffHashedFiles(before: Map<string, string> | null, after: Map<string, string> | null): string[] {
  if (!before || !after) return [];
  const changed: string[] = [];
  for (const [file, hash] of after) {
    if (before.get(file) !== hash) changed.push(file);
  }
  return changed;
}
