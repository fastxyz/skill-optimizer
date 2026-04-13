# skill-optimizer

Benchmark and self-optimize SDK, CLI, and MCP guidance so every agent model can use your tool reliably.

skill-optimizer runs your SDK / CLI / MCP docs against multiple LLMs, measures whether they call the right actions with the right arguments, and iteratively rewrites your `SKILL.md` / docs until a floor score is met across every model.

## Quickstart

```bash
export OPENROUTER_API_KEY=sk-or-...

# Auto-detect project type and pre-fill wizard
npx skill-optimizer init --auto

# Or specify the surface directly
npx skill-optimizer init cli       # or: init sdk, init mcp

# Non-interactive: accept all defaults
npx skill-optimizer init cli --yes

# CI mode: load answers from a JSON file
npx skill-optimizer init --answers answers.json
```

`init` creates a `skill-optimizer/` directory with:
- `skill-optimizer.json` — the main config (commit this)
- `skill-optimizer/.skill-optimizer/` — generated artifacts (gitignored)
  - `cli-commands.json` — CLI surface: auto-extracted via `import-commands`, or template
  - `tools.json` — MCP surface: template to edit with your real tools

**`answers.json` format for CI/`--answers` mode:**
```json
{
  "surface": "cli",
  "repoPath": "/absolute/path/to/your-repo",
  "models": ["openrouter/anthropic/claude-sonnet-4-6", "openrouter/openai/gpt-4o"],
  "maxTasks": 20,
  "maxIterations": 5,
  "entryFile": "src/cli.ts"
}
```

Open `skill-optimizer/skill-optimizer.json` and review these fields:

| Field | What it does | Set it to |
|-------|-------------|-----------|
| `target.repoPath` | Root of the project being benchmarked | Absolute or relative path to your repo |
| `target.discovery.sources` | Source files to scan for callable methods/commands/tools | e.g. `["../src/index.ts"]` or `["../src/server.ts"]` |
| `target.skill` | Docs file the optimizer will edit | Path to your `SKILL.md` or equivalent guidance doc |
| `benchmark.models` | Models to benchmark | Valid [OpenRouter](https://openrouter.ai/models) model IDs |

For CLI and MCP surfaces: if code-first discovery yields nothing, edit the companion manifest (`cli-commands.json` or `tools.json`) with your real commands/tools — the config already points to it as a fallback.

Tasks are generated automatically from your discovered surface — you don't need to write them manually.

Then run the benchmark:

```bash
npx skill-optimizer run --config ./skill-optimizer/skill-optimizer.json
```

## How it works

1. **Discover** callable surface (SDK methods / CLI commands / MCP tools) via tree-sitter or a manifest.
2. **Scope** the surface with `target.scope.include` / `target.scope.exclude` globs.
3. **Generate tasks** — one prompt per in-scope action, coverage-guaranteed.
4. **Benchmark** — every configured model attempts every task; static evaluator checks action calls + args.
5. **Verdict** — PASS/FAIL against two gates (per-model floor, weighted average).
6. **Optimize** — create a local versioned copy of your `SKILL.md` (`skill-v{N}.md` in `.skill-optimizer/`), mutate it, re-benchmark, accept only if both gates hold, rollback if not. The target repo's original skill file is never modified.
7. **Recommendations** — on FAIL, one critic call summarizes what to improve manually.
8. **Progress table** — after the optimizer finishes, a per-model table shows Baseline → each iteration → Final → Δ so you can see exactly where each model improved.

## Configuration reference

See [docs/reference/config-schema.md](docs/reference/config-schema.md) for the full generated config reference — auto-updated at every build.

See [docs/reference/errors.md](docs/reference/errors.md) for all error codes, descriptions, and fix instructions.

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

**Dirty git**: The optimizer requires a clean git state in the target repo (`requireCleanGit: true` by default). Commit or stash uncommitted changes before running. Note: the optimizer never writes to the target repo's skill file — it works from local versioned copies in `.skill-optimizer/`.

**`maxTasks < scope_size`**: `benchmark.taskGeneration.maxTasks` must be >= the number of in-scope actions. Run `npx skill-optimizer --dry-run --config ./skill-optimizer.json` to see the count without making LLM calls.

**Empty scope**: `target.scope.include` matched nothing. Check your glob patterns — remember `*` matches everything including dots.

**Legacy `skill-benchmark.json`**: Rename it to `skill-optimizer.json`. The loader will tell you if it finds the old name.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
