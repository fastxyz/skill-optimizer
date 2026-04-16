import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { SurfaceSnapshot } from '../project/types.js';
import type { ActionArgSchema, ActionCatalog, ActionDefinition } from './types.js';

export const ACTION_SNAPSHOT_VERSION = 1;

export interface ActionSnapshotArtifact {
  version: typeof ACTION_SNAPSHOT_VERSION;
  catalog: ActionCatalog;
}

function invalidSnapshot(snapshotPath: string, detail: string): never {
  throw new Error(`Invalid action snapshot file: ${snapshotPath} (${detail})`);
}

function validateActionArgs(snapshotPath: string, actionIndex: number, args: unknown): ActionArgSchema[] {
  if (!Array.isArray(args)) {
    invalidSnapshot(snapshotPath, `catalog.actions[${actionIndex}].args must be an array`);
  }

  return args.map((arg, argIndex) => {
    const path = `catalog.actions[${actionIndex}].args[${argIndex}]`;
    if (!arg || typeof arg !== 'object') {
      invalidSnapshot(snapshotPath, `${path} must be an object`);
    }
    const candidate = arg as Partial<ActionArgSchema>;
    if (typeof candidate.name !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.name must be a string`);
    }
    if (typeof candidate.required !== 'boolean') {
      invalidSnapshot(snapshotPath, `${path}.required must be a boolean`);
    }
    if (candidate.type !== undefined && typeof candidate.type !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.type must be a string when provided`);
    }
    if (candidate.description !== undefined && typeof candidate.description !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.description must be a string when provided`);
    }

    return {
      name: candidate.name,
      required: candidate.required,
      type: candidate.type,
      description: candidate.description,
    };
  });
}

function validateCatalogActions(snapshotPath: string, actions: unknown): ActionDefinition[] {
  if (!Array.isArray(actions)) {
    invalidSnapshot(snapshotPath, 'catalog.actions must be an array');
  }

  return actions.map((action, actionIndex) => {
    const path = `catalog.actions[${actionIndex}]`;
    if (!action || typeof action !== 'object') {
      invalidSnapshot(snapshotPath, `${path} must be an object`);
    }
    const candidate = action as Partial<ActionDefinition>;
    if (typeof candidate.key !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.key must be a string`);
    }
    if (typeof candidate.name !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.name must be a string`);
    }
    if (candidate.description !== undefined && typeof candidate.description !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.description must be a string when provided`);
    }
    if (candidate.source !== undefined && typeof candidate.source !== 'string') {
      invalidSnapshot(snapshotPath, `${path}.source must be a string when provided`);
    }

    return {
      key: candidate.key,
      name: candidate.name,
      description: candidate.description,
      args: validateActionArgs(snapshotPath, actionIndex, candidate.args),
      source: candidate.source,
    };
  });
}

export function normalizeActionArgSchema(args: ActionArgSchema[]): ActionArgSchema[] {
  return [...args]
    .map((arg) => ({
      name: arg.name,
      required: Boolean(arg.required),
      type: arg.type,
      description: arg.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeActionDefinition(action: ActionDefinition): ActionDefinition {
  return {
    ...action,
    key: action.key.trim(),
    args: normalizeActionArgSchema(action.args),
  };
}

export function normalizeActionCatalog(catalog: ActionCatalog): ActionCatalog {
  return {
    surface: catalog.surface,
    actions: catalog.actions.map(normalizeActionDefinition),
  };
}

export function writeActionSnapshotFile(snapshotPath: string, catalog: ActionCatalog): void {
  const artifact: ActionSnapshotArtifact = {
    version: ACTION_SNAPSHOT_VERSION,
    catalog: normalizeActionCatalog(catalog),
  };
  writeFileSync(snapshotPath, JSON.stringify(artifact, null, 2), 'utf-8');
}

export function loadActionSnapshotFile(snapshotPath: string): ActionSnapshotArtifact {
  if (!existsSync(snapshotPath)) {
    throw new Error(`Action snapshot file not found: ${snapshotPath}`);
  }

  const raw = readFileSync(snapshotPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: any) {
    invalidSnapshot(snapshotPath, `invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    invalidSnapshot(snapshotPath, 'expected object root');
  }

  const candidate = parsed as Partial<ActionSnapshotArtifact>;
  if (typeof candidate.version !== 'number') {
    invalidSnapshot(snapshotPath, 'version must be a number');
  }
  if (candidate.version !== ACTION_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported action snapshot version ${candidate.version}; expected ${ACTION_SNAPSHOT_VERSION}`);
  }

  if (!candidate.catalog || typeof candidate.catalog !== 'object') {
    invalidSnapshot(snapshotPath, 'catalog must be an object');
  }

  const catalog = candidate.catalog as Partial<ActionCatalog>;
  if (catalog.surface !== 'sdk' && catalog.surface !== 'cli' && catalog.surface !== 'mcp' && catalog.surface !== 'prompt') {
    invalidSnapshot(snapshotPath, 'catalog.surface must be one of sdk|cli|mcp|prompt');
  }
  const validatedActions = validateCatalogActions(snapshotPath, catalog.actions);

  return {
    version: ACTION_SNAPSHOT_VERSION,
    catalog: normalizeActionCatalog({
      surface: catalog.surface,
      actions: validatedActions,
    }),
  };
}

export function fromSurfaceSnapshot(snapshot: SurfaceSnapshot): ActionCatalog {
  return normalizeActionCatalog({
    surface: snapshot.surface,
    actions: snapshot.actions.map((action) => ({
      key: action.name,
      name: action.name,
      description: action.description,
      args: normalizeActionArgSchema(action.args),
      source: action.source,
    })),
  });
}

export function toSurfaceSnapshot(catalog: ActionCatalog): SurfaceSnapshot {
  return {
    surface: catalog.surface,
    actions: catalog.actions.map((action) => ({
      name: action.name,
      description: action.description,
      args: normalizeActionArgSchema(action.args),
      source: action.source,
    })),
  };
}
