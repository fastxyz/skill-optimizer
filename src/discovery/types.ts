import type { ActionArgSchema } from '../actions/types.js';

export interface DiscoveredAction {
  name: string;
  description?: string;
  args: ActionArgSchema[];
  source?: string;
}

export interface DiscoverySnapshot {
  surface: 'sdk' | 'cli' | 'mcp';
  actions: DiscoveredAction[];
  sources: string[];
}

export interface McpDiscoverySnapshot extends DiscoverySnapshot {
  surface: 'mcp';
}

export interface CliDiscoverySnapshot extends DiscoverySnapshot {
  surface: 'cli';
}

export interface SdkDiscoverySnapshot extends DiscoverySnapshot {
  surface: 'sdk';
}

export interface DiscoveryOptions {
  baseDir?: string;
}
