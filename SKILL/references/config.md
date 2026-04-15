# Configuration Reference

Complete reference for `skill-optimizer.json`. For auto-generated schema docs, see `docs/reference/config-schema.md` in the skill-optimizer repo.

## Minimal Working Configs

### CLI surface

```json
{
  "name": "my-cli-tool",
  "target": {
    "surface": "cli",
    "repoPath": "/path/to/my-project",
    "skill": "./SKILL.md",
    "discovery": {
      "mode": "auto",
      "sources": ["src/cli.ts"]
    }
  },
  "benchmark": {
    "format": "pi",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [
      { "id": "openrouter/anthropic/claude-sonnet-4.6", "name": "Claude Sonnet", "tier": "flagship" }
    ]
  }
}
```

### SDK surface

```json
{
  "name": "my-sdk",
  "target": {
    "surface": "sdk",
    "repoPath": "/path/to/my-sdk",
    "skill": "./SKILL.md",
    "discovery": {
      "mode": "auto",
      "sources": ["src/index.ts"],
      "language": "typescript"
    }
  },
  "benchmark": {
    "format": "pi",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [
      { "id": "openrouter/anthropic/claude-sonnet-4.6", "name": "Claude Sonnet", "tier": "flagship" }
    ]
  }
}
```

### MCP surface

```json
{
  "name": "my-mcp-server",
  "target": {
    "surface": "mcp",
    "repoPath": "/path/to/my-mcp-server",
    "skill": "./SKILL.md",
    "discovery": {
      "mode": "auto",
      "sources": ["src/server.ts"]
    }
  },
  "benchmark": {
    "format": "pi",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [
      { "id": "openrouter/anthropic/claude-sonnet-4.6", "name": "Claude Sonnet", "tier": "flagship" }
    ]
  }
}
```

## Field-by-Field Reference

### `target` — What You're Benchmarking

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `surface` | Yes | — | `"cli"`, `"sdk"`, or `"mcp"` |
| `repoPath` | Yes | — | Absolute or config-relative path to your project root |
| `skill` | Yes | — | Path to your SKILL.md or guidance doc, relative to `repoPath` |
| `discovery.mode` | No | `"auto"` | `"auto"` (tree-sitter) or `"manifest"` (hand-written JSON) |
| `discovery.sources` | No | `[]` | Source files for tree-sitter to parse, relative to `repoPath` |
| `discovery.language` | No | — | SDK only: `"typescript"`, `"python"`, or `"rust"` |
| `scope.include` | No | `["*"]` | Glob patterns for actions to include |
| `scope.exclude` | No | `[]` | Glob patterns for actions to exclude |

### `benchmark` — How to Test

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `format` | No | `"pi"` | Benchmark format (uses OpenRouter via pi-ai) |
| `apiKeyEnv` | No | `"OPENROUTER_API_KEY"` | Environment variable name holding the API key |
| `models[].id` | Yes | — | OpenRouter model ID (e.g., `"openrouter/anthropic/claude-sonnet-4.6"`) |
| `models[].name` | No | — | Human-readable label for output tables |
| `models[].tier` | No | — | `"flagship"`, `"mid"`, or `"budget"` (informational only) |
| `models[].weight` | No | `1.0` | Influence on weighted average (higher = counts more) |
| `verdict.perModelFloor` | No | `0.6` | Minimum score each model must reach individually |
| `verdict.targetWeightedAverage` | No | `0.7` | Minimum weighted average across all models |
| `taskGeneration.enabled` | No | `true` | Whether to auto-generate tasks |
| `taskGeneration.maxTasks` | No | `20` | Upper bound on tasks (must be >= in-scope action count) |
| `taskGeneration.outputDir` | No | `".skill-optimizer"` | Where to write task artifacts |

### `optimize` — How to Improve

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `enabled` | No | `true` | Whether optimization is allowed |
| `mode` | No | `"stable-surface"` | `"stable-surface"` (reuse tasks) or `"surface-changing"` (regenerate per iteration) |
| `model` | No | `"openrouter/anthropic/claude-opus-4.6"` | Which LLM writes mutations |
| `maxIterations` | No | `5` | Maximum optimization rounds |
| `allowedPaths` | No | `["SKILL.md"]` | Files the mutation agent may edit |
| `requireCleanGit` | No | `true` | Block optimizer if target repo has uncommitted changes |

## Model Configuration Tips

- Browse available models at [openrouter.ai/models](https://openrouter.ai/models)
- **Recommended starter set:** one flagship (Claude Sonnet or GPT-4o) + one budget model (Gemini Flash or Haiku) to test both capability ends
- **Weighting strategy:** set flagship models to `weight: 2.0` and budget to `weight: 0.5` if flagship performance matters most to you
- `tier` is informational only — it appears in output tables but doesn't affect scoring

## Scope Patterns

The `*` wildcard matches any sequence of characters, including dots and slashes. It is not limited to a single path segment like filesystem globs.

| Pattern | Matches |
|---------|---------|
| `"Wallet.*"` | All Wallet methods (`Wallet.create`, `Wallet.balance`, etc.) |
| `"*.internal*"` | Anything with "internal" in the name |
| `"get_*"` | Only getter actions |
| `["create_*", "update_*", "delete_*"]` | Only mutation actions |

Task generation is **coverage-guaranteed**: every in-scope action gets at least one task. If coverage fails after retries, an error names the uncovered actions and suggests either fixing SKILL.md guidance or excluding them.

## Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `E_MISSING_SKILL` | `target.skill` file not found | Create the file or fix the path in config |
| `E_INVALID_SURFACE` | `target.surface` is not cli/sdk/mcp | Use one of the three valid values |
| `E_DIRTY_GIT` | Uncommitted changes in target repo | Commit or stash, or set `requireCleanGit: false` |
| `E_EMPTY_SCOPE` | Scope filters matched no actions | Check your `include`/`exclude` patterns |
| `E_MISSING_API_KEY` | `OPENROUTER_API_KEY` not set | `export OPENROUTER_API_KEY=sk-or-...` |

Full error reference with detailed descriptions: `docs/reference/errors.md`

Full config schema reference (auto-generated from Zod): `docs/reference/config-schema.md`
