import { readFileSync } from 'node:fs';

import { buildSurfaceSnapshot, loadProjectConfig } from '../project/index.js';

import type { DiscoveredTaskSurface } from './types.js';

export async function discoverTaskSurface(configPath: string): Promise<DiscoveredTaskSurface> {
  const project = await loadProjectConfig(configPath);
  const skillPath = project.target.skill?.source;
  if (!skillPath) {
    throw new Error('Project config must define target.skill for task generation');
  }

  let skillMarkdown: string;
  try {
    skillMarkdown = readFileSync(skillPath, 'utf-8');
  } catch (error) {
    throw new Error(`Could not read skill markdown from ${skillPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    project,
    skillMarkdown,
    skillPath,
    snapshot: buildSurfaceSnapshot(project),
  };
}
