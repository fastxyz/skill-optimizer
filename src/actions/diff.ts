import { normalizeActionArgSchema } from './snapshot.js';
import type { ActionCatalog, ActionDefinition } from './types.js';

export interface ChangedAction {
  before: ActionDefinition;
  after: ActionDefinition;
}

export interface ActionCatalogDiff {
  added: ActionDefinition[];
  removed: ActionDefinition[];
  changed: ChangedAction[];
}

function schemaFingerprint(action: ActionDefinition): string {
  return JSON.stringify(normalizeActionArgSchema(action.args));
}

function indexByKey(actions: ActionDefinition[], side: 'before' | 'after'): Map<string, ActionDefinition> {
  const indexed = new Map<string, ActionDefinition>();
  for (const action of actions) {
    const canonicalKey = action.key.trim();
    if (indexed.has(canonicalKey)) {
      throw new Error(`Duplicate action key in ${side} catalog: ${canonicalKey}`);
    }
    indexed.set(canonicalKey, {
      ...action,
      key: canonicalKey,
    });
  }
  return indexed;
}

export function diffActionCatalog(before: ActionCatalog, after: ActionCatalog): ActionCatalogDiff {
  const beforeByKey = indexByKey(before.actions, 'before');
  const afterByKey = indexByKey(after.actions, 'after');

  const added: ActionDefinition[] = [];
  const removed: ActionDefinition[] = [];
  const changed: ChangedAction[] = [];

  for (const [key, afterAction] of afterByKey.entries()) {
    const beforeAction = beforeByKey.get(key);
    if (!beforeAction) {
      added.push(afterAction);
      continue;
    }

    if (schemaFingerprint(beforeAction) !== schemaFingerprint(afterAction)) {
      changed.push({ before: beforeAction, after: afterAction });
    }
  }

  for (const [key, beforeAction] of beforeByKey.entries()) {
    if (!afterByKey.has(key)) {
      removed.push(beforeAction);
    }
  }

  return { added, removed, changed };
}
