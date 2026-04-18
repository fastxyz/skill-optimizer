---
name: skill-optimizer
description: >
  Benchmark and optimize SDK, CLI, MCP, and prompt documentation so every LLM
  model can reliably call the right actions with correct arguments. Use when
  setting up skill-optimizer for a project, running benchmarks, interpreting
  results, optimizing SKILL.md files, or diagnosing configuration issues. Also
  use when working inside the skill-optimizer repository itself — for running
  against mock repos, testing changes, or understanding the codebase.
---

# skill-optimizer

Benchmark your SDK / CLI / MCP / prompt docs against multiple LLMs, measure whether they call the right actions with the right arguments, and iteratively rewrite your guidance until a quality floor is met across every model.

## Context Detection

Before doing anything, figure out where you are:

1. **Look for `skill-optimizer.json`** (in CWD or parent directories). If found, you are in a **configured target project**. Use that file path as `<config-path>` in all commands below.

2. **Look for `src/cli.ts` and a `package.json` with `"name": "skill-optimizer"`**. If found, you are in the **optimizer repo itself**. You can use dev commands directly (`npm run build`, `npm test`, `npx tsx src/cli.ts`). To benchmark a target, either use the mock repos in `mock-repos/` or point `--config` at an external project's config.

3. **Neither found** — you are in an **unconfigured target project**. Read `references/setup.md` to scaffold a config before proceeding.

## Quick Reference

| Task | Command |
|------|---------|
| Init config (interactive) | `npx skill-optimizer init cli\|sdk\|mcp\|prompt` |
| Init (non-interactive, explicit surface) | `npx skill-optimizer init cli --yes` |
| Init (auto-detect surface, non-interactive) | `npx skill-optimizer init --auto --yes` |
| Import CLI commands | `npx skill-optimizer import-commands --from ./src/cli.ts` |
| Import with output file | `npx skill-optimizer import-commands --from ./src/cli.ts --out ./commands.json` |
| Import (overwrite existing) | `npx skill-optimizer import-commands --from ./src/cli.ts --out ./commands.json --force` |
| Import (binary scrape) | `npx skill-optimizer import-commands --from my-cli --scrape --depth 3` |
| Diagnose config | `npx skill-optimizer doctor --config <config-path>` |
| Diagnose (skip code discovery) | `npx skill-optimizer doctor --config <config-path> --static` |
| Diagnose (verify model access) | `npx skill-optimizer doctor --config <config-path> --check-models` |
| Auto-fix config | `npx skill-optimizer doctor --fix --config <config-path>` |
| Dry run (no LLM calls) | `npx skill-optimizer run --dry-run --config <config-path>` |
| Run benchmark | `npx skill-optimizer run --config <config-path>` |
| Run (filter by model tier) | `npx skill-optimizer run --config <config-path> --tier flagship` |
| Generate tasks only | `npx skill-optimizer generate-tasks --config <config-path>` |
| Run optimizer | `npx skill-optimizer optimize --config <config-path>` |
| Compare two runs | `npx skill-optimizer compare --baseline a.json --current b.json` |

`<config-path>` is the path to your `skill-optimizer.json` — typically `./.skill-optimizer/skill-optimizer.json` after running `init`, or wherever you placed it.

## What Do You Need?

Read the reference file that matches your current goal:

| Goal | Reference |
|------|-----------|
| Set up skill-optimizer for a project (first time) | Read `references/setup.md` |
| Run a benchmark or understand results | Read `references/benchmark.md` |
| Automatically optimize a SKILL.md | Read `references/optimize.md` |
| Understand config options | Read `references/config.md` |

If you are in an **unconfigured project** (context detection case 3), start with `references/setup.md`.

## Command Details

### `init` — scaffold a skill-optimizer config

The `init` command has three modes:

1. **Interactive wizard** (default): `npx skill-optimizer init [surface]` — prompts you through setup. Optionally pass `cli`, `sdk`, `mcp`, or `prompt` as a positional argument to pre-select the surface type.

2. **Non-interactive with explicit surface**: `npx skill-optimizer init <surface> --yes` — accepts all defaults for the named surface without prompting.

3. **Auto-detect + non-interactive** (fully automated, zero prompts): `npx skill-optimizer init --auto --yes` — inspects the current directory to detect the surface type, then applies defaults without prompting. This is the right choice when the task says "initialize without prompts", "fully automated setup", or "detect and scaffold" — especially when the surface type isn't stated.

Key parameters:

| Parameter | Meaning | Notes |
|-----------|---------|-------|
| `[surface]` | Positional: `cli`, `sdk`, `mcp`, or `prompt` | Optional; omit when using `--auto` or running the interactive wizard |
| `--auto` | Auto-detect surface type from CWD | Detects surface; still prompts unless combined with `--yes` |
| `--yes` | Accept all defaults without prompting | Alone: needs explicit surface. With `--auto`: fully non-interactive. |
| `--answers <file.json>` | Load answers from a JSON file | For CI pipelines with a pre-built answers file |

