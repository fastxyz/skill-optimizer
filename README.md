# @fastxyz/skill-benchmark

Surface-driven benchmark framework for testing whether LLMs can select the right actions from documentation and task prompts.

The codebase is split into two layers:

- `src/benchmark/*`: the core benchmark harness
- `src/optimizer/*`: the sequential self-improvement loop built on top of the benchmark

The benchmark supports three primary surfaces:

- **sdk**: SDK usage in TypeScript, Python, or Rust
- **cli**: shell command usage
- **mcp**: structured tool-calling usage

No generated code/commands are executed. Results are based on static extraction + matching.

## How It Works

1. Load benchmark config + tasks
2. Build prompts for a selected surface (`sdk`, `cli`, or `mcp`)
3. Send prompts to each configured model
4. Extract actions from model output (SDK calls, CLI commands, or MCP tool calls)
5. Compare extracted actions to `expected_tools` in each task
6. Compute metrics (recall, precision, arg accuracy, hallucination rate, coverage)

## Surfaces

| Surface | Config field | Expected model output | Transport |
|---|---|---|---|
| `sdk` | `surface: "sdk"` | One fenced code block matching `sdk.language` | Plain chat |
| `cli` | `surface: "cli"` | One fenced `bash`/`sh` block with commands only | Plain chat |
| `mcp` | `surface: "mcp"` | Tool calls only | Tool-calling chat |

`cli` and `mcp` are implementation-language-agnostic. Only `sdk` cares about code language because the model output is parsed as source code.

## Quick Start

```bash
npm install @fastxyz/skill-benchmark
npx skill-benchmark init
```

Run:

```bash
export OPENROUTER_API_KEY=sk-or-...
npx skill-benchmark run
npx skill-benchmark run --task send-data --model gpt-4-1
```

Optimize a target repo sequentially:

```bash
tsx src/optimizer/materialize-mock-repo.ts sdk-demo ./.tmp/mock-repos
tsx src/optimizer/main.ts ./.tmp/mock-repos/sdk-demo/optimize.config.json
```

`optimize` runs a benchmark, diagnoses failures, asks a coding agent to mutate the target SDK/CLI/MCP repo, validates that repo, reruns the benchmark, and stops when results stabilize or `maxIterations` is reached. The default iteration cap is `5` and can be overridden with `--max-iterations`.

`mock-repos/` contains three self-contained templates for manual testing:
- `mock-repos/sdk-demo`
- `mock-repos/cli-demo`
- `mock-repos/mcp-demo`

Run the benchmark directly against a tracked mock repo:

```bash
npx skill-benchmark run --config mock-repos/sdk-demo/benchmark.config.json
```

Run the optimizer against a materialized standalone copy so git checkpointing stays isolated from the main repository:

```bash
tsx src/optimizer/materialize-mock-repo.ts sdk-demo ./.tmp/mock-repos
tsx src/optimizer/main.ts ./.tmp/mock-repos/sdk-demo/optimize.config.json
```

Example `optimize.config.json`:

