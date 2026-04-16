import type { McpToolDefinition } from '../types.js';

const PROVIDER_TOOL_NAME_PATTERN = /[^a-zA-Z0-9_-]/g;

export interface ToolNameAliasCodec {
  tools: McpToolDefinition[];
  toCanonical(name: string): string;
  toProvider(name: string): string;
}

export function createToolNameAliasCodec(
  tools: McpToolDefinition[],
): ToolNameAliasCodec {
  const usedProviderNames = new Set<string>();
  const canonicalToProvider = new Map<string, string>();
  const providerToCanonical = new Map<string, string>();

  const aliasedTools = tools.map((tool) => {
    const canonicalName = tool.function.name;
    let providerName = sanitizeToolName(canonicalName);

    if (providerName.length === 0) {
      providerName = 'tool';
    }

    if (usedProviderNames.has(providerName)) {
      const baseName = providerName;
      let suffix = 1;
      while (usedProviderNames.has(`${baseName}__${suffix}`)) {
        suffix += 1;
      }
      providerName = `${baseName}__${suffix}`;
    }

    usedProviderNames.add(providerName);
    canonicalToProvider.set(canonicalName, providerName);
    providerToCanonical.set(providerName, canonicalName);

    if (providerName === canonicalName) {
      return tool;
    }

    return {
      ...tool,
      function: {
        ...tool.function,
        name: providerName,
      },
    };
  });

  return {
    tools: aliasedTools,
    toCanonical(name: string) {
      return providerToCanonical.get(name) ?? name;
    },
    toProvider(name: string) {
      return canonicalToProvider.get(name) ?? name;
    },
  };
}

function sanitizeToolName(name: string): string {
  return name.replace(PROVIDER_TOOL_NAME_PATTERN, '_');
}
