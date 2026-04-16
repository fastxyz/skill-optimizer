/**
 * Smoke tests for the prompt surface evaluator (benchmark/prompt-evaluator.ts).
 * Mirrors the structure of smoke-scoring.ts and smoke-llm.ts.
 */

import {
  evaluatePromptResponse,
  type PromptEvaluationCriteria,
} from '../src/benchmark/prompt-evaluator.js';

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

function assertInRange(actual: number, min: number, max: number, message: string): void {
  if (actual < min || actual > max) {
    throw new Error(`${message}: expected ${actual} to be in [${min}, ${max}]`);
  }
}

console.log('\n=== Prompt Evaluator Smoke Tests ===\n');

// ---------------------------------------------------------------------------
// Required sections
// ---------------------------------------------------------------------------

await test('required sections present -> high section score', () => {
  const criteria: PromptEvaluationCriteria = {
    requiredSections: ['Overview', 'Implementation'],
  };

  const response = `## Overview

Here is the overview of the system.

## Implementation

The implementation uses a factory pattern.
`;

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.sections, 1.0, 'all required sections present should yield section score 1.0');
  assertInRange(result.score, 0.8, 1.0, 'overall score should be high when sections are all present');
});

await test('required sections missing -> low section score', () => {
  const criteria: PromptEvaluationCriteria = {
    requiredSections: ['Overview', 'Implementation', 'Testing'],
  };

  const response = `## Overview

Here is the overview.

Some text about implementation without a heading.
`;

  const result = evaluatePromptResponse(response, criteria);
  // Only 1 of 3 sections found
  assertInRange(result.categoryScores.sections, 0.3, 0.4, 'only 1/3 sections found should yield ~0.33');
  assert(result.details.some((d) => d.includes('MISSING')), 'details should mention missing sections');
});

// ---------------------------------------------------------------------------
// Format patterns
// ---------------------------------------------------------------------------

await test('format pattern match -> positive format score', () => {
  const criteria: PromptEvaluationCriteria = {
    formatPatterns: [
      { name: 'has-yaml-key', pattern: '^\\w+:\\s+' },
      { name: 'has-heading', pattern: '^#+\\s+' },
    ],
  };

  const response = `# Configuration

name: my-service
replicas: 3
`;

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.format, 1.0, 'both format patterns matched should yield 1.0');
});

await test('format pattern mismatch -> low format score', () => {
  const criteria: PromptEvaluationCriteria = {
    formatPatterns: [
      { name: 'has-json', pattern: '\\{[\\s\\S]*"\\w+"\\s*:' },
      { name: 'has-array', pattern: '\\[\\s*\\{' },
    ],
  };

  const response = 'Just plain text without any JSON or arrays.';

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.format, 0, 'no format patterns matched should yield 0');
});

// ---------------------------------------------------------------------------
// Forbidden keywords
// ---------------------------------------------------------------------------

await test('forbidden keywords present -> keyword score penalty', () => {
  const criteria: PromptEvaluationCriteria = {
    forbiddenKeywords: ['deprecated', 'latest'],
  };

  const response = 'Use the deprecated API with the latest image tag.';

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.keywords, 0, 'both forbidden keywords present should yield 0');
  assert(
    result.checks.filter((c) => c.check.startsWith('forbidden:') && !c.passed).length === 2,
    'should have 2 failed forbidden checks',
  );
});

await test('forbidden keywords absent -> keyword score 1.0', () => {
  const criteria: PromptEvaluationCriteria = {
    forbiddenKeywords: ['deprecated', 'hack', 'workaround'],
  };

  const response = 'A clean implementation using standard patterns.';

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.keywords, 1.0, 'no forbidden keywords should yield 1.0');
});

// ---------------------------------------------------------------------------
// Code blocks (structural)
// ---------------------------------------------------------------------------

await test('code blocks detected -> structural score boost', () => {
  const criteria: PromptEvaluationCriteria = {
    hasCodeBlocks: true,
  };

  const response = `Here is the implementation:

\`\`\`go
func main() {
    fmt.Println("hello")
}
\`\`\`
`;

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.structure, 1.0, 'expected code blocks found should yield structure 1.0');
});

await test('code blocks expected but missing -> structural score drop', () => {
  const criteria: PromptEvaluationCriteria = {
    hasCodeBlocks: true,
  };

  const response = 'Just text, no code blocks at all.';

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.structure, 0, 'expected code blocks missing should yield structure 0');
});

// ---------------------------------------------------------------------------
// Empty response
// ---------------------------------------------------------------------------

await test('empty response -> score 0', () => {
  const criteria: PromptEvaluationCriteria = {
    requiredSections: ['Overview'],
    forbiddenKeywords: ['error'],
  };

  // With required sections set, an empty string scores 0 on section checks.
  const resultEmpty = evaluatePromptResponse('', criteria);
  // Empty string: heading regex won't match, so sections score = 0
  assertInRange(resultEmpty.categoryScores.sections, 0, 0, 'empty response should have section score 0');

  const resultWhitespace = evaluatePromptResponse('   \n  \n  ', criteria);
  assertInRange(resultWhitespace.categoryScores.sections, 0, 0, 'whitespace-only response should have section score 0');
});

