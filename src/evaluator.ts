import type {
  ExpectedTool,
  ExtractedCall,
  ToolMatch,
  TaskDefinition,
  TaskResult,
  ModelConfig,
  TokenUsage,
} from './types.js';

// ── Argument matching ──────────────────────────────────────────────────────

/**
 * Compare an extracted argument value against an expected string value.
 *
 * Rules:
 * 1. If got is a sentinel (<dynamic>, <template>, <spread>, or starts with <),
 *    we can't verify runtime values — treat as match (benefit of the doubt).
 * 2. If expected value is a regex pattern (starts and ends with `/`), use regex match.
 * 3. Type-aware comparison: booleans, numbers, null/undefined, then string normalization.
 */
function matchArgValue(expected: unknown, got: unknown): boolean {
  // 0. Coerce expected to string if it's not already (handles booleans, numbers from JSON)
  const exp = typeof expected === 'string' ? expected : String(expected);

  // 1a. If expected is a sentinel (<dynamic>, <template>, <identifier>),
  //     it means "any value is acceptable" — treat as wildcard match.
  if (exp.startsWith('<') && exp.endsWith('>')) {
    return true;
  }

  // 1b. If got is a sentinel (<dynamic>, <template>, <spread>, or starts with <),
  //     we can't verify runtime values — treat as match (benefit of the doubt)
  if (typeof got === 'string' && got.startsWith('<') && got.endsWith('>')) {
    return true;
  }

  // 2. Regex pattern: /pattern/flags
  const regexMatch = exp.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    try {
      const gotStr = got === null ? 'null' : got === undefined ? 'undefined' : String(got);
      const re = new RegExp(regexMatch[1], regexMatch[2]);
      return re.test(gotStr);
    } catch {
      // Invalid regex — fall through
    }
  }

  // 3. Type-aware comparison
  // Boolean: expected "true"/"false" must match actual boolean
  if (exp === 'true' || exp === 'false') {
    const expectedBool = exp === 'true';
    if (typeof got === 'boolean') return got === expectedBool;
    if (typeof got === 'string') return got.toLowerCase() === exp;
    return false;
  }

  // Number: expected numeric string must match number or numeric string
  const expectedNum = Number(exp);
  if (!isNaN(expectedNum) && exp.trim() !== '') {
    if (typeof got === 'number') return got === expectedNum;
    if (typeof got === 'string') {
      const gotNum = Number(got);
      return !isNaN(gotNum) && gotNum === expectedNum;
    }
    return false;
  }

  // Null/undefined
  if (exp === 'null') return got === null || got === 'null';
  if (exp === 'undefined') return got === undefined || got === 'undefined';

  // String: case-insensitive, strip whitespace and common punctuation
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[\s,./_\-*^]+/g, '').trim();

  const gotStr = got === null ? 'null' : got === undefined ? 'undefined' : String(got);
  return normalize(exp) === normalize(gotStr);
}

// ── Tool matching ──────────────────────────────────────────────────────────

/**
 * Match extracted calls against expected tools.
 * Returns ToolMatch[] with match details.
 *
 * Each extracted call can only be matched to ONE expected tool (greedy, first match wins).
 */
export function matchTools(
  expectedTools: ExpectedTool[],
  extractedCalls: ExtractedCall[],
): ToolMatch[] {
  // Track which extracted call indices have already been consumed
  const usedIndices = new Set<number>();

  return expectedTools.map((expected) => {
    // If there are args to check, try to find a perfect match (method + args) first.
    // Otherwise, find the first unused extracted call that matches the method name.
    const hasExpectedArgs = expected.args && Object.keys(expected.args).length > 0;

    if (hasExpectedArgs) {
      // Two-pass strategy:
      // Pass 1: look for a perfect match (method name AND all args match).
      let perfectMatchIndex = -1;
      for (let i = 0; i < extractedCalls.length; i++) {
        if (usedIndices.has(i)) continue;
        if (extractedCalls[i].method !== expected.method) continue;
        // Check args
        let allArgsMatch = true;
        for (const [key, expectedValue] of Object.entries(expected.args!)) {
          if (!matchArgValue(expectedValue, extractedCalls[i].args[key])) {
            allArgsMatch = false;
            break;
          }
        }
        if (allArgsMatch) {
          perfectMatchIndex = i;
          break;
        }
      }

      if (perfectMatchIndex !== -1) {
        // Perfect match found — consume it and report success.
        usedIndices.add(perfectMatchIndex);
        const found = extractedCalls[perfectMatchIndex];
        const argResults: Record<string, { expected: string; got: unknown; match: boolean }> = {};
        for (const [key, expectedValue] of Object.entries(expected.args!)) {
          argResults[key] = { expected: expectedValue, got: found.args[key], match: true };
        }
        return {
          expected,
          found,
          methodFound: true,
          argsCorrect: true,
          matched: true,
          argResults,
        } satisfies ToolMatch;
      }

      // Pass 2: no perfect match — fall back to the first method-name match.
      // Consume it to prevent re-matching by a later expected tool.
      let fallbackIndex = -1;
      for (let i = 0; i < extractedCalls.length; i++) {
        if (usedIndices.has(i)) continue;
        if (extractedCalls[i].method === expected.method) {
          fallbackIndex = i;
          break;
        }
      }

      if (fallbackIndex === -1) {
        // Method not found at all
        return {
          expected,
          found: null,
          methodFound: false,
          argsCorrect: false,
          matched: false,
        } satisfies ToolMatch;
      }

      // Consume the fallback index so it can't be re-matched
      usedIndices.add(fallbackIndex);
      const found = extractedCalls[fallbackIndex];
      const argResults: Record<string, { expected: string; got: unknown; match: boolean }> = {};
      for (const [key, expectedValue] of Object.entries(expected.args!)) {
        const got = found.args[key];
        argResults[key] = { expected: expectedValue, got, match: matchArgValue(expectedValue, got) };
      }
      return {
        expected,
        found,
        methodFound: true,
        argsCorrect: false,
        matched: false,
        argResults,
      } satisfies ToolMatch;
    }

    // No args to check — find the first unused extracted call matching the method name.
    let foundIndex = -1;
    for (let i = 0; i < extractedCalls.length; i++) {
      if (usedIndices.has(i)) continue;
      if (extractedCalls[i].method === expected.method) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      // Method not found at all
      return {
        expected,
        found: null,
        methodFound: false,
        argsCorrect: false,
        matched: false,
      } satisfies ToolMatch;
    }

    // No args to check — method match is sufficient
    usedIndices.add(foundIndex);
    return {
      expected,
      found: extractedCalls[foundIndex],
      methodFound: true,
      argsCorrect: true,
      matched: true,
    } satisfies ToolMatch;
  });
}

