import type { BenchmarkReport, BenchmarkSurface, ModelConfig, ModelSummary } from '../benchmark/types.js';
import type { PiAuthMode } from '../runtime/pi/auth.js';

export type FailureBucketKind = 'missing-tool' | 'bad-args' | 'hallucination' | 'error';
export type StopReason = 'max-iterations' | 'stable';

export interface OptimizeTaskGenerationConfig {
  enabled?: boolean;
  maxGenerated?: number;
  seed?: number;
  outputDir?: string;
}

export interface OptimizeTargetRepo {
  path: string;
  surface: BenchmarkSurface;
  allowedPaths: string[];
  surfacePaths?: string[];
  cleanIgnorePaths?: string[];
  validation: string[];
  requireCleanGit?: boolean;
}

export interface OptimizePolicy {
  mode?: 'stable-surface' | 'surface-changing';
  maxIterations?: number;
  stabilityWindow?: number;
  minImprovement?: number;
  taskGeneration?: OptimizeTaskGenerationConfig;
  perModelFloor?: number;
  targetWeightedAverage?: number;
  models?: ModelConfig[];
}

export interface OptimizeMutationConfig {
  provider: string;
  model: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  reportContextMaxBytes?: number;
}

export interface OptimizeManifest {
  benchmarkConfig: string;
  targetRepo: OptimizeTargetRepo;
  optimizer?: OptimizePolicy;
  mutation?: OptimizeMutationConfig;
}

export interface ResolvedOptimizeManifest {
  benchmarkConfig: string;
  /** Absolute path to the source SKILL.md in the target repo, if it is a local file. */
  skillPath?: string;
  /** Companion skill references that compose the skill and may be versioned locally. */
  skillReferences?: Array<{ source: string; promptPath: string }>;
  targetRepo: {
    path: string;
    surface: BenchmarkSurface;
    allowedPaths: string[];
    surfacePaths?: string[];
    cleanIgnorePaths?: string[];
    validation: string[];
    requireCleanGit: boolean;
  };
  optimizer: {
    mode: 'stable-surface' | 'surface-changing';
    maxIterations: number;
    stabilityWindow: number;
    minImprovement: number;
    taskGeneration: {
      enabled: boolean;
      maxGenerated: number;
      seed: number;
      outputDir: string;
    };
    perModelFloor: number;
    targetWeightedAverage: number;
    models: ModelConfig[];
  };
  mutation?: OptimizeMutationConfig & {
    reportContextMaxBytes: number;
  };
}

export interface TaskGenerationResult {
  benchmarkConfigPath: string;
  taskCount: number;
  rejectedCount: number;
}

export interface FailureBucket {
  kind: FailureBucketKind;
  count: number;
  taskIds: string[];
  modelIds: string[];
}

export interface MutationCandidate {
  summary: string;
  changedFiles: string[];
  editableFiles?: string[];
  toolActivity?: string[];
}

export interface LocalSkillReference {
  source: string;
  localPath: string;
  promptPath: string;
}

export interface ValidationCommandResult {
  command: string;
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ValidationResult {
  ok: boolean;
  commands: ValidationCommandResult[];
}

export interface OptimizeIteration {
  index: number;
  accepted: boolean;
  summary: string;
  changedFiles: string[];
  editableFiles?: string[];
  validation: ValidationResult;
  scoreBefore: number;
  scoreAfter?: number;
  /** Per-model pass rates after this iteration's benchmark run (absent when no benchmark ran) */
  perModelAfter?: Record<string, ModelSummary>;
  delta: number;
  failureBuckets: FailureBucket[];
}

export interface OptimizeResult {
  baselineReport: BenchmarkReport;
  bestReport: BenchmarkReport;
  iterations: OptimizeIteration[];
  stopReason: StopReason;
  generation?: TaskGenerationResult;
}

export interface MutationContext {
  manifest: ResolvedOptimizeManifest;
  iteration: number;
  currentReport: BenchmarkReport;
  failureBuckets: FailureBucket[];
  reportPath: string | null;
  /**
   * Absolute path to the local skill file for this iteration
   * (e.g. `.skill-optimizer/skill-v1.md`). When present, the mutation
   * executor must write its changes to this path instead of the target repo.
   */
  localSkillPath?: string;
  /** Local editable copies of companion references for this iteration. */
  localSkillReferences?: LocalSkillReference[];
}

export interface OptimizeLoopDependencies {
  benchmark: {
    run(
      configPath: string,
      opts: {
        outputDir: string;
        label: string;
        verdictPolicy?: { perModelFloor: number; targetWeightedAverage: number };
        skillOverride?: string;
        skillReferenceOverrides?: Array<{ source: string; promptPath: string; baseSource?: string }>;
      },
    ): Promise<{ report: BenchmarkReport; reportPath: string }>;
  };
  repo: {
    ensureReady(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<string>;
    captureCheckpoint(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<string>;
    restoreCheckpoint(targetRepo: ResolvedOptimizeManifest['targetRepo'], checkpoint: string): Promise<void>;
    updateAcceptedCheckpoint(targetRepo: ResolvedOptimizeManifest['targetRepo'], checkpoint: string, candidate: MutationCandidate, changedFiles?: string[]): Promise<string>;
    listChangedFiles?(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<string[]>;
  };
  mutation: {
    apply(context: MutationContext): Promise<MutationCandidate>;
  };
  taskGenerator?: {
    generate(
      manifest: ResolvedOptimizeManifest,
      opts: { outputDir: string },
    ): Promise<TaskGenerationResult>;
  };
  validation: {
    run(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<ValidationResult>;
  };
  ledger: {
    record(event: Record<string, unknown>): Promise<void>;
  };
}