// ---------------------------------------------------------------------------
// All criteria met -> score 1.0
// ---------------------------------------------------------------------------

await test('all criteria met -> score 1.0', () => {
  const criteria: PromptEvaluationCriteria = {
    requiredSections: ['Setup', 'Deploy'],
    formatPatterns: [{ name: 'has-heading', pattern: '^##\\s+' }],
    requiredKeywords: ['kubernetes', 'namespace'],
    forbiddenKeywords: ['deprecated'],
    hasCodeBlocks: true,
    hasNumberedList: true,
  };

  const response = `## Setup

Configure the kubernetes cluster and target namespace.

1. Create the namespace
2. Apply RBAC rules

## Deploy

Deploy the service:

\`\`\`bash
kubectl apply -f manifests/
\`\`\`
`;

  const result = evaluatePromptResponse(response, criteria);
  assertEqual(result.categoryScores.sections, 1.0, 'all sections found');
  assertEqual(result.categoryScores.format, 1.0, 'format pattern matched');
  assertEqual(result.categoryScores.keywords, 1.0, 'all keywords present, no forbidden');
  assertEqual(result.categoryScores.structure, 1.0, 'code blocks and numbered list found');
  assertEqual(result.score, 1.0, 'overall score should be 1.0 when all criteria met');
});

// ---------------------------------------------------------------------------
// Mixed criteria: partial scores
// ---------------------------------------------------------------------------

await test('mixed criteria produce weighted intermediate score', () => {
  const criteria: PromptEvaluationCriteria = {
    requiredSections: ['Setup', 'Missing Section'],
    requiredKeywords: ['deploy'],
    forbiddenKeywords: ['hack'],
    hasCodeBlocks: true,
  };

  const response = `## Setup

We will deploy the service.

\`\`\`bash
kubectl apply -f deploy.yaml
\`\`\`
`;

  const result = evaluatePromptResponse(response, criteria);
  // Sections: 1/2 = 0.5
  assertInRange(result.categoryScores.sections, 0.49, 0.51, 'sections should be ~0.5 (1/2 found)');
  // Keywords: deploy found + hack absent = 2/2 = 1.0
  assertEqual(result.categoryScores.keywords, 1.0, 'keywords should be 1.0');
  // Structure: code blocks present = 1.0
  assertEqual(result.categoryScores.structure, 1.0, 'structure should be 1.0');
  // Overall: weighted mix, should be between 0.5 and 1.0
  assertInRange(result.score, 0.5, 1.0, 'overall score should be between 0.5 and 1.0');
});

// ---------------------------------------------------------------------------
// Numbered list and table detection
// ---------------------------------------------------------------------------

await test('numbered list detection works', () => {
  const criteria: PromptEvaluationCriteria = {
    hasNumberedList: true,
  };

  const withList = `Steps:

1. First step
2. Second step
3. Third step
`;

  const withoutList = 'No numbered items here, just prose.';

  const resultWith = evaluatePromptResponse(withList, criteria);
  assertEqual(resultWith.categoryScores.structure, 1.0, 'numbered list found should yield 1.0');

  const resultWithout = evaluatePromptResponse(withoutList, criteria);
  assertEqual(resultWithout.categoryScores.structure, 0, 'no numbered list should yield 0');
});

await test('table detection works', () => {
  const criteria: PromptEvaluationCriteria = {
    hasTable: true,
  };

  const withTable = `| Name | Value |
|------|-------|
| foo  | bar   |
`;

  const withoutTable = 'No table here.';

  const resultWith = evaluatePromptResponse(withTable, criteria);
  assertEqual(resultWith.categoryScores.structure, 1.0, 'table found should yield 1.0');

  const resultWithout = evaluatePromptResponse(withoutTable, criteria);
  assertEqual(resultWithout.categoryScores.structure, 0, 'no table should yield 0');
});

// ---------------------------------------------------------------------------
// minLength check
// ---------------------------------------------------------------------------

await test('minLength enforced as format check', () => {
  const criteria: PromptEvaluationCriteria = {
    minLength: 100,
  };

  const shortResponse = 'Too short.';
  const longResponse = 'A'.repeat(150) + ' — this response is well over the minimum length requirement and should pass the check.';

  const resultShort = evaluatePromptResponse(shortResponse, criteria);
  assertEqual(resultShort.categoryScores.format, 0, 'short response should fail minLength');

  const resultLong = evaluatePromptResponse(longResponse, criteria);
  assertEqual(resultLong.categoryScores.format, 1.0, 'long response should pass minLength');
});

// ---------------------------------------------------------------------------
// No criteria -> vacuous pass
// ---------------------------------------------------------------------------

await test('no criteria specified -> score 1.0 (vacuous pass)', () => {
  const criteria: PromptEvaluationCriteria = {};
  const result = evaluatePromptResponse('Any response at all.', criteria);
  assertEqual(result.score, 1.0, 'no criteria should vacuously pass');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