// ── Task evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate a single task result: match tools, check code patterns, compute metrics.
 */
export function evaluateTask(params: {
  task: TaskDefinition;
  model: ModelConfig;
  generatedCode: string | null;
  rawResponse: string;
  extractedCalls: ExtractedCall[];
  llmLatencyMs: number;
  tokenUsage?: TokenUsage;
  error?: string;
  knownMethods: Set<string>;  // replaces hardcoded KNOWN_SDK_METHODS
}): TaskResult {
  const {
    task,
    model,
    generatedCode,
    rawResponse,
    extractedCalls,
    llmLatencyMs,
    tokenUsage,
    error,
    knownMethods,
  } = params;

  // ── Tool matching ──
  const toolMatches = matchTools(task.expected_tools, extractedCalls);

  // ── Code pattern checks ──
  const codePatternResults: Record<string, boolean> = {};
  let allCodePatternsPass = true;

  if (task.verify && generatedCode !== null) {
    for (const verification of task.verify) {
      if (verification.code_pattern) {
        const pattern = verification.code_pattern;
        let matches: boolean;
        try {
          const re = new RegExp(pattern);
          matches = re.test(generatedCode);
        } catch {
          matches = false;
        }
        codePatternResults[pattern] = matches;
        if (!matches) allCodePatternsPass = false;
      }
    }
  } else if (task.verify) {
    // generatedCode is null — any code_pattern check fails
    for (const verification of task.verify) {
      if (verification.code_pattern) {
        codePatternResults[verification.code_pattern] = false;
        allCodePatternsPass = false;
      }
    }
  }

  // ── Metrics ──
  const expectedCount = task.expected_tools.length;
  const matchedCount = toolMatches.filter((m) => m.matched).length;

  // Recall: matched / expected. If 0 expected, recall = 1.0
  const toolRecall = expectedCount === 0 ? 1.0 : matchedCount / expectedCount;

  // Precision: matched / total known calls extracted. If 0 extracted known calls, precision = 0.0
  const knownCallCount = extractedCalls.filter((c) => knownMethods.has(c.method)).length;
  const toolPrecision = knownCallCount === 0 ? 0.0 : matchedCount / knownCallCount;

  // Task passes if all expected tools matched AND all code_pattern checks passed
  const hasCodePatterns = Object.keys(codePatternResults).length > 0;
  const taskPassed =
    matchedCount === expectedCount &&
    (expectedCount > 0 || matchedCount === 0) &&
    (!hasCodePatterns || allCodePatternsPass);

  // Tool selection accuracy: how many expected methods were found (ignoring args)?
  const methodsFoundCount = toolMatches.filter(m => m.methodFound).length;
  const toolSelectionAccuracy = expectedCount === 0 ? 1.0 : methodsFoundCount / expectedCount;

  // Arg accuracy: of methods found, how many had correct args?
  const argAccuracy = methodsFoundCount === 0 ? 1.0
    : toolMatches.filter(m => m.methodFound && m.argsCorrect).length / methodsFoundCount;

  // Hallucination tracking
  const allExtractedMethods = extractedCalls.map(c => c.method);
  const expectedMethods = new Set(task.expected_tools.map(t => t.method));

  // Unnecessary: real known methods that exist but weren't expected
  const unnecessaryCalls = allExtractedMethods.filter(
    m => knownMethods.has(m) && !expectedMethods.has(m)
  );

  // Hallucinated: methods that DON'T exist in knownMethods
  const hallucinatedCalls = allExtractedMethods.filter(
    m => !knownMethods.has(m)
  );

  const hallucinationRate = extractedCalls.length === 0 ? 0
    : hallucinatedCalls.length / extractedCalls.length;

  return {
    task,
    model,
    generatedCode,
    rawResponse,
    extractedCalls,
    toolMatches,
    codePatternResults: hasCodePatterns ? codePatternResults : undefined,
    metrics: {
      toolPrecision,
      toolRecall,
      taskPassed,
      toolSelectionAccuracy,
      argAccuracy,
      unnecessaryCalls,
      hallucinatedCalls,
      hallucinationRate,
    },
    llmLatencyMs,
    tokenUsage,
    error,
  };
}
