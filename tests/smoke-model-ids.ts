import { test } from 'node:test';
import assert from 'node:assert/strict';

// Helper: run validate+fix pipeline on a minimal config with the given model ID.
async function pipeline(modelId: string): Promise<string> {
  const { checkConfig } = await import('../src/project/validate.js');
  const { applyFixes } = await import('../src/project/fix.js');
  const raw = {
    name: 'test',
    target: { surface: 'mcp' as const, repoPath: '.' },
    benchmark: {
      format: 'pi',
      models: [{ id: modelId, name: 'Test Model', tier: 'mid' as const }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(raw as never, '/tmp/fake.json');
  const fixed = applyFixes(raw as never, issues, '/tmp');
  const models = (fixed as { benchmark: { models: Array<{ id: string }> } }).benchmark.models;
  return models[0]!.id;
}

await test('openrouter/ model IDs with dots are NOT rewritten by validate+fix', async () => {
  const OPENROUTER_IDS = [
    'openrouter/deepseek/deepseek-v3.2',
    'openrouter/anthropic/claude-sonnet-4.6',
    'openrouter/anthropic/claude-opus-4.6',
    'openrouter/minimax/minimax-m2.7',
    'openrouter/minimax/minimax-m2.5',
    'openrouter/qwen/qwen3.5-397b-a17b',
    'openrouter/qwen/qwen3.6-plus',
    'openrouter/moonshotai/kimi-k2.5',
    'openrouter/x-ai/grok-4.1-fast',
    'openrouter/openai/gpt-5.4',
    'openrouter/z-ai/glm-5.1',
    'openrouter/google/gemini-2.5-flash',
    'openrouter/google/gemini-2.5-flash-lite',
    'openrouter/google/gemini-3.1-pro-preview',
  ];

  for (const id of OPENROUTER_IDS) {
    const result = await pipeline(id);
    assert.equal(result, id, `openrouter/ ID "${id}" was rewritten to "${result}" — must be preserved`);
  }
});

await test('anthropic/ direct-API IDs with dots ARE rewritten to hyphens', async () => {
  const result = await pipeline('anthropic/claude-sonnet-4.6');
  assert.equal(result, 'anthropic/claude-sonnet-4-6',
    'anthropic/ direct API dots should be rewritten to hyphens (Anthropic API convention)');
});

await test('openrouter/ model IDs without dots are preserved as-is', async () => {
  const result = await pipeline('openrouter/google/gemini-3-flash-preview');
  assert.equal(result, 'openrouter/google/gemini-3-flash-preview');
});

await test('openai/ direct-API IDs with dots are NOT rewritten', async () => {
  const result = await pipeline('openai/gpt-5.4');
  assert.equal(result, 'openai/gpt-5.4',
    'openai/ direct API dots must be preserved (OpenAI uses gpt-5.4 not gpt-5-4)');
});

await test('applyFixes directly: openai/ IDs are NOT rewritten even if model-id-bad-format issue is present', async () => {
  const { applyFixes } = await import('../src/project/fix.js');
  const raw = {
    name: 'test',
    target: { surface: 'mcp' as const, repoPath: '.' },
    benchmark: {
      format: 'pi',
      models: [{ id: 'openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' as const }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  // Manufacture the issue that validate.ts would normally never emit for openai/,
  // so we exercise fix.ts's defense-in-depth exemption directly.
  // fixable: true is required so the filter in applyFixes actually processes it.
  const issues = [
    { code: 'model-id-bad-format' as const, field: 'benchmark.models[0].id', message: 'synthetic', severity: 'warning' as const, fixable: true },
  ];
  const fixed = applyFixes(raw as never, issues as never, '/tmp');
  const id = (fixed as { benchmark: { models: Array<{ id: string }> } }).benchmark.models[0]!.id;
  assert.equal(id, 'openai/gpt-5.4',
    'fix.ts must exempt openai/ from dot→hyphen rewrite (defense-in-depth; OpenAI API uses dots)');
});
