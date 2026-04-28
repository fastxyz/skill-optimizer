import type { WorkbenchTrace, WorkbenchTraceEntry, WorkbenchTraceEvent } from './types.js';
import { isRecord } from './utils.js';

export interface TraceRecorder {
  events: WorkbenchTraceEvent[];
  record(event: unknown): void;
  toTrace(params: {
    caseName: string;
    model: string;
    startedAt: string;
    endedAt: string;
    messages?: unknown[];
  }): WorkbenchTrace;
}

export function createTraceCollector(): { record(event: unknown): void; events: unknown[] } {
  const events: unknown[] = [];
  return {
    events,
    record(event: unknown) {
      events.push(event);
    },
  };
}

export function createTraceRecorder(options: { now?: () => string } = {}): TraceRecorder {
  const now = options.now ?? (() => new Date().toISOString());
  const events: WorkbenchTraceEvent[] = [];

  return {
    events,
    record(event: unknown) {
      events.push(normalizeTraceEvent(event, now()));
    },
    toTrace(params) {
      const eventEntries = normalizeEvents(events);
      const entries = eventEntries.length > 0
        ? mergeSessionMessages(eventEntries, params.messages ?? [])
        : normalizeMessages(params.messages ?? []);
      return {
        schemaVersion: 1,
        caseName: params.caseName,
        model: params.model,
        startedAt: params.startedAt,
        endedAt: params.endedAt,
        events: [...events],
        entries,
      };
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

function normalizeTraceEvent(event: unknown, timestamp: string): WorkbenchTraceEvent {
  if (!isRecord(event) || typeof event.type !== 'string') {
    return { type: 'unknown', timestamp, value: toJsonSafe(event) };
  }

  const normalized: WorkbenchTraceEvent = { type: event.type, timestamp };
  for (const [key, value] of Object.entries(event)) {
    if (key === 'type') {
      continue;
    }
    const safeValue = toJsonSafe(value);
    if (safeValue !== undefined) {
      normalized[key] = safeValue;
    }
  }
  return normalized;
}

function normalizeEvents(events: WorkbenchTraceEvent[]): WorkbenchTraceEntry[] {
  const entries: WorkbenchTraceEntry[] = [];

  for (const event of events) {
    if (event.type === 'message_end' && isRecord(event.message)) {
      const messageEntry = normalizeMessageOnly(event.message, event.timestamp);
      if (messageEntry) {
        entries.push(messageEntry);
      }
      continue;
    }

    if (event.type === 'tool_execution_start') {
      entries.push({
        type: 'tool_call',
        id: typeof event.toolCallId === 'string' ? event.toolCallId : undefined,
        name: typeof event.toolName === 'string' ? event.toolName : 'unknown',
        arguments: event.args,
        timestamp: event.timestamp,
      });
      continue;
    }

    if (event.type === 'tool_execution_end') {
      entries.push({
        type: 'tool_result',
        id: typeof event.toolCallId === 'string' ? event.toolCallId : undefined,
        name: typeof event.toolName === 'string' ? event.toolName : undefined,
        text: extractToolEventText(event.result),
        isError: typeof event.isError === 'boolean' ? event.isError : undefined,
        timestamp: event.timestamp,
      });
    }
  }

  return entries;
}

function mergeSessionMessages(eventEntries: WorkbenchTraceEntry[], messages: unknown[]): WorkbenchTraceEntry[] {
  const sessionMessages = normalizeMessages(messages)
    .filter((entry): entry is Extract<WorkbenchTraceEntry, { type: 'message' }> => entry.type === 'message');
  const missingSessionMessages = sessionMessages.filter((message) => !eventEntries.some((entry) => sameMessageEntry(entry, message)));
  return [...missingSessionMessages, ...eventEntries];
}

function sameMessageEntry(left: WorkbenchTraceEntry, right: Extract<WorkbenchTraceEntry, { type: 'message' }>): boolean {
  if (left.type !== 'message') {
    return false;
  }
  return left.role === right.role
    && left.text === right.text
    && left.thinking === right.thinking
    && left.stopReason === right.stopReason
    && left.errorMessage === right.errorMessage;
}

function normalizeMessageOnly(message: Record<string, unknown>, timestamp: string): WorkbenchTraceEntry | undefined {
  const role = typeof message.role === 'string' ? message.role : 'unknown';
  if (role === 'toolResult') {
    return undefined;
  }

  const content = Array.isArray(message.content) ? message.content : [];
  const text = extractContentByType(content, 'text', 'text');
  const thinking = extractContentByType(content, 'thinking', 'thinking');
  const hasTerminalMetadata = typeof message.stopReason === 'string' || typeof message.errorMessage === 'string';
  if (text.length === 0 && thinking.length === 0 && role === 'assistant' && !hasTerminalMetadata) {
    return undefined;
  }

  return {
    type: 'message',
    role,
    text: text.length > 0 ? text : undefined,
    thinking: thinking.length > 0 ? thinking : undefined,
    timestamp,
    usage: message.usage,
    stopReason: message.stopReason,
    errorMessage: typeof message.errorMessage === 'string' ? message.errorMessage : undefined,
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

function extractToolEventText(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  return extractText(result.content);
}

function toJsonSafe(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (depth > 8) {
    return '[MaxDepth]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item, seen, depth + 1));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const safeItem = toJsonSafe(item, seen, depth + 1);
      if (safeItem !== undefined) {
        record[key] = safeItem;
      }
    }
    seen.delete(value);
    return record;
  }
  return String(value);
}
