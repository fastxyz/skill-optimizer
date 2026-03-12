# @fastxyz/skill-benchmark

Generic framework for testing whether LLMs can correctly discover and use SDK methods or MCP tools from documentation alone. No code is executed — this is pure static analysis of what the LLM produces.

## How It Works

1. Load a config that describes your SDK classes/methods (or MCP tool definitions)
2. For each task, send the skill documentation + task prompt to one or more LLMs
3. **SDK mode**: LLM writes TypeScript code. Tree-sitter parses it to extract `ClassName.method(args)` calls
4. **MCP mode**: LLM makes structured `tool_calls`. The framework extracts tool names + arguments directly
5. Compare extracted calls against expected tools/args from the task definition
6. Compute metrics: tool recall, precision, argument accuracy, hallucination rate, SDK coverage

## Modes

| Mode | Config field | LLM output | Extraction |
|------|-------------|------------|------------|
| **SDK** | `mode: "code"` | TypeScript code block | Tree-sitter AST: `ClassName.method` calls, variable tracking |
| **MCP** | `mode: "mcp"` | Structured `tool_calls` | Direct extraction from tool call names + arguments |

**Use SDK mode** when you have a TypeScript/JavaScript SDK with classes and methods, and a SKILL.md that documents them. The benchmark tests whether an LLM can write correct code using your SDK.

**Use MCP mode** when you have MCP tools (or any function-calling interface). The benchmark tests whether an LLM picks the right tools with the right arguments.

## Quick Start

### Install the framework

```bash
npm install @fastxyz/skill-benchmark
```

### Scaffold a new benchmark

```bash
npx skill-benchmark init
```

This creates three files:
- `benchmark.config.json` — SDK mode config with example classes/methods
- `tasks.json` — example task definitions
- `tools.json` — example MCP tool definitions

### Run

```bash
# Set your LLM provider API key
export OPENROUTER_API_KEY=sk-or-...

# Run all tasks against all models
npx skill-benchmark run

# Run a single task with a single model
npx skill-benchmark run --task send-data --model gpt-4o
```

## Configuration

### SDK Mode

Create `benchmark.config.json`:

