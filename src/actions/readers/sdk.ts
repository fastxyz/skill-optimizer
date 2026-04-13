import type { DiscoveryOptions } from '../../discovery/types.js';
import { discoverSdkSurfaceFromSources } from '../../discovery/sdk.js';
import type { ActionDefinition } from '../types.js';

export function readSdkActionsFromSources(sources: string[], options: DiscoveryOptions = {}): ActionDefinition[] {
  const snapshot = discoverSdkSurfaceFromSources(sources, options);
  return snapshot.actions.map((action) => ({
    key: action.name,
    name: action.name,
    description: action.description,
    args: action.args,
    source: action.source,
  }));
}
