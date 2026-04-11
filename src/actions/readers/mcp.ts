import type { DiscoveryOptions } from '../../discovery/types.js';
import { discoverMcpSurfaceFromSources } from '../../discovery/mcp.js';
import type { ActionDefinition } from '../types.js';

export function readMcpActionsFromSources(sources: string[], options: DiscoveryOptions = {}): ActionDefinition[] {
  const snapshot = discoverMcpSurfaceFromSources(sources, options);
  return snapshot.actions.map((action) => ({
    key: action.name,
    name: action.name,
    description: action.description,
    args: action.args,
    source: action.source,
  }));
}
