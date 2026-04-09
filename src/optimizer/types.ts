import type { BenchmarkReport, BenchmarkSurface } from '../benchmark/types.js';

export type FailureBucketKind = 'missing-tool' | 'bad-args' | 'hallucination' | 'error';
export type StopReason = 'max-iterations' | 'stable';

export interface OptimizeTaskGenerationConfig {
  enabled?: boolean;
  maxGenerated?: number;
  seed?: number;
}

export interface OptimizeTargetRepo {
  path: string;
  surface: BenchmarkSurface;
  allowedPaths: string[];
  validation: string[];
  requireCleanGit?: boolean;
}

export interface OptimizePolicy {
  maxIterations?: number;
  stabilityWindow?: number;
  minOverallPassDelta?: number;
  taskGeneration?: OptimizeTaskGenerationConfig;
}

export interface OptimizeMutationConfig {
  provider: string;
  model: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  apiKeyEnv?: string;
}

export interface OptimizeManifest {
  benchmarkConfig: string;
  targetRepo: OptimizeTargetRepo;
  optimizer?: OptimizePolicy;
  mutation?: OptimizeMutationConfig;
}

export interface ResolvedOptimizeManifest {
  benchmarkConfig: string;
  targetRepo: {
    path: string;
    surface: BenchmarkSurface;
    allowedPaths: string[];
    validation: string[];
    requireCleanGit: boolean;
  };
  optimizer: {
    maxIterations: number;
    stabilityWindow: number;
    minOverallPassDelta: number;
    taskGeneration: {
      enabled: boolean;
      maxGenerated: number;
      seed: number;
    };
  };
  mutation?: OptimizeMutationConfig;
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
  validation: ValidationResult;
  scoreBefore: number;
  scoreAfter?: number;
  delta: number;
  failureBuckets: FailureBucket[];
}

export interface OptimizeResult {
  baselineReport: BenchmarkReport;
  bestReport: BenchmarkReport;
  iterations: OptimizeIteration[];
  stopReason: StopReason;
}

export interface MutationContext {
  manifest: ResolvedOptimizeManifest;
  iteration: number;
  currentReport: BenchmarkReport;
  failureBuckets: FailureBucket[];
}

export interface OptimizeLoopDependencies {
  benchmark: {
    run(configPath: string): Promise<BenchmarkReport>;
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
  validation: {
    run(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<ValidationResult>;
  };
  ledger: {
    record(event: Record<string, unknown>): Promise<void>;
  };
}
