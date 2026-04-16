export { discoverCliSurfaceFromSources } from './cli.js';
export { discoverMcpSurfaceFromSources } from './mcp.js';
export { discoverPromptSurfaceFromContent, discoverPromptSurfaceFromSources } from './prompt.js';
export { discoverSdkSurfaceFromSources } from './sdk.js';

export type {
  CliDiscoverySnapshot,
  DiscoveryOptions,
  DiscoverySnapshot,
  DiscoveredAction,
  DiscoveredActionArg,
  McpDiscoverySnapshot,
  SdkDiscoverySnapshot,
} from './types.js';

export type {
  PromptCapability,
  PromptDiscoverySnapshot,
  PromptPhase,
} from './prompt.js';
