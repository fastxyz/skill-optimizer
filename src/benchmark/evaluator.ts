import type {
  ExpectedTool,
  ExtractedCall,
  ToolMatch,
  TaskDefinition,
  TaskResult,
  ModelConfig,
  TokenUsage,
} from './types.js';
import { getExpectedActionName, getExpectedActions } from './types.js';

// ── Argument matching ──────────────────────────────────────────────────────

/**
 * Resolve an argument value from an extracted call's args, with positional fallback.
 *
 * CLI commands often take positional arguments (e.g. `fast account set-default myname`)
 * which the extractor records as `_positional_0`, `_positional_1`, etc. When the expected
 * args use the semantic name (e.g. `{name: "myname"}`), we look for the value in positionals
 * as a fallback so that positional and named-flag invocations both match.
 */
function resolveArgValue(args: Record<string, unknown>, key: string, expectedValue: unknown): unknown {
  const direct = args[key];
  if (direct !== undefined) return direct;
  // Positional fallback: if expected is a plain string, check _positional_N entries
  if (typeof expectedValue === 'string') {
    for (const [k, v] of Object.entries(args)) {
      if (k.startsWith('_positional_') && v === expectedValue) {
        return v;
      }
    }
  }
  return undefined;
}

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

function stringifyExpected(expected: unknown): string {
  if (typeof expected === 'string') return expected;
  try {
    return JSON.stringify(expected);
  } catch {
    return String(expected);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchExpectedValue(
  expected: unknown,
  got: unknown,
  path: string,
  argResults: Record<string, { expected: string; got: unknown; match: boolean }>,
): boolean {
  // Array matching: positional match up to expected.length.
  // Extra elements in `got` beyond expected.length are ignored (subset matching).
  // Missing elements in `got` (got[i] is undefined) will fail the scalar/object match.
  if (Array.isArray(expected)) {
    if (!Array.isArray(got)) {
      argResults[path] = { expected: stringifyExpected(expected), got, match: false };
      return false;
    }

    let allMatch = true;
    for (let i = 0; i < expected.length; i++) {
      const childPath = `${path}[${i}]`;
      if (!matchExpectedValue(expected[i], got[i], childPath, argResults)) {
        allMatch = false;
      }
    }
    return allMatch;
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(got)) {
      argResults[path] = { expected: stringifyExpected(expected), got, match: false };
      return false;
    }

    let allMatch = true;
    for (const [key, value] of Object.entries(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      if (!matchExpectedValue(value, got[key], childPath, argResults)) {
        allMatch = false;
      }
    }
    return allMatch;
  }

  const match = matchArgValue(expected, got);
  argResults[path] = {
    expected: stringifyExpected(expected),
    got,
    match,
  };
  return match;
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
    const expectedMethod = getExpectedActionName(expected);
    // If there are args to check, try to find a perfect match (method + args) first.
    // Otherwise, find the first unused extracted call that matches the method name.
    const hasExpectedArgs = expected.args && Object.keys(expected.args).length > 0;

    if (hasExpectedArgs) {
      // Two-pass strategy:
      // Pass 1: look for a perfect match (method name AND all args match).
      let perfectMatchIndex = -1;
      for (let i = 0; i < extractedCalls.length; i++) {
        if (usedIndices.has(i)) continue;
        if (extractedCalls[i].method !== expectedMethod) continue;
        // Check args
        const trialArgResults: Record<string, { expected: string; got: unknown; match: boolean }> = {};
        let allArgsMatch = true;
        for (const [key, expectedValue] of Object.entries(expected.args!)) {
          if (!matchExpectedValue(expectedValue, resolveArgValue(extractedCalls[i].args, key, expectedValue), key, trialArgResults)) {
            allArgsMatch = false;
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
          matchExpectedValue(expectedValue, resolveArgValue(found.args, key, expectedValue), key, argResults);
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
        if (extractedCalls[i].method === expectedMethod) {
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
      let allArgsMatch = true;
      for (const [key, expectedValue] of Object.entries(expected.args!)) {
        if (!matchExpectedValue(expectedValue, resolveArgValue(found.args, key, expectedValue), key, argResults)) {
          allArgsMatch = false;
        }
      }
      return {
        expected,
        found,
        methodFound: true,
        argsCorrect: allArgsMatch,
        matched: allArgsMatch,
        argResults,
      } satisfies ToolMatch;
    }

    // No args to check — find the first unused extracted call matching the method name.
    let foundIndex = -1;
    for (let i = 0; i < extractedCalls.length; i++) {
      if (usedIndices.has(i)) continue;
        if (extractedCalls[i].method === expectedMethod) {
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

// ── Call resolution from bindings + task expectations ───────────────────────

/**
 * Resolve raw extracted calls (e.g. 'f.setup') into typed calls (e.g. 'FastClient.setup')
 * using variable bindings from the extractor and type prefixes from task expected actions.
 *
 * Algorithm:
 * 1. Collect type prefixes from expected tools (e.g. 'FastClient' from 'FastClient.setup')
 * 2. Collect standalone method names (e.g. 'fast' from { method: 'fast' })
 * 3. Build inference map: if task expects standalone 'fast' AND 'FastClient.*',
 *    and bindings show f ← fast, then fast → FastClient
 * 4. Resolve all raw calls through this map
 */
function resolveCallsFromBindings(
  extractedCalls: ExtractedCall[],
  bindings: Map<string, string>,
  expectedTools: ExpectedTool[],
): ExtractedCall[] {
  // 1. Collect type prefixes from expected tools.
  const expectedPrefixes = new Set<string>();
  for (const tool of expectedTools) {
    const expectedMethod = getExpectedActionName(tool);
    if (expectedMethod.includes('.')) {
      expectedPrefixes.add(expectedMethod.split('.')[0]);
    }
  }

  // 2. Build source-to-type map for direct class bindings and inferred factory returns.
  const sourceToType = new Map<string, string>();

  // Direct class matches (e.g. allset ← AllSetProvider, AllSetProvider is a prefix)
  for (const [, source] of bindings) {
    if (expectedPrefixes.has(source)) {
      sourceToType.set(source, source);
    }
  }

  // Inferred matches (e.g. fast is a factory, or wallet is an instance-returning method).
  const expectedPrefixMethods = new Map<string, Set<string>>(); // prefix → set of method names
  for (const tool of expectedTools) {
    const expectedMethod = getExpectedActionName(tool);
    const dotIdx = expectedMethod.indexOf('.');
    if (dotIdx !== -1) {
      const prefix = expectedMethod.slice(0, dotIdx);
      const method = expectedMethod.slice(dotIdx + 1);
      if (!expectedPrefixMethods.has(prefix)) expectedPrefixMethods.set(prefix, new Set());
      expectedPrefixMethods.get(prefix)!.add(method);
    }
  }

  const allSources = new Set(bindings.values());

  for (const source of allSources) {
    if (sourceToType.has(source)) continue;

    const varsFromSource: string[] = [];
    for (const [varName, bindingSource] of bindings) {
      if (bindingSource === source) varsFromSource.push(varName);
    }

    // For each prefix, check if any variable from this source has calls
    // whose method names match the expected methods for that prefix
    for (const [prefix, methodNames] of expectedPrefixMethods) {
      if (sourceToType.has(source)) break;
      for (const varName of varsFromSource) {
        const callsOnVar = extractedCalls
          .filter(c => c.method.startsWith(varName + '.'))
          .map(c => c.method.slice(varName.length + 1));
        // Match if at least one method called on this var matches an expected method for this prefix
        const hasMatchingMethod = callsOnVar.some(m => methodNames.has(m));
        if (hasMatchingMethod) {
          sourceToType.set(source, prefix);
          break;
        }
      }
    }
  }

  // 3. Build var-to-type map
  const varToType = new Map<string, string>();
  for (const [varName, source] of bindings) {
    const resolvedType = sourceToType.get(source);
    if (resolvedType) {
      varToType.set(varName, resolvedType);
    }
  }

  // 4. Resolve each call
  return extractedCalls.map(call => {
    const dotIndex = call.method.indexOf('.');
    if (dotIndex !== -1) {
      const obj = call.method.slice(0, dotIndex);
      const rest = call.method.slice(dotIndex + 1);
      const resolvedType = varToType.get(obj);
      if (resolvedType) {
        return { ...call, method: `${resolvedType}.${rest}` };
      }
    }
    return call;
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
  knownMethods: Set<string>;
  bindings?: Map<string, string>;  // variable → source function/class from extractor
  surface: 'sdk' | 'cli' | 'mcp';
}): TaskResult {
  const {
    task,
    model,
    generatedCode,
    rawResponse,
    llmLatencyMs,
    tokenUsage,
    error,
    knownMethods,
    bindings,
    surface,
  } = params;

  let extractedCalls = params.extractedCalls;
  const expectedActions = getExpectedActions(task);
  if (bindings && bindings.size > 0) {
    extractedCalls = resolveCallsFromBindings(extractedCalls, bindings, expectedActions);
  }

  const toolMatches = matchTools(expectedActions, extractedCalls);

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
    for (const verification of task.verify) {
      if (verification.code_pattern) {
        codePatternResults[verification.code_pattern] = false;
        allCodePatternsPass = false;
      }
    }
  }

  const expectedCount = expectedActions.length;
  const matchedCount = toolMatches.filter((m) => m.matched).length;

  // recall = matched / expected; 1.0 when there are no expectations
  const toolRecall = expectedCount === 0 ? 1.0 : matchedCount / expectedCount;

  // precision = matched / known calls extracted; 0.0 when nothing was extracted
  const knownCallCount = extractedCalls.filter((c) => knownMethods.has(c.method)).length;
  const toolPrecision = knownCallCount === 0 ? 0.0 : matchedCount / knownCallCount;

  const hasCodePatterns = Object.keys(codePatternResults).length > 0;
  const taskPassed =
    matchedCount === expectedCount &&
    (expectedCount > 0 || matchedCount === 0) &&
    (!hasCodePatterns || allCodePatternsPass);

  const methodsFoundCount = toolMatches.filter(m => m.methodFound).length;
  const toolSelectionAccuracy = expectedCount === 0 ? 1.0 : methodsFoundCount / expectedCount;

  const argAccuracy = methodsFoundCount === 0 ? 1.0
    : toolMatches.filter(m => m.methodFound && m.argsCorrect).length / methodsFoundCount;

  const allExtractedMethods = extractedCalls.map(c => c.method);
  const expectedMethods = new Set(expectedActions.map((action) => getExpectedActionName(action)));

  // Collect known class/type prefixes for SDK hallucination filtering (e.g. "FastClient" from "FastClient.setup")
  const sdkPrefixes = new Set<string>();
  for (const m of knownMethods) {
    if (m.includes('.')) {
      sdkPrefixes.add(m.split('.')[0]);
    }
  }

  const unnecessaryCalls = allExtractedMethods.filter(
    m => knownMethods.has(m) && !expectedMethods.has(m)
  );

  const hallucinatedCalls = allExtractedMethods.filter(m => {
    if (knownMethods.has(m)) return false;

    if (surface === 'sdk') {
      // SDK: only dotted calls that look like SDK API usage are hallucinations.
      // Unknown helpers (non-dotted names) should not be flagged.
      const dotIdx = m.indexOf('.');
      if (dotIdx === -1) return false;
      const prefix = m.slice(0, dotIdx);
      return sdkPrefixes.has(prefix);
    }

    // CLI/MCP: unknown command path or tool name is hallucinated.
    return true;
  });

  const hallucinationRate = extractedCalls.length === 0 ? 0
    : hallucinatedCalls.length / extractedCalls.length;

  return {
    task,
    model,
    generatedCode,
    rawResponse,
    extractedCalls,
    actionMatches: toolMatches,
    toolMatches,
    codePatternResults: hasCodePatterns ? codePatternResults : undefined,
    metrics: {
      toolPrecision,
      toolRecall,
      taskPassed,
      toolSelectionAccuracy,
      argAccuracy,
      unnecessaryActions: unnecessaryCalls,
      unnecessaryCalls,
      hallucinatedActions: hallucinatedCalls,
      hallucinatedCalls,
      hallucinationRate,
    },
    llmLatencyMs,
    tokenUsage,
    error,
  };
}