**Critical:** `--auto` and `--yes` have independent effects. `--yes` alone still requires a surface name. `--auto` alone still opens the interactive wizard (pre-filled). Only `--auto --yes` together produces a completely non-interactive run.

```
# Fully automated: detect surface + accept defaults (no prompts at all)
npx skill-optimizer init --auto --yes

# Explicit surface, no prompts
npx skill-optimizer init cli --yes

# Interactive wizard for MCP surface
npx skill-optimizer init mcp
```

### `doctor` — diagnose your configuration

The base command validates your `skill-optimizer.json` and checks that discovered surfaces are intact. Two optional flags activate additional checks that are *off by default*:

- `--static` — skip live code discovery (tree-sitter analysis). Use this when you want to validate config and manifests without requiring the project source to be present, or to speed up CI checks. **Do not confuse with `--no-discovery` — the correct flag is `--static`.**
- `--check-models` — ping each configured model to verify API credentials and routing are working. Use this when you suspect auth issues or want to confirm model availability before a benchmark run. **The flag is `--check-models`, not `--ping` or `--verify-models`.**

These flags are independent and can be combined:
```
npx skill-optimizer doctor --config ./skill-optimizer.json --static
npx skill-optimizer doctor --config ./skill-optimizer.json --check-models
npx skill-optimizer doctor --config ./skill-optimizer.json --static --check-models
```

### `import-commands` — extract CLI surface from source or binary

Discovery mode is determined by whether `--scrape` is present:

- **Source mode** (default): `--from` points to a TypeScript/JavaScript file (e.g. `./src/cli.ts`). Tree-sitter parses commands statically.
- **Scrape mode**: Add `--scrape` to invoke the binary named in `--from` and walk its `--help` output.

Key parameters:

| Parameter | Meaning | Notes |
|-----------|---------|-------|
| `--from <source>` | File path or binary name to import from | Required |
| `--out <path>` | Write discovered commands to this JSON file | Optional; without it, output goes to stdout |
| `--force` | Overwrite `--out` file if it already exists | Required when the output file exists; without it the command refuses to overwrite |
| `--scrape` | Invoke as a binary and parse `--help` output | Enables scrape mode |
| `--depth <n>` | Max subcommand depth to explore during scrape | Only meaningful with `--scrape`; **the flag is `--depth`, not `--max-depth`** |

Output goes to the `--out` file — **do not use shell redirection (`>`) to capture output** because the tool writes structured JSON with metadata that is not suitable for piping.

```
# Source import, write to file (safe to re-run with --force)
npx skill-optimizer import-commands --from ./src/cli.ts --out ./commands.json --force

# Scrape a binary, limit depth to 3 levels
npx skill-optimizer import-commands --from my-app --scrape --depth 3
```

### `run` — execute the benchmark

Filterable via:
- `--tier <name>` — only run models whose tier matches. Valid values: `flagship`, `mid`, `budget`. **The flag is `--tier`, not `--model-tier`.**
- `--model <id>` — run a single specific model.
- `--dry-run` — generate prompts and tasks without making LLM calls.

```
npx skill-optimizer run --config ./skill-optimizer.json --tier flagship
npx skill-optimizer run --config ./skill-optimizer.json --tier mid
```

## Key Concepts

**Surfaces** — The callable interface of your project: SDK methods, CLI commands, MCP tools, or prompt templates. Skill-optimizer discovers these via tree-sitter code analysis, manifest files, or markdown parsing.

**Static evaluation** — Benchmark evaluation never executes generated code. Actions are extracted from model responses via pattern matching and compared structurally against expected calls. This makes benchmarks safe and repeatable.

**Verdict gates** — Two thresholds must both pass for a benchmark to receive a PASS verdict: `perModelFloor` (each model individually meets a minimum score) and `targetWeightedAverage` (the weighted mean across all models meets a target). A single model below the floor fails the entire run.

**Safety boundary** — The optimizer never modifies your original SKILL.md. It creates versioned copies in `.skill-optimizer/skill-v{N}.md` and only accepts mutations that improve scores without dropping any model below the floor. It does not modify tracked source files, but the generated artifacts appear under `.skill-optimizer/` — add that directory to your `.gitignore`.

**LLM routing** — By default (`format: "pi"`), all benchmark calls route through [OpenRouter](https://openrouter.ai) and need `OPENROUTER_API_KEY`. You can also call providers directly: `format: "anthropic"` uses the Anthropic API directly (`ANTHROPIC_API_KEY`), and `format: "openai"` uses the OpenAI API directly (`OPENAI_API_KEY`), with optional Codex browser-login auth via `authMode: "codex"`. The model ID prefix must match the format — see `references/config.md` for the full mapping.