```json
{
  "name": "my-sdk",
  "mode": "code",
  "code": {
    "language": "typescript",
    "classes": ["MyClient", "MyWallet"],
    "methods": [
      "MyClient.constructor",
      "MyClient.getBalance",
      "MyWallet.fromKeyfile",
      "MyWallet.send"
    ]
  },
  "skill": {
    "source": "github:myorg/my-sdk/SKILL.md",
    "cache": true
  },
  "tasks": "./tasks.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "timeout": 240000,
    "models": [
      { "id": "openai/gpt-4.1", "name": "GPT-4.1", "tier": "flagship" },
      { "id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4", "tier": "flagship" },
      { "id": "openai/gpt-4.1-mini", "name": "GPT-4.1 Mini", "tier": "mid" }
    ]
  },
  "output": {
    "dir": "./benchmark-results"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Benchmark name (used in reports) |
| `mode` | Yes | `"code"` for SDK mode |
| `code.language` | Yes | Language the LLM should write (e.g. `"typescript"`) |
| `code.classes` | Yes | SDK class names for tree-sitter tracking (e.g. `["MyClient"]`) |
| `code.methods` | Yes | All known SDK methods as `ClassName.method` (used for hallucination detection) |
| `skill.source` | No | Path to skill documentation (see [Skill Sources](#skill-sources)) |
| `skill.cache` | No | Cache fetched docs locally (default: `true`) |
| `tasks` | Yes | Path to tasks JSON file |
| `llm.baseUrl` | Yes | LLM API base URL |
| `llm.apiKeyEnv` | No | Environment variable name containing the API key |
| `llm.format` | Yes | `"openai"` or `"anthropic"` (API format) |
| `llm.models` | Yes | Array of models to test |
| `output.dir` | No | Output directory (default: `"./benchmark-results"`) |

### MCP Mode

Create `benchmark.mcp.config.json`:

```json
{
  "name": "my-mcp-tools",
  "mode": "mcp",
  "mcp": {
    "tools": "./tools.json"
  },
  "tasks": "./tasks-mcp.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "timeout": 240000,
    "models": [
      { "id": "openai/gpt-4.1", "name": "GPT-4.1", "tier": "flagship" },
      { "id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4", "tier": "flagship" }
    ]
  },
  "output": {
    "dir": "./benchmark-results/mcp"
  }
}
```

Key differences from SDK mode:
- `mode` is `"mcp"` instead of `"code"`
- `mcp.tools` points to a tools JSON file (OpenAI function calling format)
- No `code` section needed
- `skill` is optional — MCP mode relies on tool definitions to guide the LLM. If provided, it's included as supplementary context in the system prompt.

## Tasks

Tasks are defined in a JSON file. Each task has a prompt and a list of expected tool calls.

### SDK Tasks

```json
{
  "tasks": [
    {
      "id": "create-client",
      "prompt": "Create a new MyClient connected to the test environment.",
      "expected_tools": [
        { "method": "MyClient.constructor", "args": { "environment": "test" } }
      ]
    },
    {
      "id": "send-tokens",
      "prompt": "Send 5 tokens to address addr1...",
      "expected_tools": [
        { "method": "MyClient.constructor" },
        { "method": "MyWallet.fromKeyfile" },
        { "method": "MyWallet.send", "args": { "amount": "5", "to": "addr1..." } }
      ]
    }
  ]
}
```

### MCP Tasks

```json
{
  "tasks": [
    {
      "id": "send-tokens",
      "prompt": "Send 5 tokens to addr1...",
      "expected_tools": [
        { "method": "send_tokens", "args": { "to": "addr1...", "amount": "5" } }
      ]
    }
  ]
}
```

### Task Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique task identifier (used in CLI filtering and reports) |
| `prompt` | Yes | The natural language instruction sent to the LLM |
| `expected_tools` | Yes | Array of expected tool/method calls |
| `expected_tools[].method` | Yes | SDK: `ClassName.method`. MCP: tool name (e.g. `send_tokens`) |
| `expected_tools[].args` | No | Expected argument key-value pairs |

### Argument Matching

Expected args support several matching modes:

| Pattern | Example | Matches |
|---------|---------|---------|
| Exact string | `"amount": "5"` | Value must equal `"5"` (type-coerced) |
| Regex | `"address": "/^fast1/"` | Value must match the regex |
| Sentinel (expected) | `"key": "<dynamic>"` | Any value accepted (wildcard) |
| Sentinel (extracted) | N/A | If the extractor returns `<dynamic>` or `<template>`, it's treated as a match |

Numeric and boolean values are type-coerced: `"5"` matches `5`, `"true"` matches `true`.

## MCP Tool Definitions

For MCP mode, provide a `tools.json` file in OpenAI function calling format:

```json
[
  {
    "type": "function",
    "function": {
      "name": "send_tokens",
      "description": "Send tokens to a recipient address",
      "parameters": {
        "type": "object",
        "properties": {
          "to": { "type": "string", "description": "Recipient address" },
          "amount": { "type": "string", "description": "Amount to send" },
          "token": { "type": "string", "description": "Token symbol" }
        },
        "required": ["to", "amount"]
      }
    }
  }
]
```

These tool definitions are sent to the LLM as available functions. The LLM responds with `tool_calls` which are extracted and evaluated against your task expectations.

## CLI Reference

```
skill-benchmark init                          Scaffold config and example tasks
skill-benchmark run [options]                 Run the benchmark
skill-benchmark compare [options]             Compare two benchmark reports
```

### Run Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Config file path (default: `benchmark.config.json`) |
| `--tier <flagship\|mid\|low>` | Filter models by tier |
| `--task <task-id>` | Run a single task |
| `--model <model-slug>` | Run a single model (slug is the lowercased, hyphenated model name) |
| `--no-cache` | Force fresh skill documentation fetch |

### Compare Options

| Flag | Description |
|------|-------------|
| `--baseline <path>` | Path to baseline `report.json` |
| `--current <path>` | Path to current `report.json` |

### Examples

```bash
# Full run (all tasks x all models)
npx skill-benchmark run

# Use a specific config
npx skill-benchmark run --config benchmark.mcp.config.json

# Only flagship models
npx skill-benchmark run --tier flagship

