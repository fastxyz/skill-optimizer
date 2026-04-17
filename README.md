# skill-optimizer

Benchmark and self-optimize SDK, CLI, and MCP guidance so every agent model can use your tool reliably.

skill-optimizer runs your SDK / CLI / MCP docs against multiple LLMs, measures whether they call the right actions with the right arguments, and iteratively rewrites your `SKILL.md` / docs until a floor score is met across every model.

Built by the team at [Fast](https://fast.xyz/) — payment infrastructure for AI agents. [Give your agent a wallet](https://github.com/fastxyz/fast-sdk) in 3 lines of code.

**Requirements:** Node.js 20+, plus either an [OpenRouter](https://openrouter.ai) API key or a local Codex login when using direct OpenAI models.

## How it works — at a glance

![Optimizer Loop](https://raw.githubusercontent.com/fastxyz/skill-optimizer/main/docs/images/optimizer-loop.svg)

`skill-optimizer run` benchmarks your callable surface against multiple LLMs — it discovers actions, generates tasks, calls each model, and statically evaluates action recall and argument accuracy to produce a PASS/FAIL verdict (exit 0/1) usable in CI.

`skill-optimizer optimize` runs the benchmark as a feedback loop: it copies your SKILL.md, mutates it with an LLM agent, re-benchmarks, accepts only when scores improve, and repeats until stable. Your original SKILL.md is never modified.

## Installation

```bash
git clone https://github.com/fastxyz/skill-optimizer
cd skill-optimizer
npm install
npm run build
npm link        # makes `skill-optimizer` available globally
```

## Quickstart

```bash
export OPENROUTER_API_KEY=sk-or-...
```

For direct OpenAI API calls you can use your local Codex browser login instead of exporting `OPENAI_API_KEY` — set `format: "openai"` and `authMode: "codex"`:

```json
{
  "benchmark": {
    "format": "openai",
    "authMode": "codex",
    "models": [
      { "id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "flagship" }
    ]
  }
}
```

Codex auth reads a browser-login JWT or a static `OPENAI_API_KEY` from `~/.codex/auth.json`. It only applies to `openai/` model refs; `openrouter/` models always use `OPENROUTER_API_KEY`.

**Step 1 — Scaffold config** (run from your project root):

```bash
npx skill-optimizer init cli       # or: init sdk, init mcp, init prompt
```

The wizard asks for your repo path, models to benchmark, and where your `SKILL.md` lives. It creates a `.skill-optimizer/` directory:
- `.skill-optimizer/skill-optimizer.json` — the main config (commit this)
- `.skill-optimizer/cli-commands.json` — CLI surface manifest (template to edit, or auto-extracted)
- `.skill-optimizer/tools.json` — MCP surface manifest (template to edit)

**Step 2 — (CLI/MCP only) Extract your surface** if code-first discovery yields nothing:

```bash
npx skill-optimizer import-commands --from ./src/cli.ts
# or for a compiled binary:
npx skill-optimizer import-commands --from my-cli --scrape
```

**Step 3 — Run a benchmark:**

```bash
npx skill-optimizer run --config ./.skill-optimizer/skill-optimizer.json
```

**Step 4 — Run the optimizer** (iteratively improves your `SKILL.md`):

```bash
npx skill-optimizer optimize --config ./.skill-optimizer/skill-optimizer.json
```

The optimizer never modifies your original `SKILL.md` — it works from versioned local copies in `.skill-optimizer/` and prints a progress table at the end showing per-model improvement.

---

**Non-interactive / CI mode:**

```bash
# Accept all wizard defaults without prompts
npx skill-optimizer init cli --yes

# Load answers from a JSON file
npx skill-optimizer init --answers answers.json
```

`answers.json` format:
```json
{
  "surface": "cli",
  "repoPath": "/absolute/path/to/your-repo",
  "models": [
    "openrouter/anthropic/claude-sonnet-4.6",
    "openrouter/deepseek/deepseek-v3.2",
    "openrouter/google/gemini-2.5-flash",
    "openrouter/qwen/qwen3.5-397b-a17b",
    "openrouter/moonshotai/kimi-k2.5",
    "openrouter/z-ai/glm-5.1",
    "openrouter/minimax/minimax-m2.7",
    "openrouter/google/gemma-4-31b-it",
    "openrouter/meta-llama/llama-4-maverick"
  ],
  "maxTasks": 20,
  "maxIterations": 5,
  "entryFile": "src/cli.ts"
}
```

**Key config fields** in `.skill-optimizer/skill-optimizer.json`:

| Field | What it does | Set it to |
|-------|-------------|-----------|
| `target.repoPath` | Root of the project being benchmarked | Absolute or relative path to your repo |
| `target.discovery.sources` | Source files to scan for callable methods/commands/tools | e.g. `["../src/index.ts"]` or `["../src/server.ts"]` |
| `target.skill` | Docs file the optimizer will edit | Path to your `SKILL.md` or equivalent guidance doc |
| `benchmark.models` | Models to benchmark | Model IDs with provider prefix: `openrouter/<provider>/<model>` (via OpenRouter), `anthropic/<model>` (direct Anthropic), `openai/<model>` (direct OpenAI) |
| `benchmark.authMode` | How model auth is resolved | `env` (default), `codex`, or `auto` |

### Prompt templates / Claude Code skills

Benchmark how well models follow your prompt templates:

```bash
skill-optimizer init prompt
skill-optimizer run
```

The prompt surface discovers phases and capabilities from your SKILL.md,
generates scenario-based tasks, and evaluates output quality — not just
tool calls. Each task is tagged with the specific capability it exercises
(`capabilityId`), and scoring is performed against that capability's
criteria — not the first discovered capability. It scores responses on
required sections, format patterns, forbidden keywords, and structural
elements (code blocks, numbered lists, tables). Coverage violations do
not hard-fail prompt runs; coverage is informational for the prompt
surface. This lets you optimize prompt templates the same way you
optimize SDK/CLI/MCP guidance.

## How it works

1. **Discover** callable surface (SDK methods / CLI commands / MCP tools / prompt phases) via tree-sitter, manifest, or markdown parsing.
2. **Scope** the surface with `target.scope.include` / `target.scope.exclude` globs.
3. **Generate tasks** — one prompt per in-scope action, coverage-guaranteed.
4. **Benchmark** — every configured model attempts every task; static evaluator checks action calls + args.
5. **Verdict** — PASS/FAIL against two gates (per-model floor, weighted average).
6. **Optimize** — create a local versioned copy of your `SKILL.md` (`skill-v{N}.md` in `.skill-optimizer/`), mutate it, re-benchmark, accept only if both gates hold, rollback if not. The target repo's original skill file is never modified.
7. **Recommendations** — on FAIL, one critic call summarizes what to improve manually.
8. **Progress table** — after the optimizer finishes, a per-model table shows Baseline → each iteration → Final → Δ so you can see exactly where each model improved.

## Configuration reference

See [docs/reference/config-schema.md](https://github.com/fastxyz/skill-optimizer/blob/main/docs/reference/config-schema.md) for the full generated config reference — auto-updated at every build.

See [docs/reference/errors.md](https://github.com/fastxyz/skill-optimizer/blob/main/docs/reference/errors.md) for all error codes, descriptions, and fix instructions.

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

The optimizer's coding agent is powered by `@mariozechner/pi-coding-agent`. OpenRouter-backed runs still use your configured API key env var. Direct OpenAI runs can use either `OPENAI_API_KEY` or the browser-login tokens that Codex stores in `~/.codex/auth.json`.

## Troubleshooting

**Missing `OPENROUTER_API_KEY`**: Set it in your shell before running:
```bash
export OPENROUTER_API_KEY=sk-or-...
```

**Using Codex auth**: Set `benchmark.authMode` (and optionally `optimize.authMode`) to `"codex"` or `"auto"` and use direct OpenAI model refs such as `openai/gpt-5.4`. Codex auth only applies to the `openai` provider and reads either a browser-login access token or `OPENAI_API_KEY` from `~/.codex/auth.json`. Alternatively, set `benchmark.format` to `"openai"` with `authMode: "codex"` and `openai/...` model IDs — the client bridges to the Pi/Codex path automatically.

**Dirty git**: The optimizer requires a clean git state in the target repo (`requireCleanGit: true` by default). Commit or stash uncommitted changes before running. Note: the optimizer never writes to the target repo's skill file — it works from local versioned copies in `.skill-optimizer/`.

**`maxTasks < scope_size`**: `benchmark.taskGeneration.maxTasks` must be >= the number of in-scope actions. Run `npx skill-optimizer --dry-run --config .skill-optimizer/skill-optimizer.json` to see the count without making LLM calls.

**Empty scope**: `target.scope.include` matched nothing. Check your glob patterns — remember `*` matches everything including dots.

## Contributing

See [CONTRIBUTING.md](https://github.com/fastxyz/skill-optimizer/blob/main/CONTRIBUTING.md).
