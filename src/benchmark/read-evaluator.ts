export interface ReadEvaluationResult {
  passed: boolean;
  recall: number;
  precision: number;
  matched: string[];
  missing: string[];
  extra: string[];
  actual: string[];
}

export function evaluateExpectedReads(expectedReads: string[], actualReads: string[]): ReadEvaluationResult {
  const expectedSet = new Set(expectedReads);
  const actualSet = new Set(actualReads);

  const matched = [...expectedSet].filter((path) => actualSet.has(path));
  const missing = [...expectedSet].filter((path) => !actualSet.has(path));
  const extra = [...actualSet].filter((path) => !expectedSet.has(path));

  const recall = expectedSet.size === 0 ? 1.0 : matched.length / expectedSet.size;
  const precision = actualSet.size === 0
    ? (expectedSet.size === 0 ? 1.0 : 0.0)
    : matched.length / actualSet.size;

  return {
    passed: missing.length === 0,
    recall,
    precision,
    matched,
    missing,
    extra,
    actual: actualReads,
  };
}
