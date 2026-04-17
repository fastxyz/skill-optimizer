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
| Init config | `npx skill-optimizer init cli\|sdk\|mcp\|prompt` |
| Init (non-interactive) | `npx skill-optimizer init cli --yes` |
| Import CLI commands | `npx skill-optimizer import-commands --from ./src/cli.ts` |
| Import (binary scrape) | `npx skill-optimizer import-commands --from my-cli --scrape` |
| Diagnose config | `npx skill-optimizer doctor --config <config-path>` |
| Auto-fix config | `npx skill-optimizer doctor --fix --config <config-path>` |
| Dry run (no LLM calls) | `npx skill-optimizer run --dry-run --config <config-path>` |
| Run benchmark | `npx skill-optimizer run --config <config-path>` |
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

## Key Concepts

**Surfaces** — The callable interface of your project: SDK methods, CLI commands, MCP tools, or prompt templates. Skill-optimizer discovers these via tree-sitter code analysis, manifest files, or markdown parsing.

**Static evaluation** — Benchmark evaluation never executes generated code. Actions are extracted from model responses via pattern matching and compared structurally against expected calls. This makes benchmarks safe and repeatable.

**Verdict gates** — Two thresholds must both pass for a benchmark to receive a PASS verdict: `perModelFloor` (each model individually meets a minimum score) and `targetWeightedAverage` (the weighted mean across all models meets a target). A single model below the floor fails the entire run.

**Safety boundary** — The optimizer never modifies your original SKILL.md. It creates versioned copies in `.skill-optimizer/skill-v{N}.md` and only accepts mutations that improve scores without dropping any model below the floor. It does not modify tracked source files, but the generated artifacts appear under `.skill-optimizer/` — add that directory to your `.gitignore`.

**LLM routing** — By default (`format: "pi"`), all benchmark calls route through [OpenRouter](https://openrouter.ai) and need `OPENROUTER_API_KEY`. You can also call providers directly: `format: "anthropic"` uses the Anthropic API directly (`ANTHROPIC_API_KEY`), and `format: "openai"` uses the OpenAI API directly (`OPENAI_API_KEY`), with optional Codex browser-login auth via `authMode: "codex"`. The model ID prefix must match the format — see `references/config.md` for the full mapping.
