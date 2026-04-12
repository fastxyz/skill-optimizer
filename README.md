# skill-optimizer

Benchmark and self-optimize SDK, CLI, and MCP guidance so every agent model can use your tool reliably.

skill-optimizer runs your SDK / CLI / MCP docs against multiple LLMs, measures whether they call the right actions with the right arguments, and iteratively rewrites your `SKILL.md` / docs until a floor score is met across every model.

## Quickstart

```bash
git clone https://github.com/bucurdavid/skill-optimizer
cd skill-optimizer
npm install
export OPENROUTER_API_KEY=sk-or-...

# scaffold a config against your repo
npx tsx src/cli.ts init

# run the end-to-end loop
npx tsx src/cli.ts optimize --config ./skill-optimizer.json
```

## How it works

1. **Discover** callable surface (SDK methods / CLI commands / MCP tools) via tree-sitter or a manifest.
2. **Scope** the surface with `target.scope.include` / `target.scope.exclude` globs.
3. **Generate tasks** — one prompt per in-scope action, coverage-guaranteed.
4. **Benchmark** — every configured model attempts every task; static evaluator checks action calls + args.
5. **Verdict** — PASS/FAIL against two gates (per-model floor, weighted average).
6. **Optimize** — mutate `SKILL.md` / docs inside `allowedPaths`, re-benchmark, accept only if both gates hold, rollback if not.
7. **Recommendations** — on FAIL, one critic call summarizes what to improve manually.

## Configuration reference

All configuration lives in a single `skill-optimizer.json` file.

### `target` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `surface` | `"sdk" \| "cli" \| "mcp"` | required | Type of callable surface |
| `repoPath` | `string` | `.` | Path to the target repo |
| `skill` | `string \| { source: string; cache?: boolean }` | — | Path to SKILL.md |
| `discovery.mode` | `"auto" \| "manifest"` | `"auto"` | How to discover actions |
| `discovery.sources` | `string[]` | — | Source files for tree-sitter discovery |
| `discovery.language` | `"typescript" \| "python" \| "rust"` | — | Language for code-first discovery |
| `discovery.fallbackManifest` | `string` | — | Path to manifest JSON when code-first discovery is incomplete |
| `sdk.language` | `"typescript" \| "python" \| "rust"` | — | SDK language |
| `sdk.entrypoints` | `string[]` | — | SDK entry files |
| `cli.commands` | `string` | — | Path to CLI commands manifest JSON |
| `mcp.tools` | `string` | — | Path to MCP tools manifest JSON |

### `benchmark` fields

| Field | Type | Default | Description |
|---|---|---|---|
| `format` | `"pi"` | `"pi"` | LLM transport format |
| `apiKeyEnv` | `string` | `OPENROUTER_API_KEY` | Env var name for the API key |
| `timeout` | `number` | `240000` | Ms per model call |
| `models` | `Array<{ id: string; name: string; tier: "flagship"\|"mid"\|"low"; weight?: number }>` | required | Models to benchmark |
| `taskGeneration.enabled` | `boolean` | `false` | Whether to generate tasks automatically |
| `taskGeneration.maxTasks` | `number` | `10` | Max tasks to generate (must be >= scope size) |
| `taskGeneration.seed` | `number` | `1` | RNG seed for reproducible generation |
| `output.dir` | `string` | `benchmark-results/` | Where reports are saved |
| `verdict.perModelFloor` | `number` | `0.6` | Minimum per-model pass fraction for a PASS verdict |
| `verdict.targetWeightedAverage` | `number` | `0.7` | Minimum weighted average across all models for a PASS verdict |

### `optimize` fields (all optional)

| Field | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | — | Model for mutation (e.g. `openrouter/anthropic/claude-sonnet-4-6`) |
| `apiKeyEnv` | `string` | — | Env var for the optimizer's API key |
| `thinkingLevel` | `"off"\|"minimal"\|"low"\|"medium"\|"high"\|"xhigh"` | `"medium"` | Reasoning depth for mutation calls |
| `allowedPaths` | `string[]` | — | Paths the optimizer may edit (safety boundary) |
| `validation` | `string[]` | — | Shell commands to run to validate each mutation |
| `requireCleanGit` | `boolean` | `true` | Require clean git state before starting |
| `maxIterations` | `number` | `5` | Maximum optimization iterations |
| `minImprovement` | `number` | `0.02` | Minimum weighted-average gain per accepted iteration |
| `reportContextMaxBytes` | `number` | `16000` | Byte budget for mutation context |

