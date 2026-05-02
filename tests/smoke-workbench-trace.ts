import { buildWorkbenchTrace, createTraceCollector, createTraceRecorder } from '../src/workbench/trace.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== Workbench Trace Smoke Tests ===\n');

await test('buildWorkbenchTrace stores a deduped interaction timeline', () => {
  const trace = buildWorkbenchTrace({
    caseName: 'case-1',
    model: 'openrouter/google/gemini-2.5-flash',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:02.000Z',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Do the task' }] },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Need to inspect files' },
          { type: 'text', text: 'I will read the skill.' },
          { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: '/work/SKILL.md' } },
        ],
        usage: { totalTokens: 10 },
      },
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read',
        content: [{ type: 'text', text: '# Skill' }],
        isError: false,
      },
    ],
  });

  assertEqual(trace.caseName, 'case-1', 'trace should preserve caseName');
  assertEqual(trace.entries.length, 4, 'trace should normalize messages into entries');
  assertEqual(trace.entries[0].type, 'message', 'first entry should be user message');
  assertEqual(trace.entries[1].type, 'message', 'second entry should be assistant message');
  assertEqual(trace.entries[2].type, 'tool_call', 'third entry should be tool call');
  assertEqual(trace.entries[3].type, 'tool_result', 'fourth entry should be tool result');
  assert(!('events' in trace), 'trace should not include raw streaming events');
  assert(!('messages' in trace), 'trace should not duplicate raw messages');
});

await test('buildWorkbenchTrace preserves assistant provider error messages', () => {
  const trace = buildWorkbenchTrace({
    caseName: 'case-error',
    model: 'openrouter/google/gemini-2.5-flash',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:02.000Z',
    messages: [
      {
        role: 'assistant',
        content: [],
        stopReason: 'error',
        errorMessage: 'Provider returned 500',
      },
    ],
  });

  const entry = trace.entries[0] as { type: string; errorMessage?: string; stopReason?: unknown };
  assertEqual(entry.type, 'message', 'entry should be a message');
  assertEqual(entry.stopReason, 'error', 'entry should preserve stop reason');
  assertEqual(entry.errorMessage, 'Provider returned 500', 'entry should preserve provider error message');
});

await test('createTraceCollector records arbitrary events in order', () => {
  const collector = createTraceCollector();
  collector.record({ step: 1 });
  collector.record('tool-call');
  collector.record(42);

  assertEqual(collector.events.length, 3, 'collector should record all events');
  assertEqual((collector.events[0] as { step?: number }).step, 1, 'collector should preserve object payload');
  assertEqual(collector.events[1], 'tool-call', 'collector should preserve string payload');
  assertEqual(collector.events[2], 42, 'collector should preserve numeric payload');
});

await test('createTraceRecorder captures Pi session events and normalized entries', () => {
  const recorder = createTraceRecorder({ now: () => '2026-01-01T00:00:01.000Z' });

  recorder.record({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'I will run the command.' }],
      stopReason: 'toolUse',
    },
  });
  recorder.record({
    type: 'tool_execution_start',
    toolCallId: 'call-1',
    toolName: 'bash',
    args: { command: 'firecrawl search browser --scrape' },
  });
  recorder.record({
    type: 'tool_execution_end',
    toolCallId: 'call-1',
    toolName: 'bash',
    result: { content: [{ type: 'text', text: 'ok' }] },
    isError: false,
  });

  const trace = recorder.toTrace({
    caseName: 'case-events',
    model: 'openrouter/test/model',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:02.000Z',
  });

  assertEqual(trace.events?.length, 3, 'trace should preserve raw-ish Pi events');
  assertEqual(trace.events?.[0]?.timestamp, '2026-01-01T00:00:01.000Z', 'trace events should have capture timestamps');
  assertEqual(trace.entries.length, 3, 'trace should derive normalized entries from events');
  assertEqual(trace.entries[0].type, 'message', 'first entry should be assistant message');
  assertEqual(trace.entries[1].type, 'tool_call', 'second entry should be tool call');
  assertEqual(trace.entries[2].type, 'tool_result', 'third entry should be tool result');
  assertEqual(
    ((trace.entries[1] as { arguments?: { command?: string } }).arguments)?.command,
    'firecrawl search browser --scrape',
    'tool call entry should preserve bash command',
  );
});

await test('createTraceRecorder preserves session messages when events are partial', () => {
  const recorder = createTraceRecorder({ now: () => '2026-01-01T00:00:01.000Z' });

  recorder.record({
    type: 'tool_execution_start',
    toolCallId: 'call-1',
    toolName: 'bash',
    args: { command: 'node parse-pdf.mjs' },
  });

  const trace = recorder.toTrace({
    caseName: 'partial-events',
    model: 'openrouter/test/model',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:02.000Z',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Extract the PDF facts.' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'I will parse the PDF.' }] },
    ],
  });

  assertEqual(trace.entries.length, 3, 'trace should keep session messages plus partial event entries');
  assertEqual(trace.entries[0].type, 'message', 'first entry should be a session message');
  assertEqual((trace.entries[0] as { role?: string }).role, 'user', 'first session message should be user');
  assertEqual(trace.entries[1].type, 'message', 'second entry should be a session message');
  assertEqual((trace.entries[1] as { role?: string }).role, 'assistant', 'second session message should be assistant');
  assertEqual(trace.entries[2].type, 'tool_call', 'partial tool event should still be included');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
