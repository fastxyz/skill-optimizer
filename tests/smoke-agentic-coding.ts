/**
 * Smoke tests for the agentic-coding benchmark path (benchmark/agentic-coding.ts).
 *
 * The agentic-coding path routes a prompt-surface benchmark through a coding
 * orchestrator so skills that require real tool use (Read, Bash, Grep) can be
 * evaluated against a real working directory, instead of being graded against
 * hallucinated `<tool_call>` text from a single-shot chat completion.
 *
 * These tests use a fake session factory so no real LLM or filesystem access
 * is needed.
 */

import {
  runAgenticCodingTask,
  normalizeAgenticCodingConfig,
  type AgenticCodingDeps,
  type CodingSession,
  type AgenticCodingConfig,
} from '../src/benchmark/agentic-coding.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error: unknown) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ ${name}`);
    console.log(`    ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => unknown, matcher: RegExp, message: string): void {
  try {
    fn();
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    if (!matcher.test(text)) {
      throw new Error(`${message}: error "${text}" did not match ${matcher}`);
    }
    return;
  }
  throw new Error(`${message}: expected function to throw`);
}

function makeFakeSession(messages: Array<Record<string, unknown>>): { session: CodingSession; prompts: string[] } {
  const prompts: string[] = [];
  const session: CodingSession = {
    state: { messages },
    async prompt(input: string): Promise<void> {
      prompts.push(input);
    },
  };
  return { session, prompts };
}

console.log('\n=== Agentic Coding Smoke Tests ===\n');

// ---------------------------------------------------------------------------
// normalizeAgenticCodingConfig — pure config validation
// ---------------------------------------------------------------------------

await test('normalize: disabled when enabled flag is false', () => {
  const result = normalizeAgenticCodingConfig({ enabled: false, cwd: '/tmp' } as AgenticCodingConfig);
  assertEqual(result, null, 'disabled config should normalize to null');
});

await test('normalize: missing cwd throws with actionable message', () => {
  assertThrows(
    () => normalizeAgenticCodingConfig({ enabled: true } as unknown as AgenticCodingConfig),
    /cwd/,
    'missing cwd should throw mentioning cwd',
  );
});

await test('normalize: defaults thinkingLevel to medium', () => {
  const result = normalizeAgenticCodingConfig({ enabled: true, cwd: '/tmp' });
  assert(result !== null, 'enabled config with cwd should normalize');
  assertEqual(result!.thinkingLevel, 'medium', 'thinkingLevel should default to medium');
});

await test('normalize: preserves explicit thinkingLevel', () => {
  const result = normalizeAgenticCodingConfig({ enabled: true, cwd: '/tmp', thinkingLevel: 'high' });
  assertEqual(result!.thinkingLevel, 'high', 'explicit thinkingLevel should be preserved');
});

// ---------------------------------------------------------------------------
// runAgenticCodingTask — session dispatch + response extraction
// ---------------------------------------------------------------------------

await test('run: passes cwd, model ref, and thinking level to session factory', async () => {
  let capturedOpts: Record<string, unknown> | null = null;
  const { session } = makeFakeSession([
    { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
  ]);
  const deps: AgenticCodingDeps = {
    createSession: async (opts) => {
      capturedOpts = opts as unknown as Record<string, unknown>;
      return { session };
    },
  };

  await runAgenticCodingTask(deps, {
    cwd: '/tmp/fixture',
    modelRef: 'anthropic/claude-sonnet-4-6',
    systemPrompt: 'SKILL',
    taskPrompt: 'review PR #1',
    thinkingLevel: 'high',
    authMode: 'env',
    apiKeyEnv: 'TEST_KEY',
  });

  assert(capturedOpts !== null, 'session factory should have been called');
  assertEqual(capturedOpts!.cwd, '/tmp/fixture', 'cwd forwarded');
  assertEqual(capturedOpts!.modelRef, 'anthropic/claude-sonnet-4-6', 'modelRef forwarded');
  assertEqual(capturedOpts!.thinkingLevel, 'high', 'thinkingLevel forwarded');
  assertEqual(capturedOpts!.authMode, 'env', 'authMode forwarded');
  assertEqual(capturedOpts!.apiKeyEnv, 'TEST_KEY', 'apiKeyEnv forwarded');
});

await test('run: submits system prompt + task prompt to the session', async () => {
  const { session, prompts } = makeFakeSession([
    { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
  ]);
  const deps: AgenticCodingDeps = {
    createSession: async () => ({ session }),
  };

  await runAgenticCodingTask(deps, {
    cwd: '/tmp',
    modelRef: 'anthropic/claude-sonnet-4-6',
    systemPrompt: 'You are a reviewer.',
    taskPrompt: 'Review PR #42.',
  });

  assertEqual(prompts.length, 1, 'exactly one prompt call');
  assert(prompts[0].includes('You are a reviewer.'), 'system prompt included');
  assert(prompts[0].includes('Review PR #42.'), 'task prompt included');
});

await test('run: extracts latest assistant text from session messages', async () => {
  const { session } = makeFakeSession([
    { role: 'user', content: 'prompt text' },
    { role: 'assistant', content: [{ type: 'text', text: 'first draft' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'final review' }] },
  ]);
  const deps: AgenticCodingDeps = {
    createSession: async () => ({ session }),
  };

  const result = await runAgenticCodingTask(deps, {
    cwd: '/tmp',
    modelRef: 'anthropic/claude-sonnet-4-6',
    systemPrompt: 'S',
    taskPrompt: 'T',
  });

  assertEqual(result.content, 'final review', 'latest assistant text returned');
});

await test('run: captures tool activity from toolCall blocks', async () => {
  const { session } = makeFakeSession([
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', name: 'read', arguments: { path: 'SKILL.md' } },
      ],
    },
    {
      role: 'toolResult',
      toolName: 'read',
      content: [{ type: 'text', text: '# SKILL contents' }],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'review: all good' }],
    },
  ]);
  const deps: AgenticCodingDeps = {
    createSession: async () => ({ session }),
  };

  const result = await runAgenticCodingTask(deps, {
    cwd: '/tmp',
    modelRef: 'anthropic/claude-sonnet-4-6',
    systemPrompt: 'S',
    taskPrompt: 'T',
  });

  assert(result.content === 'review: all good', 'final assistant text extracted');
  assert(result.toolActivity.length >= 1, 'at least one tool activity entry');
  assert(
    result.toolActivity.some((line) => line.includes('read')),
    'toolActivity mentions read tool',
  );
});

await test('run: empty session throws actionable error', async () => {
  const { session } = makeFakeSession([]);
  const deps: AgenticCodingDeps = {
    createSession: async () => ({ session }),
  };

  let err: unknown = null;
  try {
    await runAgenticCodingTask(deps, {
      cwd: '/tmp',
      modelRef: 'anthropic/claude-sonnet-4-6',
      systemPrompt: 'S',
      taskPrompt: 'T',
    });
  } catch (e) { err = e; }

  assert(err !== null, 'empty session should throw');
  const text = err instanceof Error ? err.message : String(err);
  assert(/no output|no response|empty/i.test(text), `error should name the failure mode, got: ${text}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
