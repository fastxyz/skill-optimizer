<!-- AUTO-GENERATED — do not edit. Run `npm run gen-docs` to regenerate. -->


# Config Schema Reference

All configuration lives in a single `skill-optimizer.json` file.
Paths in the config are relative to the config file location.

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Human-readable project name |
| `target.surface` | `"sdk" | "cli" | "mcp" | "prompt"` | — | Type of callable surface |
| `target.repoPath` | `string` | — | Path to the target repo (default ".") |
| `target.skill` | `string | object` | — | Path to SKILL.md or { source, cache } object |
| `target.discovery.mode` | `"auto" | "manifest"` | — | "auto" = code-first tree-sitter; "manifest" = use provided file only |
| `target.discovery.sources` | `string[]` | — | Source files to scan for callable methods/commands/tools |
| `target.discovery.fallbackManifest` | `string` | — | Path to manifest JSON when code-first discovery is incomplete |
| `target.discovery.language` | `"typescript" | "python" | "rust"` | — | Language for code-first discovery |
| `target.sdk.language` | `"typescript" | "python" | "rust"` | — | SDK language |
| `target.sdk.entrypoints` | `string[]` | — | SDK entry files for discovery |
| `target.cli.commands` | `string` | — | Path to CLI commands manifest JSON (CliCommandDefinition[]) |
| `target.mcp.tools` | `string` | — | Path to MCP tools manifest JSON (OpenAI function tool definitions) |
| `target.scope.include` | `string[]` | — | Glob patterns for actions to include (default ["*"]) |
| `target.scope.exclude` | `string[]` | — | Glob patterns for actions to exclude (default []) |
| `benchmark.format` | `"pi" | "openai" | "anthropic"` | — | LLM transport format: "pi" routes through OpenRouter/Pi (use openrouter/* or openai/* model refs); "openai" calls the OpenAI API directly (supports Codex auth); "anthropic" calls the Anthropic API directly |
| `benchmark.authMode` | `"env" | "codex" | "auto"` | — | How to resolve credentials: env var, ~/.codex/auth.json browser-login tokens, or env-then-codex fallback |
| `benchmark.apiKeyEnv` | `string` | — | Env var name for the API key (default is determined by the model provider prefix: openrouter/ → OPENROUTER_API_KEY, openai/ → OPENAI_API_KEY, anthropic/ → ANTHROPIC_API_KEY; leave unset to use the per-provider default) |
| `benchmark.timeout` | `integer` | — | Milliseconds per model call (default 240000) |
| `benchmark.models` | `object[]` | — | Models to benchmark — at least one required |
| `benchmark.taskGeneration.enabled` | `boolean` | — | Whether to generate tasks automatically (default false) |
| `benchmark.taskGeneration.maxTasks` | `integer` | — | Max tasks to generate — must be >= in-scope action count (default 10) |
| `benchmark.taskGeneration.seed` | `integer` | — | RNG seed for reproducible generation (default 1) |
| `benchmark.taskGeneration.outputDir` | `string` | — | Where to write generated task artifacts (default ".skill-optimizer") |
| `benchmark.output.dir` | `string` | — | Directory where reports are saved (default "benchmark-results/") |
| `benchmark.verdict.perModelFloor` | `number` | — | Minimum per-model pass fraction for PASS verdict (default 0.6) |
| `benchmark.verdict.targetWeightedAverage` | `number` | — | Minimum weighted average across all models for PASS (default 0.7) |
| `benchmark.agentic.references.baseUrl` | `string` | — | Base URL for the reference doc-fetch tool |
| `benchmark.agentic.references.allowedPaths` | `string[]` | — | Allowlist of documentation paths the agent may fetch |
| `benchmark.agentic.coding.enabled` | `boolean` | — | Opt-in flag. When true, prompt-surface tasks are evaluated by a coding-agent session with real Read/Bash/Grep access instead of a single-shot chat completion |
| `benchmark.agentic.coding.cwd` | `string` | — | Absolute path the agent may read. All tool access is scoped here — typically a fixture repo prepared for the benchmark |
| `benchmark.agentic.coding.thinkingLevel` | `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"` | — | Reasoning depth for the coding orchestrator (default "medium") |
| `benchmark.agentic.maxTurns` | `integer` | — | Maximum agent turns per task (default 5, applies to references mode only) |
| `optimize.model` | `string` | — | Model for mutation, e.g. openrouter/anthropic/claude-sonnet-4.6 |
| `optimize.authMode` | `"env" | "codex" | "auto"` | — | How to resolve optimizer credentials: env var, ~/.codex/auth.json browser-login tokens, or env-then-codex fallback |
| `optimize.apiKeyEnv` | `string` | — | Env var for the optimizer API key |
| `optimize.thinkingLevel` | `"off" | "minimal" | "low" | "medium" | "high" | "xhigh"` | — | Reasoning depth for mutation calls (default "medium") |
| `optimize.allowedPaths` | `string[]` | — | Paths the optimizer may edit — safety boundary |
| `optimize.validation` | `string[]` | — | Shell commands to run to validate each mutation |
| `optimize.requireCleanGit` | `boolean` | — | Require clean git state before starting (default true) |
| `optimize.maxIterations` | `integer` | — | Maximum optimization iterations (default 5) |
| `optimize.minImprovement` | `number` | — | Minimum weighted-average gain per accepted iteration (default 0.02) |
| `optimize.reportContextMaxBytes` | `integer` | — | Byte budget for mutation context (default 16000) |
