import type {
  ActionArgSchema,
  ActionAttempt,
  ActionCatalog,
  ActionDefinition,
} from '../actions/types.js';

// === Core ===
export type Tier = 'flagship' | 'mid' | 'low';

export interface ModelConfig {
  id: string;       // LLM model ID e.g. 'openai/gpt-4o'
  name: string;     // Display name e.g. 'GPT-4o'
  tier: Tier;
  weight?: number;  // Optional; defaults to 1.0 at scoring time.
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

// === Config (loaded from benchmark.config.json) ===

export type BenchmarkSurface = 'sdk' | 'cli' | 'mcp';
export type SdkLanguage = 'typescript' | 'python' | 'rust';

export interface BenchmarkConfig {
  name: string;                    // e.g. "fast-sdk", "my-mcp-tools"
  surface: BenchmarkSurface;
  sdk?: SdkSurfaceConfig;
  cli?: CliSurfaceConfig;
  mcp?: McpSurfaceConfig;
  skill?: SkillConfig;
  tasks: string;                   // path to tasks.json
  llm: LLMConfig;
  output?: OutputConfig;
  agentic?: AgenticConfig;
  surfaceSnapshot?: SurfaceSnapshot;
  mcpToolDefinitions?: McpToolDefinition[];
}

export interface SdkSurfaceConfig {
  language: SdkLanguage;
  style?: 'sdk';                   // defaults to 'sdk' if omitted
  // Optional: explicit API surface for coverage/hallucination reporting only.
  // If omitted, derived automatically from task expected_tools.
  apiSurface?: string[];
  // Deprecated fields — kept for backward compat, no longer required
  classes?: string[];
  functions?: string[];
  functionReturns?: Record<string, string>;
  methods?: string[];
}

export interface CliSurfaceConfig {
  shell?: 'bash' | 'sh';
  commands: string;                // path to commands.json
}

export interface CliCommandOptionDefinition {
  name: string;
  description?: string;
  aliases?: string[];
  takesValue?: boolean;
}

export interface CliCommandDefinition {
  command: string;
  description?: string;
  options?: CliCommandOptionDefinition[];
}

export interface McpSurfaceConfig {
  tools: string;                   // path to tools.json (OpenAI function calling format)
}

// Backward-compatible aliases retained for internal usage.
export type CodeModeConfig = SdkSurfaceConfig;
export type McpModeConfig = McpSurfaceConfig;

export interface SkillConfig {
  source: string;                  // "github:org/repo/path", "./file.md", "https://url"
  cache?: boolean;                 // default true
}

export interface LLMConfig {
  baseUrl?: string;                // required for direct openai/anthropic formats
  authMode?: 'env' | 'codex' | 'auto';
  apiKeyEnv?: string;              // e.g. "OPENROUTER_API_KEY" — reads from process.env
  format: 'openai' | 'anthropic' | 'pi';
  timeout?: number;                // ms, default 240000
  headers?: Record<string, string>; // extra headers
  models: ModelConfig[];
}

export interface OutputConfig {
  dir?: string;                    // default "./benchmark-results"
}

export interface AgenticConfig {
  references: {
    baseUrl: string;
    allowedPaths: string[];
  };
  maxTurns?: number;
}

// === MCP Tool Definition (OpenAI function calling format) ===

export interface McpToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
}

// === Skill ===

export interface SkillVersion {
  source: string;                  // the source string from config
  commitSha: string;               // git SHA or 'local' or 'unknown'
  ref: string;                     // git ref or 'file' or 'url'
  fetchedAt: string;               // ISO timestamp
}

export interface FetchedSkill {
  version: SkillVersion;
  content: string;
}

// === Task Definition (loaded from tasks.json) ===

export interface ExpectedAction {
  name?: string;                   // Unified action name (SDK method, CLI command, or MCP tool)
  method?: string;                 // Transitional alias for older internal code paths
  args?: Record<string, unknown>;  // expected arg values (supports nested objects/arrays, strings, regexes, sentinels)
}

// Transitional alias retained while internal code paths migrate.
export type ExpectedTool = ExpectedAction;

export interface TaskVerification {
  code_pattern?: string;           // regex pattern to match in generated code
}

export interface TaskDefinition {
  id: string;
  prompt: string;
  expected_actions?: ExpectedAction[];
  expected_tools?: ExpectedAction[]; // transitional alias populated by the loader
  verify?: TaskVerification[];
  expected_fetches?: string[];
}

// === Extracted from generated code or tool_calls ===

export type ExtractedCall = ActionAttempt;

// === LLM Response ===

export interface LLMResponse {
  content: string;                 // text content from LLM
  toolCalls?: ToolCallResult[];    // structured tool calls (MCP surface)
  usage?: TokenUsage;
}

