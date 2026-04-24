import { buildSurfaceSnapshot, loadProjectConfig } from '../project/index.js';
import { fetchSkill } from '../benchmark/skill-fetcher.js';

import type { DiscoveredTaskSurface } from './types.js';

export async function discoverTaskSurface(configPath: string): Promise<DiscoveredTaskSurface> {
  const project = await loadProjectConfig(configPath);
  const skillPath = project.target.skill?.source;
  if (!skillPath) {
    throw new Error('Project config must define target.skill for task generation');
  }

  let skillMarkdown: string;
  let skillReferences: DiscoveredTaskSurface['skillReferences'];
  try {
    const skill = await fetchSkill(project.target.skill);
    if (!skill) {
      throw new Error('fetchSkill returned no content');
    }
    skillMarkdown = skill.content;
    skillReferences = skill.references;
  } catch (error) {
    throw new Error(`Could not read skill markdown from ${skillPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    project,
    skillMarkdown,
    skillPath,
    skillReferences,
    snapshot: buildSurfaceSnapshot(project),
  };
}