# Single task, single model (fast smoke test)
npx skill-benchmark run --task send-tokens --model gpt-4-1

# Compare two runs for regressions
npx skill-benchmark compare --baseline results/old/report.json --current results/report.json
```

## Metrics

| Metric | Description |
|--------|-------------|
| **Tool Recall** | Fraction of expected methods the LLM actually called |
| **Tool Precision** | Fraction of the LLM's calls that were expected |
| **Tool Selection Accuracy** | Fraction of expected methods where the correct method name was found (ignoring args) |
| **Argument Accuracy** | Fraction of expected args that matched correctly |
| **Task Pass Rate** | A task passes only if ALL expected methods are called with ALL correct args (all-or-nothing) |
| **Hallucination Rate** | Fraction of the LLM's calls that are not in the known method list |
| **Method Coverage** | Fraction of all known methods that appear in at least one task definition |

## LLM Providers

The framework supports any OpenAI-compatible or Anthropic-compatible API via `baseUrl` + `format`.

### OpenRouter (recommended for multi-model benchmarks)

```json
{
  "baseUrl": "https://openrouter.ai/api/v1",
  "apiKeyEnv": "OPENROUTER_API_KEY",
  "format": "openai"
}
```

### OpenAI Direct

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKeyEnv": "OPENAI_API_KEY",
  "format": "openai"
}
```

### Anthropic Direct

```json
{
  "baseUrl": "https://api.anthropic.com",
  "apiKeyEnv": "ANTHROPIC_API_KEY",
  "format": "anthropic"
}
```

The `format` field controls request/response serialization:
- `"openai"` — Uses `/chat/completions`, `Authorization: Bearer` header, OpenAI tool calling format
- `"anthropic"` — Uses `/v1/messages`, `x-api-key` header, Anthropic tool_use format

## Skill Sources

The `skill.source` field in config supports three formats:

| Format | Example | Description |
|--------|---------|-------------|
| GitHub | `"github:myorg/my-sdk/SKILL.md"` | Fetches from `raw.githubusercontent.com`, caches locally, tracks commit SHA |
| Local file | `"./SKILL.md"` | Reads from local filesystem (relative to CWD) |
| URL | `"https://example.com/docs/skill.md"` | Fetches from any URL, caches locally |

For MCP mode, `skill` is optional. If omitted, the LLM receives only the tool definitions and a generic system prompt.

## Project Structure

```
src/
  types.ts              Type definitions (BenchmarkConfig, TaskResult, etc.)
  config.ts             Load and validate config + tasks
  cli.ts                CLI: init, run, compare
  runner.ts             Main benchmark loop
  prompts.ts            System/task prompt builders (SDK + MCP aware)
  evaluator.ts          BFCL-style matching (tool selection, arg accuracy, hallucination)
  coverage.ts           SDK method coverage computation
  skill-fetcher.ts      Fetch skill docs from github:/file:/https: with caching
  reporter.ts           Console table + markdown report generation
  compare.ts            Regression comparison between runs
  init.ts               Scaffold new projects
  index.ts              Public API exports
  llm/
    index.ts            LLMClient interface + factory
    openai-format.ts    OpenAI-compatible request handler
    anthropic-format.ts Anthropic Messages API handler
  extractors/
    index.ts            Extraction factory (dispatches by mode)
    code-analyzer.ts    Tree-sitter: parse TS code -> extract ClassName.method calls
    code-extractor.ts   Extract TypeScript code blocks from LLM markdown response
    mcp-extractor.ts    Extract tool names + args from structured tool_calls
```

See `integration/` for a real-world consumer example using the Fast SDK.

## TODO

- **HTTP mode** (`code` mode, `style: "http"`): LLM writes TypeScript with `fetch()` calls, tree-sitter extracts `METHOD /path` endpoints. The extractor (`http-analyzer.ts`) was previously implemented but has been removed from source and needs to be re-implemented if this mode is desired.
- **Curl mode** (`code` mode, `style: "curl"`): LLM writes curl commands, regex parser extracts `METHOD /path` endpoints. The extractor (`curl-analyzer.ts`) was previously implemented but has been removed from source and needs to be re-implemented if this mode is desired.
