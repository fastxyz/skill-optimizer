export interface DiscoveredActionArg {
  name: string;
  required: boolean;
  type?: string;
  description?: string;
}

export interface DiscoveredAction {
  name: string;
  description?: string;
  args: DiscoveredActionArg[];
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
