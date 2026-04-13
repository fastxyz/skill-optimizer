import { loadCliCommands, loadMcpTools } from '../benchmark/config.js';
import type { ResolvedProjectConfig } from '../project/types.js';
import type { ActionCatalog } from './types.js';
import { readCliActionsFromSources } from './readers/cli.js';
import { readMcpActionsFromSources } from './readers/mcp.js';
import { readSdkActionsFromSources } from './readers/sdk.js';

export function discoverActions(project: ResolvedProjectConfig): ActionCatalog {
  const discoveryMode = project.target.discovery?.mode ?? 'auto';
  const discoverySources = project.target.discovery?.sources ?? [];
  const shouldUseDiscovery = discoveryMode !== 'manifest' && discoverySources.length > 0;

  if (project.target.surface === 'sdk') {
    if (shouldUseDiscovery) {
      const actions = readSdkActionsFromSources(discoverySources);
      if (actions.length > 0) {
        return {
          surface: 'sdk',
          actions,
        };
      }

      if ((project.target.sdk?.apiSurface?.length ?? 0) === 0) {
        throw new Error(`SDK discovery found 0 actions from configured sources: ${discoverySources.join(', ')}`);
      }
    }

    return {
      surface: 'sdk',
      actions: (project.target.sdk?.apiSurface ?? []).map((name) => ({
        key: name,
        name,
        args: [],
        source: 'sdk.apiSurface',
      })),
    };
  }

  if (project.target.surface === 'cli') {
    if (shouldUseDiscovery) {
      const actions = readCliActionsFromSources(discoverySources);
      if (actions.length > 0) {
        return {
          surface: 'cli',
          actions,
        };
      }

      if (!project.target.cli?.commands) {
        throw new Error(`CLI discovery found 0 actions from configured sources: ${discoverySources.join(', ')}`);
      }
    }

    const commands = project.target.cli ? loadCliCommands(project.target.cli.commands) : [];
    return {
      surface: 'cli',
      actions: commands.map((command) => ({
        key: command.command,
        name: command.command,
        description: command.description,
        args: (command.options ?? []).map((option) => ({
          name: normalizeCliArgName(option.name),
          required: false,
          type: option.takesValue ? 'string' : 'boolean',
          description: option.description,
        })),
        source: 'cli.commands',
      })),
    };
  }

  if (shouldUseDiscovery) {
    const actions = readMcpActionsFromSources(discoverySources);
    if (actions.length > 0) {
      return {
        surface: 'mcp',
        actions,
      };
    }

    if (!project.target.mcp?.tools) {
      throw new Error(`MCP discovery found 0 actions from configured sources: ${discoverySources.join(', ')}`);
    }
  }

  const tools = project.target.mcp ? loadMcpTools(project.target.mcp.tools) : [];
  return {
    surface: 'mcp',
    actions: tools.map((tool) => ({
      key: tool.function.name,
      name: tool.function.name,
      description: tool.function.description,
      args: Object.entries(tool.function.parameters?.properties ?? {}).map(([name, schema]) => ({
        name,
        required: (tool.function.parameters?.required ?? []).includes(name),
        type: typeof schema === 'object' && schema && 'type' in schema ? String((schema as { type?: unknown }).type ?? '') || undefined : undefined,
        description: typeof schema === 'object' && schema && 'description' in schema ? String((schema as { description?: unknown }).description ?? '') || undefined : undefined,
      })),
      source: 'mcp.tools',
    })),
  };
}

function normalizeCliArgName(name: string): string {
  return name.replace(/^-+/, '');
}
