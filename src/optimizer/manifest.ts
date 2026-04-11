import { loadProjectConfig, toOptimizeManifest } from '../project/index.js';

import type { ResolvedOptimizeManifest } from './types.js';

export function loadOptimizeManifest(configPath: string): ResolvedOptimizeManifest {
  const project = loadProjectConfig(configPath);
  return toOptimizeManifest(project);
}
