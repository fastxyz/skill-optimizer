import type {
  WorkbenchMetrics,
  WorkbenchResult,
  WorkbenchTrace,
  WorkbenchTraceEntry,
  WorkbenchTrialSummaryFile,
} from './types.js';

function emptyMetrics(): WorkbenchMetrics {
  return {
    durationMs: 0,
    turns: 0,
    toolCalls: 0,
    toolResults: 0,
    bashCalls: 0,
    readCalls: 0,
    writeCalls: 0,
    editCalls: 0,
    tokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

export function buildWorkbenchMetrics(trace: WorkbenchTrace): WorkbenchMetrics {
  const metrics = emptyMetrics();
  const started = Date.parse(trace.startedAt);
  const ended = Date.parse(trace.endedAt);
  metrics.durationMs = Number.isFinite(started) && Number.isFinite(ended)
    ? Math.max(0, ended - started)
    : 0;

  for (const entry of trace.entries) {
    if (entry.type === 'message') {
      metrics.turns += 1;
      if (typeof entry.stopReason === 'string') {
        metrics.stopReason = entry.stopReason;
      }
      addUsage(metrics, entry.usage);
      continue;
    }

    if (entry.type === 'tool_result') {
      metrics.toolResults += 1;
      continue;
    }

    metrics.toolCalls += 1;
    if (entry.name === 'bash') metrics.bashCalls += 1;
    if (entry.name === 'read') metrics.readCalls += 1;
    if (entry.name === 'write') metrics.writeCalls += 1;
    if (entry.name === 'edit') metrics.editCalls += 1;
  }

  return metrics;
}

export function buildTrialSummary(params: {
  trace: WorkbenchTrace;
  result: WorkbenchResult;
}): WorkbenchTrialSummaryFile {
  const failedGraders = params.result.graders
    ?.filter((grader) => !grader.pass)
    .map((grader) => grader.name) ?? [];
  const metrics = params.result.metrics ?? buildWorkbenchMetrics(params.trace);
  const terminalMessage = [...params.trace.entries]
    .reverse()
    .find((entry): entry is Extract<WorkbenchTraceEntry, { type: 'message' }> => entry.type === 'message' && entry.role === 'assistant');

  return {
    finalAssistantMessage: terminalMessage?.text,
    failedGraders,
    evidence: [...params.result.evidence],
    bashCommands: extractBashCommands(params.trace),
    stopReason: typeof terminalMessage?.stopReason === 'string' ? terminalMessage.stopReason : undefined,
    errorMessage: terminalMessage?.errorMessage,
    metrics,
  };
}

function extractBashCommands(trace: WorkbenchTrace): string[] {
  return trace.entries.flatMap((entry) => {
    if (entry.type !== 'tool_call' || entry.name !== 'bash') {
      return [];
    }

    const args = entry.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return [];
    }

    const command = (args as Record<string, unknown>).command;
    return typeof command === 'string' ? [command] : [];
  });
}

function addUsage(metrics: WorkbenchMetrics, usage: unknown): void {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return;
  }

  const record = usage as Record<string, unknown>;
  metrics.tokens.input += readNumber(record.input);
  metrics.tokens.output += readNumber(record.output);
  metrics.tokens.cacheRead += readNumber(record.cacheRead);
  metrics.tokens.cacheWrite += readNumber(record.cacheWrite);
  metrics.tokens.total += readNumber(record.totalTokens);

  const cost = record.cost;
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) {
    return;
  }

  const costRecord = cost as Record<string, unknown>;
  metrics.cost.input += readNumber(costRecord.input);
  metrics.cost.output += readNumber(costRecord.output);
  metrics.cost.cacheRead += readNumber(costRecord.cacheRead);
  metrics.cost.cacheWrite += readNumber(costRecord.cacheWrite);
  metrics.cost.total += readNumber(costRecord.total);
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
