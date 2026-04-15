# Skill-Optimizer SKILL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a multi-file SKILL/ folder that guides AI agents through benchmarking and optimizing SDK/CLI/MCP documentation with skill-optimizer.

**Architecture:** Five markdown files using progressive disclosure — SKILL.md entry point (~200 lines, always loaded) routes to four reference files loaded on demand. Context detection adapts guidance based on whether the agent is in the optimizer repo, a configured target, or an unconfigured project.

**Tech Stack:** Markdown only. No code, no dependencies.

**Spec:** `docs/specs/2026-04-15-skill-optimizer-skill-design.md`

---

### Task 1: Create Branch

**Files:** None (git operation only)

- [ ] **Step 1: Create and checkout feature branch**

```bash
cd /root/openclaw-workspace/skill-benchmark
git checkout -b feat/skill-optimizer-skill
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `feat/skill-optimizer-skill`

---

### Task 2: Create SKILL/SKILL.md (Entry Point)

**Files:**
- Create: `SKILL/SKILL.md`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p SKILL/references
```

- [ ] **Step 2: Write SKILL/SKILL.md**

Write the following content to `SKILL/SKILL.md`:

````markdown
---
name: skill-optimizer
description: >
  Benchmark and optimize SDK, CLI, and MCP documentation so every LLM model
  can reliably call the right actions with correct arguments. Use when setting
  up skill-optimizer for a project, running benchmarks, interpreting results,
  optimizing SKILL.md files, or diagnosing configuration issues. Also use when
  working inside the skill-optimizer repository itself — for running against
  mock repos, testing changes, or understanding the codebase.
---

# skill-optimizer

Benchmark your SDK / CLI / MCP docs against multiple LLMs, measure whether they call the right actions with the right arguments, and iteratively rewrite your guidance until a quality floor is met across every model.

## Context Detection

Before doing anything, figure out where you are:

1. **Look for `skill-optimizer.json`** (in CWD or parent directories). If found, you are in a **configured target project**. Use that file path as `<config-path>` in all commands below.

2. **Look for `src/cli.ts` and a `package.json` with `"name": "skill-optimizer"`**. If found, you are in the **optimizer repo itself**. You can use dev commands directly (`npm run build`, `npm test`, `npx tsx src/cli.ts`). To benchmark a target, either use the mock repos in `mock-repos/` or point `--config` at an external project's config.

3. **Neither found** — you are in an **unconfigured target project**. Read `references/setup.md` to scaffold a config before proceeding.

## Quick Reference

| Task | Command |
|------|---------|
| Init config | `npx skill-optimizer init cli\|sdk\|mcp` |
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

`<config-path>` is the path to your `skill-optimizer.json` — typically `./skill-optimizer/skill-optimizer.json` after running `init`, or wherever you placed it.

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

**Surfaces** — The callable interface of your project: SDK methods, CLI commands, or MCP tools. Skill-optimizer discovers these via tree-sitter code analysis or from a hand-written manifest file.

**Static evaluation** — Benchmark evaluation never executes generated code. Actions are extracted from model responses via pattern matching and compared structurally against expected calls. This makes benchmarks safe and repeatable.

**Verdict gates** — Two thresholds must both pass for a benchmark to receive a PASS verdict: `perModelFloor` (each model individually meets a minimum score) and `targetWeightedAverage` (the weighted mean across all models meets a target). A single model below the floor fails the entire run.

**Safety boundary** — The optimizer never modifies your original SKILL.md. It creates versioned copies in `.skill-optimizer/skill-v{N}.md` and only accepts mutations that improve scores without dropping any model below the floor. Your working tree stays clean.

