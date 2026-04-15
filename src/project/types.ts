import type {
  AgenticConfig,
  BenchmarkSurface,
  CliSurfaceConfig,
  LLMConfig,
  McpSurfaceConfig,
  ModelConfig,
  OutputConfig,
  SdkLanguage,
  SdkSurfaceConfig,
  SkillConfig,
} from '../benchmark/types.js';
import type { ActionArgSchema, ActionCatalog, ActionDefinition } from '../actions/types.js';

export interface ProjectTaskGenerationConfig {
  enabled?: boolean;
  maxTasks?: number;
  seed?: number;
  outputDir?: string;
}

export interface ProjectDiscoveryConfig {
  mode?: 'auto' | 'manifest';
  sources?: string[];
  fallbackManifest?: string;
  language?: SdkLanguage;
}

export interface ProjectScopeConfig {
  include?: string[];
  exclude?: string[];
}

export interface ProjectTargetConfig {
  surface: BenchmarkSurface;
  repoPath?: string;
  skill?: string | SkillConfig;
  discovery?: ProjectDiscoveryConfig;
  sdk?: Pick<SdkSurfaceConfig, 'language' | 'style' | 'apiSurface'> & {
    entrypoints?: string[];
  };
  cli?: CliSurfaceConfig;
  mcp?: McpSurfaceConfig;
  scope?: ProjectScopeConfig;
}

export interface ProjectBenchmarkVerdictConfig {
  perModelFloor?: number;
  targetWeightedAverage?: number;
}

export interface ProjectBenchmarkConfig {
  format?: LLMConfig['format'];
  baseUrl?: string;
  authMode?: LLMConfig['authMode'];
  apiKeyEnv?: string;
  timeout?: number;
  headers?: Record<string, string>;
  models: ModelConfig[];
  tasks?: string;
  surfaceSnapshot?: string;
  taskGeneration?: ProjectTaskGenerationConfig;
  output?: OutputConfig;
  agentic?: AgenticConfig;
  verdict?: ProjectBenchmarkVerdictConfig;
}

export interface ProjectOptimizeConfig {
  enabled?: boolean;
  mode?: 'stable-surface' | 'surface-changing';
  model?: string;
  authMode?: LLMConfig['authMode'];
  apiKeyEnv?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  allowedPaths?: string[];
  validation?: string[];
  requireCleanGit?: boolean;
  maxIterations?: number;
  stabilityWindow?: number;
  minImprovement?: number;
  reportContextMaxBytes?: number;
}

export interface ProjectConfig {
  name: string;
  target: ProjectTargetConfig;
  benchmark: ProjectBenchmarkConfig;
  optimize?: ProjectOptimizeConfig;
}

export interface ResolvedProjectTaskGenerationConfig {
  enabled: boolean;
  maxTasks: number;
  seed: number;
  outputDir: string;
}

export interface ResolvedProjectTargetConfig {
  surface: BenchmarkSurface;
  repoPath: string;
  skill?: SkillConfig;
  discovery?: {
    mode: 'auto' | 'manifest';
    sources: string[];
    fallbackManifest?: string;
    language?: SdkLanguage;
  };
  sdk?: Pick<SdkSurfaceConfig, 'language' | 'style' | 'apiSurface'> & {
    entrypoints: string[];
  };
  cli?: CliSurfaceConfig;
  mcp?: McpSurfaceConfig;
  scope: { include: string[]; exclude: string[] };
}

export interface ResolvedProjectBenchmarkConfig {
  format: LLMConfig['format'];
  baseUrl?: string;
  authMode: NonNullable<LLMConfig['authMode']>;
  apiKeyEnv?: string;
  timeout: number;
  headers?: Record<string, string>;
  models: ModelConfig[];
  tasks?: string;
  surfaceSnapshot?: string;
  taskGeneration: ResolvedProjectTaskGenerationConfig;
  output: { dir: string };
  agentic?: AgenticConfig;
  verdict: { perModelFloor: number; targetWeightedAverage: number };
}

export interface ResolvedProjectOptimizeConfig {
  enabled: boolean;
  mode: 'stable-surface' | 'surface-changing';
  model: string;
  authMode: NonNullable<LLMConfig['authMode']>;
  apiKeyEnv?: string;
  thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  allowedPaths: string[];
  validation: string[];
  requireCleanGit: boolean;
  maxIterations: number;
  stabilityWindow: number;
  minImprovement: number;
  reportContextMaxBytes: number;
}

export interface ResolvedProjectConfig {
  configPath: string;
  configDir: string;
  name: string;
  target: ResolvedProjectTargetConfig;
  benchmark: ResolvedProjectBenchmarkConfig;
  optimize?: ResolvedProjectOptimizeConfig;
}

export type SurfaceSnapshotAction = Omit<ActionDefinition, 'key'>;

export interface SurfaceSnapshot extends Omit<ActionCatalog, 'actions'> {
  surface: BenchmarkSurface;
  actions: SurfaceSnapshotAction[];
}

export interface ParsedModelRef {
  provider: string;
  model: string;
}

export function parseModelRef(modelRef: string): ParsedModelRef {
  const slashIndex = modelRef.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Model references must be in provider/model form, got "${modelRef}"`);
  }

  return {
    provider: modelRef.slice(0, slashIndex),
    model: modelRef.slice(slashIndex + 1),
  };
}

export function isSdkLanguage(value: string): value is SdkLanguage {
  return value === 'typescript' || value === 'python' || value === 'rust';
}
