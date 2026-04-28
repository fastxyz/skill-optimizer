export interface WorkbenchGraderConfig {
  name: string;
  command: string;
}

export interface WorkbenchCaseConfig {
  name: string;
  references: string;
  task: string;
  graders: WorkbenchGraderConfig[];
  env?: string[];
  setup?: string[];
  cleanup?: string[];
  model?: string;
  timeoutSeconds?: number;
}

export interface ResolvedWorkbenchCase {
  configPath: string;
  configDir: string;
  name: string;
  referencesDir: string;
  task: string;
  graders: WorkbenchGraderConfig[];
  env: string[];
  setup: string[];
  cleanup: string[];
  model: string;
  timeoutSeconds: number;
}

export interface WorkbenchGrade {
  pass: boolean;
  score: number;
  evidence: string[];
  graders?: WorkbenchGraderResult[];
  metrics?: WorkbenchMetrics;
  exitCode?: number | null;
  command?: string;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface WorkbenchGraderResult extends Omit<WorkbenchGrade, 'graders'> {
  name: string;
  command: string;
}

export interface WorkbenchResult extends WorkbenchGrade {
  caseName?: string;
  model?: string;
  trial?: number;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface WorkbenchTokenMetrics {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface WorkbenchCostMetrics {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface WorkbenchMetrics {
  durationMs: number;
  turns: number;
  toolCalls: number;
  toolResults: number;
  bashCalls: number;
  readCalls: number;
  writeCalls: number;
  editCalls: number;
  stopReason?: string;
  tokens: WorkbenchTokenMetrics;
  cost: WorkbenchCostMetrics;
}

export interface WorkbenchTrialSummaryFile {
  finalAssistantMessage?: string;
  failedGraders: string[];
  evidence: string[];
  bashCommands: string[];
  stopReason?: string;
  errorMessage?: string;
  metrics: WorkbenchMetrics;
}

export interface WorkbenchAggregateSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  totalTrials: number;
  passedTrials: number;
  failedTrials: number;
  trialPassRate: number;
  meanScore: number;
}

export interface WorkbenchTrialResultRef {
  trial: number;
  pass: boolean;
  score: number;
  resultPath: string;
  tracePath: string;
  summaryPath?: string;
}

export interface WorkbenchModelAggregateResult {
  model: string;
  totalTrials: number;
  passedTrials: number;
  failedTrials: number;
  trialPassRate: number;
  meanScore: number;
  passAtK: boolean;
  passHatK: boolean;
  trials: WorkbenchTrialResultRef[];
}

export interface WorkbenchCaseModelAggregateResult extends WorkbenchModelAggregateResult {
  caseName: string;
}

export interface RunCaseAggregateResultFile {
  name: string;
  startedAt: string;
  endedAt: string;
  models: string[];
  summary: WorkbenchAggregateSummary;
  results: WorkbenchModelAggregateResult[];
}

export interface RunSuiteAggregateResultFile {
  name: string;
  startedAt: string;
  endedAt: string;
  models: string[];
  cases: string[];
  summary: WorkbenchAggregateSummary;
  results: WorkbenchCaseModelAggregateResult[];
}

export interface WorkbenchSimpleSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface ReferenceCaseResultFile extends WorkbenchGrade {
  caseName: string;
  solutionPath: string;
  resultPath?: string;
}

export interface ReferenceSuiteResultFile {
  name: string;
  startedAt: string;
  endedAt: string;
  summary: WorkbenchSimpleSummary;
  results: ReferenceCaseResultFile[];
}

export type WorkbenchTraceEntry =
  | {
      type: 'message';
      role: string;
      text?: string;
      thinking?: string;
      timestamp?: unknown;
      usage?: unknown;
      stopReason?: unknown;
      errorMessage?: string;
    }
  | {
      type: 'tool_call';
      id?: string;
      name: string;
      arguments?: unknown;
      timestamp?: unknown;
    }
  | {
      type: 'tool_result';
      id?: string;
      name?: string;
      text?: string;
      isError?: boolean;
      timestamp?: unknown;
    };

export interface WorkbenchTraceEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface WorkbenchTrace {
  schemaVersion?: 1;
  caseName: string;
  model: string;
  startedAt: string;
  endedAt: string;
  events?: WorkbenchTraceEvent[];
  entries: WorkbenchTraceEntry[];
}
