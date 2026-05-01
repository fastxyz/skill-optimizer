import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ResolvedWorkbenchCase } from '../types.js';

export const MCPORTER_CONFIG_CONTAINER_PATH = '/work/mcporter.json';

export function writeWorkbenchMcpConfig(source: ResolvedWorkbenchCase, workDir: string): string | undefined {
  if (Object.keys(source.mcpServers).length === 0) {
    return undefined;
  }

  const configPath = join(workDir, 'mcporter.json');
  writeFileSync(configPath, `${JSON.stringify({
    imports: [],
    mcpServers: source.mcpServers,
  }, null, 2)}\n`, 'utf-8');
  writeWorkbenchMcpCommand(workDir);
  return configPath;
}

function writeWorkbenchMcpCommand(workDir: string): void {
  const binDir = join(workDir, 'bin');
  const commandPath = join(binDir, 'mcp');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(commandPath, [
    '#!/bin/sh',
    'export MCPORTER_CONFIG="${MCPORTER_CONFIG:-/work/mcporter.json}"',
    'exec /app/node_modules/.bin/mcporter --config "$MCPORTER_CONFIG" --root /work "$@"',
    '',
  ].join('\n'), 'utf-8');
  chmodSync(commandPath, 0o755);
}