```json
{
  "benchmarkConfig": "./benchmark.config.json",
  "targetRepo": {
    "path": ".",
    "surface": "sdk",
    "allowedPaths": ["src", "docs", "examples", "README.md"],
    "validation": ["node ./scripts/validate.mjs"],
    "requireCleanGit": true
  },
  "optimizer": {
    "maxIterations": 5,
    "stabilityWindow": 2,
    "minOverallPassDelta": 0.01,
    "taskGeneration": {
      "enabled": false,
      "maxGenerated": 10,
      "seed": 1
    }
  },
  "mutation": {
    "provider": "openai",
    "model": "gpt-4o",
    "thinkingLevel": "medium",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

## Configuration

### SDK Surface

```json
{
  "name": "my-sdk",
  "surface": "sdk",
  "sdk": {
    "language": "typescript",
    "apiSurface": ["MyClient.constructor", "MyClient.getBalance", "MyWallet.send"]
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
    "models": [
      { "id": "openai/gpt-4.1", "name": "GPT-4.1", "tier": "flagship" }
    ]
  }
}
```

Supported `sdk.language` values:

| Language | Fence tag | Notes |
|---|---|---|
| `typescript` | `typescript` / `ts` | Best-covered SDK language in the current harness |
| `python` | `python` / `py` | Supports constructors, bound methods, keyword args, lists, and dict literals |
| `rust` | `rust` / `rs` | Supports associated functions, bound methods, and struct-literal args; complex macros/builder chains still degrade to dynamic values |

Python SDK example:

```json
{
  "name": "my-python-sdk",
  "surface": "sdk",
  "sdk": {
    "language": "python",
    "apiSurface": ["FastClient.constructor", "FastWallet.from_keyfile", "FastWallet.send"]
  },
  "tasks": "./tasks.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "models": [
      { "id": "openai/gpt-4.1", "name": "GPT-4.1", "tier": "flagship" }
    ]
  }
}
```

Rust SDK example:

```json
{
  "name": "my-rust-sdk",
  "surface": "sdk",
  "sdk": {
    "language": "rust",
    "apiSurface": ["FastClient.new", "FastWallet.from_keyfile", "FastWallet.send"]
  },
  "tasks": "./tasks.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "models": [
      { "id": "openai/gpt-4.1", "name": "GPT-4.1", "tier": "flagship" }
    ]
  }
}
```

### CLI Surface

```json
{
  "name": "my-cli",
  "surface": "cli",
  "cli": {
    "commands": "./commands.json"
  },
  "skill": {
    "source": "./SKILL.md"
  },
  "tasks": "./tasks-cli.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "models": [
      { "id": "openai/gpt-4.1-mini", "name": "GPT-4.1 Mini", "tier": "mid" }
    ]
  }
}
```

Example `commands.json`:

```json
[
  {
    "command": "fast deploy",
    "description": "Deploy an app",
    "options": [
      { "name": "name", "takesValue": true },
      { "name": "env", "takesValue": true }
    ]
  },
  {
    "command": "fast logs",
    "description": "Fetch logs",
    "options": [
      { "name": "service", "takesValue": true }
    ]
  }
]
```

### MCP Surface

```json
{
  "name": "my-mcp-tools",
  "surface": "mcp",
  "mcp": {
    "tools": "./tools.json"
  },
  "tasks": "./tasks-mcp.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "models": [
      { "id": "openai/gpt-4.1", "name": "GPT-4.1", "tier": "flagship" }
    ]
  }
}
```

## `skill.source` Behavior

`skill.source` is optional **guidance context**. It is included in prompts as reference context; it is not itself the evaluation target format.

Supported formats:

- `github:org/repo/path/to/SKILL.md`
- local file path (e.g. `./SKILL.md`)
- URL (e.g. `https://example.com/skill.md`)

## Tasks

Tasks are surface-agnostic and always use `expected_tools` for expected action names + args.

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

## CLI Reference

```text
skill-benchmark init
skill-benchmark run [options]
skill-benchmark compare [options]
```

Run options:

- `--config <path>`
- `--tier <flagship|mid|low>`
- `--task <task-id>`
- `--model <model-slug>`
- `--no-cache`

## Metrics

- **Tool Recall**: expected actions found / expected actions
- **Tool Precision**: matched actions / extracted known actions
- **Tool Selection Accuracy**: expected action names found (args ignored)
- **Argument Accuracy**: argument correctness when action name matched
- **Task Pass Rate**: all expected actions + args must match
- **Hallucination Rate**: surface-aware unknown action rate
- **Coverage**: known surface actions represented by tasks

## Project Structure

```text
src/
  cli.ts                CLI entrypoint
  benchmark/
    runner.ts           Surface-driven execution loop
    prompts.ts          Surface prompt contracts (sdk/cli/mcp)
    evaluator.ts        Matching + surface-aware hallucination logic
    reporter.ts         Markdown + console reporting
    config.ts           Config/task/tool/command loading
    extractors/         Surface extractors and SDK language adapters
    llm/                Provider adapters + transports
  optimizer/
    loop.ts             Sequential benchmark-driven improvement loop
    manifest.ts         Optimizer manifest loading/validation
```
