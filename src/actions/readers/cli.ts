import type { DiscoveryOptions } from '../../discovery/types.js';
import { discoverCliSurfaceFromSources } from '../../discovery/cli.js';
import type { ActionDefinition } from '../types.js';

export function readCliActionsFromSources(sources: string[], options: DiscoveryOptions = {}): ActionDefinition[] {
  const snapshot = discoverCliSurfaceFromSources(sources, options);
  return snapshot.actions.map((action) => ({
    key: action.name,
    name: action.name,
    description: action.description,
    args: action.args.map((arg) => ({
      ...arg,
      name: normalizeCliArgName(arg.name),
    })),
    source: action.source,
  }));
}

function normalizeCliArgName(name: string): string {
  return name.replace(/^-+/, '');
}