**OpenRouter** — All LLM calls go through [OpenRouter](https://openrouter.ai). You need one API key (`OPENROUTER_API_KEY`) for everything — benchmarking and optimization.
````

- [ ] **Step 3: Verify the file exists and has frontmatter**

Run: `head -5 SKILL/SKILL.md`
Expected: lines starting with `---`, then `name: skill-optimizer`

- [ ] **Step 4: Commit**

```bash
git add SKILL/SKILL.md
git commit -m "feat(skill): add SKILL.md entry point with context detection and routing"
```

---

### Task 3: Create SKILL/references/setup.md

**Files:**
- Create: `SKILL/references/setup.md`

- [ ] **Step 1: Write SKILL/references/setup.md**

Write the following content to `SKILL/references/setup.md`:

````markdown
# Setup & Init

This guide walks through setting up skill-optimizer for your project, from prerequisites to a verified configuration.

## 1. Prerequisites

Before starting, verify these three requirements:

**Node.js 20+:**
```bash
node --version
# Expected: v20.x.x or higher
```

**OpenRouter API key:**
```bash
echo $OPENROUTER_API_KEY
# Expected: sk-or-... (not empty)
# If missing: export OPENROUTER_API_KEY=sk-or-your-key-here
```

**skill-optimizer available:**
```bash
npx skill-optimizer --help
# Expected: Usage information
# If not installed globally, install from the repo:
#   cd /path/to/skill-optimizer && npm install && npm run build && npm link
```

## 2. Determine Your Surface Type

skill-optimizer supports three surface types. Pick the one that matches your project:

| Surface | Your project exposes... | Examples |
|---------|------------------------|----------|
| `cli` | CLI commands or a binary | Yargs, Commander, @optique/core, argparse, Click, Clap |
| `sdk` | Library methods users call in code | TypeScript/Python/Rust SDKs |
| `mcp` | MCP tool handlers | MCP servers with `server.tool()` definitions |

If unsure: does your user run commands in a terminal (`cli`), import your package and call functions (`sdk`), or connect an AI agent to your tool server (`mcp`)?

## 3. Run the Init Wizard

From your project root:

```bash
npx skill-optimizer init <surface>
# Example: npx skill-optimizer init cli
```

The wizard prompts for:

- **Repo path** — absolute path to your project root (defaults to CWD)
- **Models** — OpenRouter model IDs to benchmark against (e.g., `openrouter/anthropic/claude-sonnet-4.6`)
- **SKILL.md location** — path to your existing documentation or guidance file
- **Discovery sources** — source files for tree-sitter to parse (e.g., `src/cli.ts`, `src/index.ts`)
- **Max tasks** — upper bound on generated benchmark tasks (default: 20)

**Non-interactive mode** (for CI or scripting):

```bash
# Accept all defaults
npx skill-optimizer init cli --yes

# Load answers from a file
npx skill-optimizer init --answers answers.json
```

`answers.json` format:
```json
{
  "surface": "cli",
  "repoPath": "/absolute/path/to/your-repo",
  "models": ["openrouter/anthropic/claude-sonnet-4.6", "openrouter/openai/gpt-4o"],
  "maxTasks": 20,
  "maxIterations": 5,
  "entryFile": "src/cli.ts"
}
```

## 4. Surface Discovery

After init, skill-optimizer needs to know what actions your project exposes. There are two discovery modes:

**Code-first (auto)** — tree-sitter parses your source files automatically. This works for:
- TypeScript: Yargs, Commander, @optique/core CLI frameworks
- TypeScript/Python/Rust: SDK method extraction
- TypeScript: MCP `server.tool()` definitions

If auto-discovery finds your actions, you're done. Check with:
```bash
npx skill-optimizer run --dry-run --config <config-path>
# Look for "Discovered N actions" in the output
```

**Manual / import** — if auto-discovery yields nothing or misses actions:

```bash
# Extract from TypeScript source
npx skill-optimizer import-commands --from ./src/cli.ts

# Extract from a compiled binary's help text
npx skill-optimizer import-commands --from my-cli --scrape
```

This populates `.skill-optimizer/cli-commands.json` (CLI) or `.skill-optimizer/tools.json` (MCP). You can also edit these manifest files by hand.

## 5. Verify with Doctor

Run the config diagnostics to catch problems early:

```bash
npx skill-optimizer doctor --config <config-path>
```

If issues are found, auto-fix what's fixable:

```bash
npx skill-optimizer doctor --fix --config <config-path>
```

## 6. What You Should Have Now

After successful setup:

- **`skill-optimizer/skill-optimizer.json`** — main config file (commit this)
- **`.skill-optimizer/`** — working directory for task artifacts, surface manifests, and versioned skill copies (gitignored)

Your project is ready for benchmarking. Read `references/benchmark.md` for next steps.

## 7. Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| "Config not found" | Wrong path to `skill-optimizer.json` | Use `--config` with the full path |
| "No actions discovered" | `discovery.sources` points at wrong files | Check paths are relative to `repoPath` |
| "Skill file not found" | `target.skill` path is wrong | Path is relative to `repoPath` — verify it exists |
| "Unknown config format" | File is named `skill-benchmark.json` | Rename to `skill-optimizer.json` |
| "repoPath not found" | Relative path resolved wrong | Use absolute path, or make it relative to config file location |
````

- [ ] **Step 2: Verify file exists**

Run: `wc -l SKILL/references/setup.md`
Expected: ~100-120 lines

- [ ] **Step 3: Commit**

```bash
git add SKILL/references/setup.md
git commit -m "feat(skill): add setup reference — prerequisites, init wizard, discovery"
```

---

### Task 4: Create SKILL/references/benchmark.md

**Files:**
- Create: `SKILL/references/benchmark.md`

- [ ] **Step 1: Write SKILL/references/benchmark.md**

Write the following content to `SKILL/references/benchmark.md`:

````markdown
# Running & Interpreting Benchmarks

This guide covers running benchmarks, reading results, diagnosing failures, and comparing runs.

## 1. Pre-flight Check

Before running a benchmark, verify:

```bash
# Config is valid
npx skill-optimizer doctor --config <config-path>

# API key is set
echo $OPENROUTER_API_KEY  # should print sk-or-...

# Git is clean (if requireCleanGit is true, which is the default)
git status  # should show "nothing to commit, working tree clean"
```

## 2. Dry Run First

Always start with a dry run to check scope and estimate cost:

```bash
npx skill-optimizer run --dry-run --config <config-path>
```

This shows:
- How many actions were discovered
- How many are in scope after filtering
- How many tasks would be generated
- Which models would be called

No LLM calls are made. Use this to verify your scope and estimate cost (N models x M tasks = total calls).

## 3. Run the Benchmark

```bash
npx skill-optimizer run --config <config-path>
```

What happens at each stage:

1. **Discover** — find callable actions via tree-sitter or manifest
2. **Scope** — apply `include`/`exclude` filters
3. **Generate tasks** — create one prompt per in-scope action (coverage-guaranteed: every action gets at least one task)
4. **Call models** — each configured model attempts each task
5. **Extract** — pull action calls from model responses via pattern matching
6. **Evaluate** — compare extracted actions against expected actions
7. **Verdict** — PASS or FAIL based on two gates

## 4. Reading the Output

The benchmark produces:

- **Per-model score table** — each model's pass rate as a fraction (e.g., `Claude Sonnet: 18/20 (0.90)`)
- **Weighted average** — computed from individual scores and model weights
- **Verdict** — `PASS` (both gates satisfied) or `FAIL` (at least one gate missed)
- **Exit code** — `0` for PASS, `1` for FAIL

## 5. Verdict Gates

Two gates must **both** pass for a PASS verdict:

**`perModelFloor`** (default: `0.6`)
Every model must individually score at or above this threshold. If any single model scores below, the entire benchmark fails — regardless of how well other models did. This prevents one weak model from hiding behind a strong average.

**`targetWeightedAverage`** (default: `0.7`)
The weighted mean across all models must reach this threshold. Models with higher `weight` values count more. This ensures overall quality, not just per-model minimums.

**Model `weight`** (default: `1.0`)
Controls how much each model influences the weighted average. Set flagship models to `2.0` and budget models to `0.5` if you care more about flagship performance.

## 6. Diagnosing Failures

When a benchmark fails, look at the per-task breakdown to identify patterns:

**Hallucinated actions** — the model calls functions that don't exist in your API.
- *Cause:* SKILL.md describes features ambiguously or mentions non-existent methods
- *Fix:* Tighten your docs. Remove references to deprecated methods. Be explicit about what exists.

**Missing arguments** — the model calls the right action but with wrong or missing arguments.
- *Cause:* Documentation doesn't clearly specify required parameters or their types
- *Fix:* Add explicit parameter sections with types, defaults, and examples

**Wrong tool selection** — the model calls a related but incorrect action (e.g., `deleteTask` instead of `removeTask`).
- *Cause:* Action names are ambiguous or the docs don't distinguish between similar actions
- *Fix:* Add disambiguation notes or rename actions to be more distinct

**One model fails, others pass** — a specific model consistently underperforms.
- *Cause:* That model may need more explicit guidance or has known weaknesses with your API style
- *Fix:* Consider adjusting its `weight`, adding model-specific notes to your docs, or accepting the floor as-is

## 7. Comparing Runs

After making changes to your SKILL.md, compare before and after:

```bash
npx skill-optimizer compare --baseline report-before.json --current report-after.json
```

This shows per-model and per-task deltas so you can see exactly what improved and what regressed.

## 8. Cost Awareness

Each benchmark run makes `N models x M tasks` LLM calls. To minimize cost while iterating:

- **Start narrow** — use `scope.include` to benchmark only your most important actions first
- **Few models first** — start with 2-3 models, expand after the skill stabilizes
- **Dry run** — always check scope size with `--dry-run` before committing to a full run
- **Iterate on docs first** — fix obvious SKILL.md gaps before re-running. Each run costs real money.

## 9. CI Integration

The exit code (`0` = PASS, `1` = FAIL) makes skill-optimizer suitable for CI pipelines:

```bash
# In a CI script or Makefile
npx skill-optimizer run --config <config-path>
# Exits 0 on PASS, 1 on FAIL — use as a gate step
```

This lets you catch regressions in documentation quality as part of your CI workflow.

## Next Steps

If the benchmark fails and the issues are scattered (not one obvious fix), read `references/optimize.md` to run the automatic optimization loop.

If you need to adjust config (models, scope, thresholds), read `references/config.md`.
````

- [ ] **Step 2: Verify file exists**

Run: `wc -l SKILL/references/benchmark.md`
Expected: ~100-120 lines

- [ ] **Step 3: Commit**

```bash
git add SKILL/references/benchmark.md
git commit -m "feat(skill): add benchmark reference — run, interpret, diagnose, compare"
```

---

### Task 5: Create SKILL/references/optimize.md

**Files:**
- Create: `SKILL/references/optimize.md`

- [ ] **Step 1: Write SKILL/references/optimize.md**

Write the following content to `SKILL/references/optimize.md`:

````markdown
# Optimization Loop

This guide covers when and how to use the automatic optimizer, how to interpret its results, and what to do when it doesn't converge.

## 1. When to Optimize vs. Fix Manually

**Fix manually** when the benchmark reveals a clear, localized problem — a missing section, a wrong example, an outdated method name. Manual fixes are faster and more precise for known issues.

**Run the optimizer** when failures are scattered across multiple models and tasks with no obvious single fix. The optimizer systematically tries mutations to your SKILL.md and keeps only changes that improve scores.

A good workflow: run a benchmark, fix the obvious stuff by hand, re-benchmark, then let the optimizer handle whatever's left.

## 2. How the Loop Works

1. **Baseline benchmark** — establish starting scores for all models
2. **Copy** — your SKILL.md is copied to `.skill-optimizer/skill-v0.md` (original is never touched)
3. **Failure analysis** — identify patterns in what models get wrong
4. **Mutation** — a mutation agent (powered by `optimize.model`, defaults to Claude Opus via OpenRouter) proposes edits to the versioned copy
5. **Re-benchmark** — run all models against all tasks using the mutated skill
6. **Accept or reject** — the mutation is accepted only if:
   - The weighted average improves by at least `minImprovement`
   - No model that was above the floor drops below it
7. **Rollback** if rejected — revert to the previous version
8. **Repeat** up to `maxIterations` times
9. **Progress table** — final output shows Baseline -> each iteration -> Final -> delta per model

## 3. Safety Guarantees

The optimizer is designed to be safe to run:

- **Your original SKILL.md is never modified.** All edits happen on versioned copies in `.skill-optimizer/skill-v0.md`, `skill-v1.md`, etc.
- **`requireCleanGit`** is enforced by default — the optimizer won't run if your target repo has uncommitted changes
- **`allowedPaths`** constrains which files the mutation agent can edit (defaults to just the skill file)
- **Stabilization window** prevents oscillation — if the same mutation keeps getting accepted and rejected, the optimizer exits early

## 4. Running the Optimizer

```bash
npx skill-optimizer optimize --config <config-path>
```

Output during the run:
- Current iteration number and total
- Per-model scores after each mutation attempt
- Accept/reject decision with reasoning
- Running progress table

The optimizer can take several minutes per iteration (it runs a full benchmark each time).

## 5. Key Config Knobs

| Setting | Default | What it controls |
|---------|---------|------------------|
| `optimize.maxIterations` | `5` | Upper bound on optimization rounds |
| `optimize.mode` | `"stable-surface"` | `"stable-surface"`: reuse tasks across iterations (faster, apples-to-apples). `"surface-changing"`: regenerate tasks each iteration (if skill changes might affect task phrasing) |
| `optimize.model` | `"openrouter/anthropic/claude-opus-4.6"` | Which LLM writes mutations |
| `optimize.enabled` | `true` | Set to `false` to skip optimization (useful in CI) |
| `optimize.requireCleanGit` | `true` | Block optimizer if target repo has uncommitted changes |

## 6. Interpreting Results

**Progress table** — rows are models, columns are iterations. Shows the score trajectory for each model across the optimization run.

**Accepted iteration** — the mutation improved scores without violating either gate. The versioned copy advances to `skill-v{N+1}.md`.

**Rejected iteration** — the mutation either didn't improve the weighted average enough, or it caused a model to drop below the floor. The previous version is kept and the optimizer tries a different mutation.

**Early exit** — if scores plateau for consecutive iterations, the optimizer may stop before reaching `maxIterations`. This is normal and means further mutations aren't producing meaningful improvements.

## 7. After Optimization

The best version is the highest-numbered `skill-v{N}.md` in `.skill-optimizer/`. To apply it:

```bash
# 1. See what changed
diff SKILL.md .skill-optimizer/skill-v3.md   # adjust N to your highest version

# 2. Review the diff — the optimizer is a tool, not an oracle
#    Look for: overly specific examples, removed important context, awkward phrasing

# 3. Copy it back
cp .skill-optimizer/skill-v3.md SKILL.md

# 4. Commit
git add SKILL.md
git commit -m "docs: apply skill-optimizer improvements (v3)"
```

## 8. When It Doesn't Converge

If the optimizer oscillates or plateaus without reaching your target scores:

**Narrow the scope** — exclude actions that are inherently ambiguous or rarely used. A smaller, cleaner scope gives the optimizer more room to improve what matters.

**Improve discovery** — make sure `discovery.sources` points at the right files. If the surface is incomplete (missing actions), the optimizer is working with bad data.

**Manual intervention** — read the failure analysis output from the last iteration. It often reveals patterns that a targeted manual edit can fix more effectively than automated mutation.

**Adjust gates** — if `perModelFloor` or `targetWeightedAverage` are set very high, lower them to something achievable first. Optimize to hit that floor, then ratchet up gradually.

**Try different models** — change `optimize.model` to a different LLM. Different models have different strengths in rewriting documentation.
````

- [ ] **Step 2: Verify file exists**

Run: `wc -l SKILL/references/optimize.md`
Expected: ~100-120 lines

- [ ] **Step 3: Commit**

```bash
git add SKILL/references/optimize.md
git commit -m "feat(skill): add optimize reference — loop mechanics, safety, troubleshooting"
```

---

### Task 6: Create SKILL/references/config.md

**Files:**
- Create: `SKILL/references/config.md`

- [ ] **Step 1: Write SKILL/references/config.md**

Write the following content to `SKILL/references/config.md`:

````markdown
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
````

- [ ] **Step 2: Verify file exists**

Run: `wc -l SKILL/references/config.md`
Expected: ~150-180 lines

- [ ] **Step 3: Commit**

```bash
git add SKILL/references/config.md
git commit -m "feat(skill): add config reference — schema, models, scope, errors"
```

---

### Task 7: Final Verification & PR

**Files:** None (verification and git operations only)

- [ ] **Step 1: Verify all files exist with expected structure**

```bash
find SKILL/ -type f | sort
```

Expected:
```
SKILL/SKILL.md
SKILL/references/benchmark.md
SKILL/references/config.md
SKILL/references/optimize.md
SKILL/references/setup.md
```

- [ ] **Step 2: Verify SKILL.md frontmatter is valid**

```bash
head -6 SKILL/SKILL.md
```

Expected: YAML frontmatter block with `name: skill-optimizer` and `description:`

- [ ] **Step 3: Verify all reference files are referenced from SKILL.md**

```bash
grep -c 'references/' SKILL/SKILL.md
```

Expected: at least 4 matches (one per reference file)

- [ ] **Step 4: Verify line counts are reasonable**

```bash
wc -l SKILL/SKILL.md SKILL/references/*.md
```

Expected: SKILL.md ~80-100 lines, each reference file ~100-170 lines, total ~600-750 lines

- [ ] **Step 5: Push branch and create PR**

```bash
git push -u origin feat/skill-optimizer-skill
```

Then create the PR:

```bash
gh pr create --title "feat: add SKILL folder for AI agent guidance" --body "$(cat <<'EOF'
## Summary
- Adds a multi-file `SKILL/` folder at the repo root to guide AI agents through using skill-optimizer
- Entry point (`SKILL.md`) handles context detection (optimizer repo vs. configured target vs. unconfigured project) and routes to phase-specific reference files
- Four reference files cover: setup & init, benchmarking, optimization loop, and config schema

## File structure
```
SKILL/
├── SKILL.md              — entry point, context detection, quick-ref, routing
└── references/
    ├── setup.md           — prerequisites, init wizard, discovery, doctor
    ├── benchmark.md       — run, interpret, diagnose failures, compare, CI
    ├── optimize.md        — loop mechanics, safety guarantees, troubleshooting
    └── config.md          — full field reference, model tips, scope patterns, errors
```

## Design spec
`docs/specs/2026-04-15-skill-optimizer-skill-design.md`

## Test plan
- [ ] Read SKILL.md and verify frontmatter parses correctly
- [ ] Verify context detection instructions cover all three scenarios
- [ ] Verify quick-reference table commands match current CLI (`npx skill-optimizer --help`)
- [ ] Verify config defaults match `docs/reference/config-schema.md`
- [ ] Verify error codes match `docs/reference/errors.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Record PR URL**

Copy the PR URL from the output and share it with the user.
