import { existsSync, readFileSync } from 'node:fs';

import type { SurfaceSnapshot } from './types.js';
import type { ResolvedProjectConfig } from './types.js';
import type { McpToolDefinition } from '../benchmark/types.js';
import { discoverActions } from '../actions/discover.js';
import { loadActionSnapshotFile, toSurfaceSnapshot } from '../actions/snapshot.js';

export function buildSurfaceSnapshot(project: ResolvedProjectConfig): SurfaceSnapshot {
  if (project.benchmark.surfaceSnapshot) {
    return loadSurfaceSnapshotFile(project.benchmark.surfaceSnapshot);
  }

  return toSurfaceSnapshot(discoverActions(project));
}

function normalizeCliArgName(name: string): string {
  return name.replace(/^-+/, '');
}

export function loadSurfaceSnapshotFile(snapshotPath: string): SurfaceSnapshot {
  if (!existsSync(snapshotPath)) {
    throw new Error(`Surface snapshot file not found: ${snapshotPath}`);
  }

  const raw = readFileSync(snapshotPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Invalid surface snapshot file: ${snapshotPath} (invalid JSON: ${error instanceof Error ? error.message : String(error)})`);
  }

  if (!isActionSnapshotArtifactShape(parsed)) {
    if (
      parsed
      && typeof parsed === 'object'
      && 'surface' in parsed
      && 'actions' in parsed
    ) {
      throw new Error(
        `Snapshot file uses an old format — delete .skill-optimizer/ and re-run the benchmark to regenerate.`,
      );
    }
    throw new Error(`Invalid surface snapshot file: ${snapshotPath}`);
  }

  return normalizeCliArgs(toSurfaceSnapshot(loadActionSnapshotFile(snapshotPath).catalog));
}

function isActionSnapshotArtifactShape(value: unknown): value is { version: number; catalog: { surface: string; actions: unknown[] } } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    catalog?: {
      surface?: unknown;
      actions?: unknown;
    };
  };

  return typeof candidate.version === 'number'
    && Boolean(candidate.catalog)
    && typeof candidate.catalog === 'object'
    && ['sdk', 'cli', 'mcp'].includes(String(candidate.catalog.surface))
    && Array.isArray(candidate.catalog.actions);
}

function normalizeCliArgs(snapshot: SurfaceSnapshot): SurfaceSnapshot {
  if (snapshot.surface !== 'cli') {
    return snapshot;
  }

  return {
    ...snapshot,
    actions: snapshot.actions.map((action) => ({
      ...action,
      args: action.args.map((arg) => ({
        ...arg,
        name: normalizeCliArgName(arg.name),
      })),
    })),
  };
}

export function buildMcpToolDefinitionsFromSnapshot(snapshot: SurfaceSnapshot): McpToolDefinition[] {
  if (snapshot.surface !== 'mcp') {
    throw new Error(`Cannot build MCP tool definitions from surface ${snapshot.surface}`);
  }

  return snapshot.actions.map((action) => ({
    type: 'function',
    function: {
      name: action.name,
      description: action.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          action.args.map((arg) => [
            arg.name,
            {
              ...(arg.schema ?? {}),
              ...(arg.type ? { type: arg.type } : {}),
              ...(arg.description ? { description: arg.description } : {}),
            },
          ]),
        ),
        required: action.args.filter((arg) => arg.required).map((arg) => arg.name),
      },
    },
  }));
}
