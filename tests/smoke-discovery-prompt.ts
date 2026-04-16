/**
 * Smoke tests for prompt surface discovery (discovery/prompt.ts).
 * Mirrors the structure of smoke-discovery-mcp.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  discoverPromptSurfaceFromContent,
  discoverPromptSurfaceFromSources,
} from '../src/discovery/prompt.js';
import { discoverPromptCapabilities } from '../src/project/discover-prompt.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  + ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  - ${name}`);
    console.log(`    ${error.message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Inline sample SKILL.md for unit-level tests
// ---------------------------------------------------------------------------

const sampleSkill = `---
name: test-skill
description: A test skill for benchmarking
---

# Test Skill

## Phase 1 — Requirements Discovery

Ask clarifying questions until the stopping condition is met.

## Phase 2 — Implementation

Write the code changes:

\`\`\`go
func handleRequest(ctx context.Context, req *Request) (*Response, error) {
    // implementation
}
\`\`\`

## Phase 3 — Testing

Create table-driven tests with named fixtures.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\n=== Prompt Discovery Smoke Tests ===\n');

await test('discovers 3 phases from sample SKILL.md', () => {
  const snapshot = discoverPromptSurfaceFromContent(sampleSkill);

  assertEqual(snapshot.surface, 'prompt', 'surface should be prompt');
  assertEqual(snapshot.phases.length, 3, 'should discover 3 phases');

  const phaseNames = snapshot.phases.map((p) => p.name);
  assert(phaseNames.includes('Requirements Discovery'), 'should include Requirements Discovery phase');
  assert(phaseNames.includes('Implementation'), 'should include Implementation phase');
  assert(phaseNames.includes('Testing'), 'should include Testing phase');
});

await test('each phase has a name and description', () => {
  const snapshot = discoverPromptSurfaceFromContent(sampleSkill);

  for (const phase of snapshot.phases) {
    assert(phase.name.length > 0, `phase should have a non-empty name, got: "${phase.name}"`);
    assert(phase.description.length > 0, `phase "${phase.name}" should have a non-empty description`);
  }
});

await test('code block detected in Phase 2 (Implementation)', () => {
  const snapshot = discoverPromptSurfaceFromContent(sampleSkill);
  const implPhase = snapshot.phases.find((p) => p.name === 'Implementation');

  assert(implPhase !== undefined, 'Implementation phase should exist');
  assert(implPhase!.hasCodeBlocks, 'Implementation phase should have code blocks');

  // Phase 1 and Phase 3 should NOT have code blocks
  const discoveryPhase = snapshot.phases.find((p) => p.name === 'Requirements Discovery');
  assert(discoveryPhase !== undefined, 'Requirements Discovery phase should exist');
  assert(!discoveryPhase!.hasCodeBlocks, 'Requirements Discovery phase should NOT have code blocks');
});

await test('empty skill returns empty capabilities', () => {
  const snapshot = discoverPromptSurfaceFromContent('');

  assertEqual(snapshot.phases.length, 0, 'empty skill should have 0 phases');
  assertEqual(snapshot.capabilities.length, 0, 'empty skill should have 0 capabilities');
});

await test('skill with no phases returns capabilities from instructions', () => {
  const noPhaseSkill = `---
name: simple-skill
---

# Simple Skill

- Validate the input format
- Transform data to JSON
- Send the result to the API
`;

  const snapshot = discoverPromptSurfaceFromContent(noPhaseSkill);

  assertEqual(snapshot.phases.length, 0, 'should have 0 phases');
  assert(snapshot.capabilities.length > 0, 'should have capabilities extracted from bullet points');
  assert(
    snapshot.capabilities.every((c) => c.source === 'instruction'),
    'all capabilities should have source "instruction"',
  );
});

await test('phases with capabilities have source "phase"', () => {
  const snapshot = discoverPromptSurfaceFromContent(sampleSkill);

  assertEqual(snapshot.capabilities.length, 3, 'should have 3 capabilities (one per phase)');
  assert(
    snapshot.capabilities.every((c) => c.source === 'phase'),
    'all capabilities should have source "phase" when phases exist',
  );
});

await test('discoverPromptSurfaceFromSources reads fixture file', () => {
  const fixturePath = resolve(process.cwd(), 'tests/fixtures/sample-skill.md');
  const snapshot = discoverPromptSurfaceFromSources([fixturePath]);

  assertEqual(snapshot.surface, 'prompt', 'surface should be prompt');
  assertEqual(snapshot.phases.length, 3, 'fixture should have 3 phases');
  assertEqual(snapshot.sources.length, 1, 'should track one source file');

  // Verify structural detection on the fixture
  const phase2 = snapshot.phases.find((p) => p.name === 'Manifest Generation');
  assert(phase2 !== undefined, 'fixture should have Manifest Generation phase');
  assert(phase2!.hasCodeBlocks, 'Manifest Generation should have code blocks');
  assert(phase2!.hasNumberedSteps, 'Manifest Generation should have numbered steps');

  const phase1 = snapshot.phases.find((p) => p.name === 'Requirements Discovery');
  assert(phase1 !== undefined, 'fixture should have Requirements Discovery phase');
  assert(phase1!.hasDecisionPoints, 'Requirements Discovery should have decision points');
  assert(phase1!.hasNumberedSteps, 'Requirements Discovery should have numbered steps');
});

await test('discoverPromptSurfaceFromSources throws on missing file', () => {
  let threw = false;
  try {
    discoverPromptSurfaceFromSources(['/tmp/nonexistent-skill-12345.md']);
  } catch (error: any) {
    threw = true;
    assert(
      error.message.includes('does not exist'),
      `error should mention missing path, got: ${error.message}`,
    );
  }
  assert(threw, 'should throw on missing source file');
});

await test('frontmatter is stripped before parsing phases', () => {
  const skillWithFrontmatter = `---
name: fm-test
description: frontmatter test
custom_field: true
---

## Phase 1 — Setup

Initialize the environment.
`;

  const snapshot = discoverPromptSurfaceFromContent(skillWithFrontmatter);
  assertEqual(snapshot.phases.length, 1, 'should discover 1 phase after stripping frontmatter');
  assertEqual(snapshot.phases[0].name, 'Setup', 'phase name should be "Setup"');
});

await test('decision points detected from conditional keywords', () => {
  const skillWithDecisions = `---
name: decision-test
---

## Phase 1 — Routing

If the request is a GET, return cached data.
When the cache is stale, fetch fresh data.
Otherwise fall back to the default response.
`;

  const snapshot = discoverPromptSurfaceFromContent(skillWithDecisions);
  assertEqual(snapshot.phases.length, 1, 'should discover 1 phase');
  assert(snapshot.phases[0].hasDecisionPoints, 'phase should detect decision points');
});

await test('stripFrontmatter: does not terminate early when YAML value contains ---', () => {
  // YAML value "A --- B" contains ---, which indexOf finds first
  const content = `---\ntitle: "A --- B"\n---\n\n## Section\nBody text.`;
  const result = discoverPromptSurfaceFromContent(content);
  assert(result.phases.length > 0, 'should have at least one phase');
  const phaseName = result.phases[0].name.toLowerCase();
  assert(phaseName.includes('section'),
    `phase name should be "Section" but was: "${result.phases[0].name}"`);
});

// Bug 6: preamble contamination
await test('discoverPromptCapabilities: preamble lines do not contaminate first section body', () => {
  const content = [
    '# My Skill',
    'Run this preamble step before anything else.',
    '',
    '## Phase 1: Do the thing',
    'Write the implementation here.',
  ].join('\n');
  const actions = discoverPromptCapabilities(content);
  const hasSpuriousInstruction = actions.some(a =>
    a.description.toLowerCase().includes('preamble'),
  );
  // Should be false — preamble should not bleed into instructions
  if (hasSpuriousInstruction) throw new Error('preamble content bled into discovered instructions');
});

// Bug 7: frontmatter
await test('discoverPromptCapabilities: strips YAML frontmatter before scanning', () => {
  const content = [
    '---',
    'run: my-skill-command',
    '---',
    '',
    '## Phase 1: Setup',
    'Configure the environment.',
  ].join('\n');
  const actions = discoverPromptCapabilities(content);
  const hasFrontmatterCap = actions.some(a =>
    a.description.toLowerCase().includes('run: my-skill-command'),
  );
  if (hasFrontmatterCap) throw new Error('frontmatter must be stripped before discovery');
  if (actions.length === 0) throw new Error('should still find Phase 1 capability');
});

// Bug 4: heading-less files
await test('discoverPromptCapabilities: handles heading-less instruction-only files', () => {
  const content = [
    '# Deployment Skill',
    '',
    'This skill deploys services to production.',
    '',
    '- Ask for the service name and environment',
    '- Generate the deployment manifest',
    '- Validate the configuration before applying',
    '- Run the deployment command',
  ].join('\n');
  const actions = discoverPromptCapabilities(content);
  assert(actions.length > 0, `should extract at least one capability from bullet list, got ${actions.length}`);
});

await test('discoverPromptCapabilities: returns valid ActionDefinition[] shape', () => {
  const content = [
    '## Phase 1: Requirements',
    'Ask the user clarifying questions.',
    'Generate a requirements document.',
    '',
    '## Phase 2: Implementation',
    'Write the implementation code.',
  ].join('\n');

  const actions = discoverPromptCapabilities(content);
  assert(Array.isArray(actions), 'should return an array');
  assert(actions.length >= 2, `expected ≥2 capabilities, got ${actions.length}`);

  for (const action of actions) {
    assert(typeof action.name === 'string' && action.name.length > 0, 'name must be non-empty');
    assert(typeof action.description === 'string', 'description must be string');
    assert(Array.isArray(action.args), 'args must be array');
  }
});

// Regression guard: both discovery modules exist intentionally for different layers.
// This test documents the interface difference so future refactors stay aware.
await test('production path (discover-prompt) vs standalone path (discovery/prompt) have different shapes', () => {
  const content = '## Phase 1: Do the thing\nRun this step.';

  // Production path: ActionDefinition[] — has args field, no source field
  const productionResult = discoverPromptCapabilities(content);
  assert(productionResult.length > 0, 'production path must return at least one capability');
  assert('args' in productionResult[0], 'production path must have args field');

  // Standalone discovery path: PromptDiscoverySnapshot — capabilities have source field, not args
  const discoveryResult = discoverPromptSurfaceFromContent(content);
  if (discoveryResult.capabilities.length > 0) {
    const cap = discoveryResult.capabilities[0];
    assert('source' in cap, 'discovery path capability must have source field');
    assert(!('args' in cap), 'discovery path must NOT have args field');
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
