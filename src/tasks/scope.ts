import type { ActionDefinition } from '../actions/types.js';

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

export function resolveScope(
  actions: ActionDefinition[],
  scope: ScopeConfig,
): { inScope: ActionDefinition[]; outOfScope: ActionDefinition[] } {
  const include = scope.include.length === 0 ? ['*'] : scope.include;
  const exclude = scope.exclude ?? [];

  const inScope: ActionDefinition[] = [];
  const outOfScope: ActionDefinition[] = [];

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
