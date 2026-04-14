import { loadProjectConfig, toOptimizeManifest } from '../project/index.js';

import type { ResolvedOptimizeManifest } from './types.js';

export async function loadOptimizeManifest(configPath: string): Promise<ResolvedOptimizeManifest> {
  const project = await loadProjectConfig(configPath);
  return toOptimizeManifest(project);
}
