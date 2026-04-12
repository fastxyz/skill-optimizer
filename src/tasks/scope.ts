export interface ScopeConfig {
  include: string[];
  exclude: string[];
}

export function matchesGlob(name: string, pattern: string): boolean {
  // Single operator '*' matches any sequence of characters including separators.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(name);
}

function matchesAny(name: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesGlob(name, p));
}

export function resolveScope<T extends { name: string }>(
  actions: T[],
  scope: ScopeConfig,
): { inScope: T[]; outOfScope: T[] } {
  const include = scope.include.length === 0 ? ['*'] : scope.include;
  const exclude = scope.exclude;

  const inScope: T[] = [];
  const outOfScope: T[] = [];

  for (const action of actions) {
    const included = matchesAny(action.name, include);
    const excluded = exclude.length > 0 && matchesAny(action.name, exclude);
    if (included && !excluded) {
      inScope.push(action);
    } else {
      outOfScope.push(action);
    }
  }

  return { inScope, outOfScope };
}
