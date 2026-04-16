// src/project/schema.ts
// Zod schema for config documentation generation only.
// Runtime validation stays in src/project/validate.ts.
import { z } from 'zod/v3';

const ModelConfigSchema = z.object({
  id: z.string().describe('OpenRouter model ID, e.g. openrouter/anthropic/claude-sonnet-4-6'),
  name: z.string().describe('Human-readable model name for reports'),
  tier: z.enum(['flagship', 'mid', 'low']).optional().describe('Model tier — affects weighting in weighted average'),
  weight: z.number().optional().describe('Weight in weighted average (default 1.0). Higher = more influence'),
});

const DiscoveryConfigSchema = z.object({
  mode: z.enum(['auto', 'manifest']).optional().describe('"auto" = code-first tree-sitter; "manifest" = use provided file only'),
  sources: z.array(z.string()).optional().describe('Source files to scan for callable methods/commands/tools'),
  fallbackManifest: z.string().optional().describe('Path to manifest JSON when code-first discovery is incomplete'),
  language: z.enum(['typescript', 'python', 'rust']).optional().describe('Language for code-first discovery'),
});

const SdkConfigSchema = z.object({
  language: z.enum(['typescript', 'python', 'rust']).optional().describe('SDK language'),
  entrypoints: z.array(z.string()).optional().describe('SDK entry files for discovery'),
});

const CliConfigSchema = z.object({
  commands: z.string().optional().describe('Path to CLI commands manifest JSON (CliCommandDefinition[])'),
});

const McpConfigSchema = z.object({
  tools: z.string().optional().describe('Path to MCP tools manifest JSON (OpenAI function tool definitions)'),
});

const ScopeConfigSchema = z.object({
  include: z.array(z.string()).optional().describe('Glob patterns for actions to include (default ["*"])'),
  exclude: z.array(z.string()).optional().describe('Glob patterns for actions to exclude (default [])'),
});

const TargetConfigSchema = z.object({
  surface: z.enum(['sdk', 'cli', 'mcp']).describe('Type of callable surface'),
  repoPath: z.string().optional().describe('Path to the target repo (default ".")'),
  skill: z.union([
    z.string(),
    z.object({ source: z.string(), cache: z.boolean().optional() }),
  ]).optional().describe('Path to SKILL.md or { source, cache } object'),
  discovery: DiscoveryConfigSchema.optional().describe('How to discover callable actions'),
  sdk: SdkConfigSchema.optional().describe('SDK-specific config'),
  cli: CliConfigSchema.optional().describe('CLI-specific config'),
  mcp: McpConfigSchema.optional().describe('MCP-specific config'),
  scope: ScopeConfigSchema.optional().describe('Scope filter — which actions to benchmark'),
});

const TaskGenerationConfigSchema = z.object({
  enabled: z.boolean().optional().describe('Whether to generate tasks automatically (default false)'),
  maxTasks: z.number().int().positive().optional().describe('Max tasks to generate — must be >= in-scope action count (default 10)'),
  seed: z.number().int().nonnegative().optional().describe('RNG seed for reproducible generation (default 1)'),
  outputDir: z.string().optional().describe('Where to write generated task artifacts (default ".skill-optimizer")'),
});

const VerdictConfigSchema = z.object({
  perModelFloor: z.number().min(0).max(1).optional().describe('Minimum per-model pass fraction for PASS verdict (default 0.6)'),
  targetWeightedAverage: z.number().min(0).max(1).optional().describe('Minimum weighted average across all models for PASS (default 0.7)'),
});

const BenchmarkConfigSchema = z.object({
  format: z.enum(['pi', 'openai', 'anthropic']).optional().describe('LLM transport format: "pi" routes through OpenRouter/Pi (use openrouter/* or openai/* model refs); "openai" calls the OpenAI API directly (supports Codex auth); "anthropic" calls the Anthropic API directly'),
  authMode: z.enum(['env', 'codex', 'auto']).optional().describe('How to resolve credentials: env var, ~/.codex/auth.json browser-login tokens, or env-then-codex fallback'),
  apiKeyEnv: z.string().optional().describe('Env var name for the API key (default: OPENROUTER_API_KEY for format:pi, OPENAI_API_KEY for format:openai, ANTHROPIC_API_KEY for format:anthropic)'),
  timeout: z.number().int().positive().optional().describe('Milliseconds per model call (default 240000)'),
  models: z.array(ModelConfigSchema).describe('Models to benchmark — at least one required'),
  taskGeneration: TaskGenerationConfigSchema.optional().describe('Automatic task generation config'),
  output: z.object({
    dir: z.string().optional().describe('Directory where reports are saved (default "benchmark-results/")'),
  }).optional().describe('Output configuration'),
  verdict: VerdictConfigSchema.optional().describe('PASS/FAIL thresholds'),
});

const OptimizeConfigSchema = z.object({
  model: z.string().optional().describe('Model for mutation, e.g. openrouter/anthropic/claude-sonnet-4-6'),
  authMode: z.enum(['env', 'codex', 'auto']).optional().describe('How to resolve optimizer credentials: env var, ~/.codex/auth.json browser-login tokens, or env-then-codex fallback'),
  apiKeyEnv: z.string().optional().describe('Env var for the optimizer API key'),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional()
    .describe('Reasoning depth for mutation calls (default "medium")'),
  allowedPaths: z.array(z.string()).optional().describe('Paths the optimizer may edit — safety boundary'),
  validation: z.array(z.string()).optional().describe('Shell commands to run to validate each mutation'),
  requireCleanGit: z.boolean().optional().describe('Require clean git state before starting (default true)'),
  maxIterations: z.number().int().positive().optional().describe('Maximum optimization iterations (default 5)'),
  minImprovement: z.number().nonnegative().optional().describe('Minimum weighted-average gain per accepted iteration (default 0.02)'),
  reportContextMaxBytes: z.number().int().positive().optional().describe('Byte budget for mutation context (default 16000)'),
});

export const ProjectConfigSchema = z.object({
  name: z.string().describe('Human-readable project name'),
  target: TargetConfigSchema.describe('Target surface configuration'),
  benchmark: BenchmarkConfigSchema.describe('Benchmark configuration'),
  optimize: OptimizeConfigSchema.optional().describe('Optimizer configuration (optional)'),
});
