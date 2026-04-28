import type { WorkbenchTrace, WorkbenchTraceEntry } from './types.js';
import { isRecord } from './utils.js';

export function createTraceCollector(): { record(event: unknown): void; events: unknown[] } {
  const events: unknown[] = [];
  return {
    events,
    record(event: unknown) {
      events.push(event);
    },
  };
}

export function buildWorkbenchTrace(params: {
  caseName: string;
  model: string;
  startedAt: string;
  endedAt: string;
  messages: unknown[];
}): WorkbenchTrace {
  return {
    caseName: params.caseName,
    model: params.model,
    startedAt: params.startedAt,
    endedAt: params.endedAt,
    entries: normalizeMessages(params.messages),
  };
}

function normalizeMessages(messages: unknown[]): WorkbenchTraceEntry[] {
  const entries: WorkbenchTraceEntry[] = [];

  for (const message of messages) {
    if (!isRecord(message)) {
      continue;
    }

    const role = typeof message.role === 'string' ? message.role : 'unknown';
    const timestamp = message.timestamp;

    if (role === 'toolResult') {
      entries.push({
        type: 'tool_result',
        id: typeof message.toolCallId === 'string' ? message.toolCallId : undefined,
        name: typeof message.toolName === 'string' ? message.toolName : undefined,
        text: extractText(message.content),
        isError: typeof message.isError === 'boolean' ? message.isError : undefined,
        timestamp,
      });
      continue;
    }

    const content = Array.isArray(message.content) ? message.content : [];
    const text = extractContentByType(content, 'text', 'text');
    const thinking = extractContentByType(content, 'thinking', 'thinking');

    const hasTerminalMetadata = typeof message.stopReason === 'string' || typeof message.errorMessage === 'string';
    if (text.length > 0 || thinking.length > 0 || role !== 'assistant' || hasTerminalMetadata) {
      entries.push({
        type: 'message',
        role,
        text: text.length > 0 ? text : undefined,
        thinking: thinking.length > 0 ? thinking : undefined,
        timestamp,
        usage: message.usage,
        stopReason: message.stopReason,
        errorMessage: typeof message.errorMessage === 'string' ? message.errorMessage : undefined,
      });
    }

    for (const item of content) {
      if (!isRecord(item) || item.type !== 'toolCall') {
        continue;
      }

      entries.push({
        type: 'tool_call',
        id: typeof item.id === 'string' ? item.id : undefined,
        name: typeof item.name === 'string' ? item.name : 'unknown',
        arguments: item.arguments,
        timestamp,
      });
    }
  }

  return entries;
}

function extractContentByType(content: unknown[], type: string, field: string): string {
  return content
    .map((item) => {
      if (!isRecord(item) || item.type !== type) {
        return '';
      }
      const value = item[field];
      return typeof value === 'string' ? value : '';
    })
    .filter((value) => value.length > 0)
    .join('\n');
}

function extractText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = extractContentByType(content, 'text', 'text');
  return text.length > 0 ? text : undefined;
}
