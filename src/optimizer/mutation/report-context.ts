import { existsSync, readFileSync } from 'node:fs';

import type { BenchmarkReport, ExpectedAction, ExtractedCall, TaskResult } from '../../benchmark/types.js';
import { getExpectedActions, getExpectedActionName } from '../../benchmark/types.js';

const TRUNCATION_SUFFIX = '\n... (truncated)';

export function buildReportContext(reportPath?: string | null, maxBytes = 12_000): string | null {
  if (!reportPath || !existsSync(reportPath)) {
    return null;
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as BenchmarkReport;
  const failingResults = report.results.filter((result) => !result.metrics.taskPassed);
  if (failingResults.length === 0) {
    return null;
  }

  const byTask = new Map<string, { prompt: string; expected: ExpectedAction[]; failing: TaskResult[] }>();
  for (const result of failingResults) {
    const existing = byTask.get(result.task.id);
    if (existing) {
      existing.failing.push(result);
      continue;
    }

    byTask.set(result.task.id, {
      prompt: result.task.prompt,
      expected: getExpectedActions(result.task),
      failing: [result],
    });
  }

  const lines: string[] = [];
  lines.push('### Persisted benchmark failures (failing tasks only)');

  for (const [taskId, taskInfo] of byTask) {
    lines.push(`- Task: ${taskId}`);
    lines.push(`  - Prompt: ${taskInfo.prompt}`);
    lines.push('  - Expected actions:');
    for (const expectedTool of taskInfo.expected) {
      lines.push(`    - ${formatExpectedTool(expectedTool)}`);
    }

    lines.push('  - Failing models:');
    for (const failingResult of taskInfo.failing) {
      const modelLabel = `${failingResult.model.name} (${failingResult.model.id})`;
      lines.push(`    - ${modelLabel}`);
      lines.push('      - Observed/extracted actions:');

      if (failingResult.extractedCalls.length === 0) {
        lines.push('        - (none extracted)');
      } else {
        for (const call of failingResult.extractedCalls) {
          lines.push(`        - ${formatExtractedCall(call)}`);
        }
      }

      if (failingResult.error) {
        lines.push(`      - Error: ${failingResult.error}`);
      }
    }
  }

  return truncateByBytes(lines.join('\n'), maxBytes);
}

function formatExpectedTool(tool: ExpectedAction): string {
  if (tool.args === undefined) {
    return `${getExpectedActionName(tool)}`;
  }

  return `${getExpectedActionName(tool)} ${toInlineJson(tool.args)}`;
}

function formatExtractedCall(call: ExtractedCall): string {
  return `${call.method} ${toInlineJson(call.args)}`;
}

function toInlineJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function truncateByBytes(content: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return TRUNCATION_SUFFIX.trimStart();
  }

  if (Buffer.byteLength(content, 'utf-8') <= maxBytes) {
    return content;
  }

  const suffixBytes = Buffer.byteLength(TRUNCATION_SUFFIX, 'utf-8');
  if (maxBytes <= suffixBytes) {
    return Buffer.from(TRUNCATION_SUFFIX, 'utf-8').subarray(0, maxBytes).toString('utf-8');
  }

  const contentBytes = Buffer.from(content, 'utf-8');
  const truncated = contentBytes.subarray(0, maxBytes - suffixBytes).toString('utf-8');
  return `${truncated}${TRUNCATION_SUFFIX}`;
}