### Annotated example config

```json
{
  "name": "my-mcp-project",
  "target": {
    "surface": "mcp",
    "repoPath": ".",
    "skill": "./SKILL.md",
    "discovery": {
      "mode": "auto",
      "sources": ["./src/server.ts"]
    }
  },
  "benchmark": {
    "format": "pi",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "models": [
      { "id": "openrouter/anthropic/claude-sonnet-4-6", "name": "Claude Sonnet", "tier": "flagship", "weight": 2 },
      { "id": "openrouter/openai/gpt-4o-mini",          "name": "GPT-4o mini",   "tier": "mid",      "weight": 1 }
    ],
    "taskGeneration": {
      "enabled": true,
      "maxTasks": 20,
      "seed": 1
    },
    "output": { "dir": "./benchmark-results" },
    "verdict": {
      "perModelFloor": 0.6,
      "targetWeightedAverage": 0.7
    }
  },
  "optimize": {
    "model": "openrouter/anthropic/claude-sonnet-4-6",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "thinkingLevel": "medium",
    "allowedPaths": ["SKILL.md"],
    "requireCleanGit": true,
    "maxIterations": 5,
    "minImprovement": 0.02,
    "reportContextMaxBytes": 16000
  }
}
```

## Interpreting the verdict

Every benchmark run produces one of two verdicts: **PASS** or **FAIL**.

Two gates must both be satisfied for a PASS:

- **`benchmark.verdict.perModelFloor`** (default `0.6`): every model must pass at least this fraction of tasks. A single model below the floor fails the run, regardless of the average.
- **`benchmark.verdict.targetWeightedAverage`** (default `0.7`): the weighted average score across all models must reach this threshold.

**`benchmark.models[].weight`** (default `1.0`): heavier-weighted models count more toward the weighted average. Use higher weights for flagship models you care most about.

The **optimizer** only accepts a mutation when:
1. the weighted average improves by at least `minImprovement`, AND
2. no model that was above the floor drops below it.

**Exit codes**: `0` = PASS, `1` = FAIL — usable directly in CI pipelines.

## Scope & coverage

Control which actions are benchmarked with `target.scope`:

- **`target.scope.include`** (default `["*"]`): glob patterns for actions to include.
- **`target.scope.exclude`** (default `[]`): glob patterns for actions to exclude.

The `*` wildcard matches any sequence of characters including dots and slashes — it is not limited to a single path segment.

Examples:
- `"Wallet.*"` — includes all Wallet methods
- `"*.internal*"` — excludes anything with "internal" anywhere in the name
- `"get_*"` — includes only getter actions

Task generation is **coverage-guaranteed**: every in-scope action gets at least one task. If the first generation pass misses any, a targeted retry runs (max 2 iterations). If coverage still fails, an error names the uncovered actions and suggests either fixing SKILL.md guidance or adding them to `scope.exclude`.

## Cost notes

Rough LLM spend per run:

- **Baseline benchmark**: N models × M tasks LLM calls.
- **Optimizer iteration**: 1 mutation call + N models × M tasks re-benchmark per iteration.
- **Recommendations**: 1 critic call, only on FAIL verdict.

No per-failure LLM calls — feedback is deterministic (structured failure details + patterns + passing/failing diffs).

## Dependencies

The optimizer's coding agent is powered by `@mariozechner/pi-coding-agent` — a small OSS wrapper around OpenRouter that handles agent sessions and tool loops. Models are accessed through [OpenRouter](https://openrouter.ai/) — you need one API key for everything.

## Troubleshooting

**Missing `OPENROUTER_API_KEY`**: Set it in your shell before running:
```bash
export OPENROUTER_API_KEY=sk-or-...
```

**Dirty git**: The optimizer requires a clean git state in the target repo (`requireCleanGit: true` by default). Commit or stash uncommitted changes before running.

**`maxTasks < scope_size`**: `benchmark.taskGeneration.maxTasks` must be >= the number of in-scope actions. Run `npx tsx src/cli.ts --dry-run --config ./skill-optimizer.json` to see the count without making LLM calls.

**Empty scope**: `target.scope.include` matched nothing. Check your glob patterns — remember `*` matches everything including dots.

**Legacy `skill-benchmark.json`**: Rename it to `skill-optimizer.json`. The loader will tell you if it finds the old name.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