export interface ToolCallResult {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

// === Evaluation ===

export interface ActionMatch {
  expected: ExpectedAction;
  found: ExtractedCall | null;
  methodFound: boolean;
  argsCorrect: boolean;
  matched: boolean;
  argResults?: Record<string, {
    expected: string;
    got: unknown;
    match: boolean;
  }>;
}

// Transitional alias retained while internal code paths migrate.
export type ToolMatch = ActionMatch;

export interface TaskResult {
  task: TaskDefinition;
  model: ModelConfig;
  generatedCode: string | null;
  rawResponse: string;
  extractedCalls: ExtractedCall[];
  actionMatches?: ActionMatch[];
  toolMatches: ActionMatch[]; // transitional alias
  codePatternResults?: Record<string, boolean>;
  metrics: {
    toolPrecision: number;
    toolRecall: number;
    taskPassed: boolean;
    toolSelectionAccuracy: number;
    argAccuracy: number;
    unnecessaryActions?: string[];
    unnecessaryCalls: string[]; // transitional alias
    hallucinatedActions?: string[];
    hallucinatedCalls: string[]; // transitional alias
    hallucinationRate: number;
    fetchRecall?: number;
    fetchPrecision?: number;
    actualFetches?: string[];
  };
  llmLatencyMs: number;
  tokenUsage?: TokenUsage;
  error?: string;
}

// === Coverage ===

export interface MethodCoverage {
  method: string;
  tasksCovering: string[];
  covered: boolean;
}

export type SurfaceActionArg = ActionArgSchema;

export type SurfaceAction = Omit<ActionDefinition, 'key'>;

export interface SurfaceSnapshot extends Omit<ActionCatalog, 'actions'> {
  surface: BenchmarkSurface;
  actions: SurfaceAction[];
}

// === Verdict & Coverage ===

export type Verdict = 'PASS' | 'FAIL';

export interface VerdictPolicy {
  perModelFloor: number;
  targetWeightedAverage: number;
}

export interface CoverageReport {
  inScopeActions: string[];
  outOfScopeActions: string[];
  coveredActions: string[];
  uncoveredActions: string[];
  tasksPerAction: Record<string, number>;
  coverageViolation: boolean;
}

// === Report ===

export interface ModelSummary {
  passRate: number;
  avgRecall: number;
  avgPrecision: number;
  avgToolSelectionAccuracy: number;
  avgArgAccuracy: number;
  avgHallucinationRate: number;
  tasksRun: number;
}

export interface TaskSummary {
  passRate: number;
  avgRecall: number;
  avgToolSelectionAccuracy: number;
  avgArgAccuracy: number;
}

export interface BenchmarkReport {
  timestamp: string;
  config: { name: string; surface: BenchmarkSurface; outputDir?: string };
  skillVersion: SkillVersion;
  results: TaskResult[];
  coverage: MethodCoverage[];
  scopeCoverage?: CoverageReport;
  summary: {
    totalTasks: number;
    totalModels: number;
    totalEvaluations: number;
    overallPassRate: number;
    weightedAverage?: number;
    avgToolRecall: number;
    avgToolPrecision: number;
    avgToolSelectionAccuracy: number;
    avgArgAccuracy: number;
    avgHallucinationRate: number;
    methodCoveragePercent: number;
    perModel: Record<string, ModelSummary>;
    perTask: Record<string, TaskSummary>;
    perTier: Record<Tier, { passRate: number; avgRecall: number; avgToolSelectionAccuracy: number; avgArgAccuracy: number }>;
  };
  verdict?: {
    policy: VerdictPolicy;
    result: Verdict;
    reasons: string[];
  };
}

export function getExpectedActionName(action: ExpectedAction): string {
  return action.name || action.method || '';
}

export function getExpectedActions(task: TaskDefinition): ExpectedAction[] {
  return task.expected_actions ?? task.expected_tools ?? [];
}

// === Comparison ===

export type Delta = 'improved' | 'regressed' | 'unchanged' | 'new' | 'removed';

export interface TaskDelta {
  taskId: string;
  modelId: string;
  passedBefore: boolean;
  passedNow: boolean;
  delta: Delta;
  recallBefore: number;
  recallNow: number;
  toolSelectionBefore: number;
  toolSelectionNow: number;
}

export interface ComparisonReport {
  baseline: { timestamp: string; skillVersion: SkillVersion };
  current: { timestamp: string; skillVersion: SkillVersion };
  taskDeltas: TaskDelta[];
  summary: {
    improved: number;
    regressed: number;
    unchanged: number;
    coverageBefore: number;
    coverageNow: number;
    accuracyBefore: number;
    accuracyNow: number;
  };
}
