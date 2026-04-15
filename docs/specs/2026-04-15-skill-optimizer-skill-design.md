# Skill-Optimizer SKILL Design Spec

**Date:** 2026-04-15
**Status:** Draft
**Author:** Ovidiu + Claude

## Goal

Create a SKILL folder at the root of the `skill-optimizer` repository that enables AI agents to effectively use skill-optimizer for benchmarking and optimizing SDK/CLI/MCP documentation. The skill targets **skill authors** — people who have an existing project and want to ensure LLMs can reliably call their tools from documentation.

## Decisions

- **Audience:** Skill authors using skill-optimizer as an external tool, not contributors to the optimizer itself (those are served by CLAUDE.md + CONTRIBUTING.md).
- **Context-adaptive:** The skill detects whether the agent is inside the optimizer repo, a configured target project, or an unconfigured project, and adapts guidance accordingly.
- **Distribution:** Ships with the repo at `SKILL/SKILL.md` (root level).
- **Guidance level:** Full guided workflow — walks agents through each phase with decision points, expected outputs, and error recovery.
- **Structure:** Multi-file skill folder with progressive disclosure (SKILL.md entry point + reference files loaded on demand).

## File Structure

```
SKILL/
├── SKILL.md                    # Entry point (~200 lines)
└── references/
    ├── setup.md                # Prerequisites, init, verify (~150 lines)
    ├── benchmark.md            # Run, interpret, compare (~150 lines)
    ├── optimize.md             # Optimization loop (~150 lines)
    └── config.md               # Full config reference (~200 lines)
```

## SKILL.md — Entry Point

Always loaded into agent context. Responsibilities:

### Frontmatter

```yaml
name: skill-optimizer
description: >
  Benchmark and optimize SDK, CLI, and MCP documentation so every LLM model
  can reliably call the right actions with correct arguments. Use when setting
  up skill-optimizer for a project, running benchmarks, interpreting results,
  optimizing SKILL.md files, or diagnosing configuration issues. Also use when
  working inside the skill-optimizer repository itself.
```

### Context Detection

The skill opens with a context-detection block that the agent evaluates on load:

1. **Check for `skill-optimizer.json` in CWD or parent dirs** — if found, agent is in a **configured target project**. The config path becomes the `--config` argument for all commands.
2. **Check for `src/cli.ts` + `package.json` with `"name": "skill-optimizer"`** — if found, agent is in the **optimizer repo itself**. Dev commands (`npm run build`, `npm test`, `npx tsx src/cli.ts`) are available directly. For running against a target, use mock repos or point `--config` at an external project.
3. **Neither** — agent is in an **unconfigured target project**. Route to `references/setup.md` to scaffold a config first.

### Quick-Reference Command Table

A scannable table of all commands for agents that already know what they need:

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

`<config-path>` is the path to `skill-optimizer.json` — typically `./skill-optimizer/skill-optimizer.json` after `init`, or wherever the user placed it.

### Phase Routing

Based on context detection result and user intent, the skill routes to the appropriate reference file:

- **"Set up skill-optimizer for my project"** / unconfigured project detected → read `references/setup.md`
- **"Run a benchmark" / "Test my skill"** → read `references/benchmark.md`
- **"Optimize my SKILL.md" / "Improve my docs"** → read `references/optimize.md`
- **"What config options are available?"** → read `references/config.md`

### Key Concepts (inline, ~2 sentences each)

- **Surfaces:** The callable interface of your project — SDK methods, CLI commands, or MCP tools. Skill-optimizer discovers these via tree-sitter code analysis or from a manifest file.
- **Static evaluation:** Benchmark evaluation never executes generated code. Actions are extracted from model responses via pattern matching and compared structurally against expected calls.
- **Verdict gates:** Two thresholds must both pass: `perModelFloor` (each model individually meets a minimum score) and `targetWeightedAverage` (the weighted mean across all models meets a target).
- **Safety boundary:** The optimizer never modifies your original SKILL.md. It works from versioned copies in `.skill-optimizer/skill-v{N}.md` and only accepts mutations that improve scores without dropping any model below the floor.

## references/setup.md — Setup & Init Phase

Loaded when the agent needs to set up skill-optimizer for a project.

### Sections

**1. Prerequisites Check**
- Node.js 20+ installed
- `OPENROUTER_API_KEY` environment variable set (`export OPENROUTER_API_KEY=sk-or-...`)
- skill-optimizer available: either globally (`npm link` from the optimizer repo) or via `npx` if published

**2. Determine Surface Type**
Help the agent decide between `cli`, `sdk`, or `mcp`:
- Project exposes a CLI binary or commands → `cli`
- Project is a library/SDK with callable methods → `sdk`
- Project implements MCP tool handlers → `mcp`

**3. Run the Init Wizard**
```bash
npx skill-optimizer init <surface>
```
Explain each wizard prompt:
- Repo path — absolute path to the target project root
- Models — which OpenRouter model IDs to benchmark against
- SKILL.md location — path to existing documentation/guidance file
- Discovery sources — source files for tree-sitter to parse
- Max tasks — upper bound on generated benchmark tasks

Non-interactive alternative: `npx skill-optimizer init <surface> --yes` or `--answers answers.json`.

**4. Surface Discovery**
Two modes:
- **Code-first (auto):** tree-sitter parses source files listed in `target.discovery.sources`. Works for TypeScript (Yargs, Commander, @optique/core), Python, Rust.
- **Manifest:** If auto-discovery yields nothing, manually populate `.skill-optimizer/cli-commands.json` or `.skill-optimizer/tools.json`, or use `import-commands`:
  ```bash
  npx skill-optimizer import-commands --from ./src/cli.ts
  npx skill-optimizer import-commands --from my-cli --scrape  # for compiled binaries
  ```

**5. Verify with Doctor**
```bash
npx skill-optimizer doctor --config ./skill-optimizer.json
npx skill-optimizer doctor --fix --config ./skill-optimizer.json  # auto-repair
```

**6. Expected Output After Setup**
- `skill-optimizer.json` — main config (commit this)
- `.skill-optimizer/` directory — task artifacts, surface manifests, versioned skill copies

**7. Common Pitfalls**
- `repoPath` must be absolute or relative to the config file location
- `discovery.sources` paths are relative to `repoPath`
- Missing SKILL.md → create one before benchmarking, or point `target.skill` at existing docs
- File named `skill-benchmark.json` → rename to `skill-optimizer.json`

## references/benchmark.md — Running & Interpreting Benchmarks

Loaded when the agent wants to run a benchmark or understand results.

### Sections

**1. Pre-flight Check**
- Config exists and is valid (`doctor` passes)
- `OPENROUTER_API_KEY` is set
- Git is clean if `requireCleanGit: true` (default)

**2. Dry Run First**
```bash
npx skill-optimizer run --dry-run --config ./skill-optimizer.json
```
Shows scope size and task count without making LLM calls. Useful for cost estimation.

**3. Run the Benchmark**
```bash
npx skill-optimizer run --config ./skill-optimizer.json
```
What happens at each stage:
1. Discover callable surface (tree-sitter or manifest)
2. Apply scope filters (`include`/`exclude`)
3. Generate tasks — one prompt per in-scope action, coverage-guaranteed
4. Call each configured model on each task
5. Extract actions from responses via pattern matching
6. Evaluate: compare extracted actions against expected actions
7. Produce verdict: PASS or FAIL

**4. Reading the Output**
- Per-model score table: each model's pass rate as a fraction
- Weighted average: computed from scores and model weights
- Verdict: PASS (both gates met) or FAIL (at least one gate missed)
- Exit code: 0 = PASS, 1 = FAIL

**5. Verdict Gates Explained**
- `perModelFloor` (default 0.6): every model must individually score at or above this. One model below = FAIL regardless of average.
- `targetWeightedAverage` (default 0.7): weighted mean across all models must reach this.
- `weight` per model (default 1.0): higher weight = more influence on the average. Use for flagship models you care most about.

**6. Diagnosing Failures**
Common failure patterns and what to fix:
- **Hallucinated actions** (model calls functions that don't exist): SKILL.md may describe features ambiguously or mention non-existent methods. Tighten the docs.
- **Missing arguments** (right action, wrong/missing args): docs don't clearly specify required parameters. Add explicit parameter sections.
- **Wrong tool selection** (calls a related but incorrect action): action names may be ambiguous. Improve naming guidance or add disambiguation notes.
- **Consistent model failure** (one model fails, others pass): that model may need more explicit guidance. Consider adjusting weight or adding model-specific notes.

**7. Comparing Runs**
```bash
npx skill-optimizer compare --baseline report-before.json --current report-after.json
```
Shows per-model and per-task deltas between two benchmark reports.

**8. Cost Awareness**
Each benchmark run costs: N models x M tasks LLM calls. To minimize cost:
- Start with a narrow scope (`include` only the most important actions)
- Use 2-3 models initially, expand after the skill stabilizes
- Use `--dry-run` to check scope size before committing

**9. CI Integration**
Exit code 0/1 makes skill-optimizer suitable for CI gates:
```bash
npx skill-optimizer run --config ./skill-optimizer.json && echo "PASS" || echo "FAIL"
```

## references/optimize.md — Optimization Loop

Loaded when the agent wants to automatically improve a SKILL.md.

### Sections

**1. When to Optimize vs. Fix Manually**
- **Fix manually** when the benchmark reveals a clear, localized problem: a missing section, a wrong example, an outdated method name. It's faster and more precise.
- **Run the optimizer** when failures are scattered across multiple models and tasks with no obvious single fix. The optimizer systematically tries mutations and keeps only what improves scores.

**2. How the Loop Works**
1. Baseline benchmark — establish starting scores
2. Copy SKILL.md to `.skill-optimizer/skill-v0.md`
3. Failure analysis — identify patterns in what models get wrong
4. Mutation agent (powered by `optimize.model`, defaults to Opus via OpenRouter) proposes edits to the versioned copy
5. Re-benchmark with the mutated skill
6. Accept the mutation only if:
   - Weighted average improves by at least `minImprovement`
   - No model that was above the floor drops below it
7. If rejected, rollback to previous version
8. Repeat up to `maxIterations` times
9. Print progress table: Baseline → each iteration → Final → delta per model

**3. Safety Guarantees**
- The original SKILL.md is **never modified** — all edits happen on versioned copies in `.skill-optimizer/`
- `requireCleanGit` is enforced by default — uncommitted changes in the target repo block the optimizer
- `allowedPaths` constrains which files the mutation agent can edit (defaults to just SKILL.md)
- Stabilization window prevents oscillation between iterations

**4. Running the Optimizer**
```bash
npx skill-optimizer optimize --config ./skill-optimizer.json
```
Output includes:
- Current iteration number
- Per-model scores after each mutation
- Accept/reject decision with reasoning
- Final progress table

**5. Key Config Knobs**
- `optimize.maxIterations` (default 5): upper bound on optimization rounds
- `optimize.mode`:
  - `stable-surface` (default): reuses the same generated tasks across iterations — faster, apples-to-apples comparison
  - `surface-changing`: regenerates tasks each iteration — useful if the skill changes might affect how tasks should be phrased
- `optimize.model`: which LLM writes mutations (default: `openrouter/anthropic/claude-opus-4.6`)
- `optimize.enabled` (default true): set to false to skip optimization in CI

**6. Interpreting Results**
- **Progress table:** rows = models, columns = iterations. Shows score trajectory per model.
- **Accepted iteration:** mutation improved scores without violating gates.
- **Rejected iteration:** mutation either didn't improve enough or caused a model to drop below the floor. The previous version is kept.
- **Stabilization:** if scores plateau for consecutive iterations, the optimizer may exit early.

**7. After Optimization**
The best version is the highest-numbered `skill-v{N}.md` in `.skill-optimizer/`. To apply it:
1. Diff the optimized version against your original: `diff SKILL.md .skill-optimizer/skill-v{N}.md`
2. Review the changes — the optimizer is a tool, not an oracle
3. Copy the optimized version back: `cp .skill-optimizer/skill-v{N}.md SKILL.md`
4. Commit the improved SKILL.md

**8. When It Doesn't Converge**
If iterations oscillate or plateau without reaching the target:
- **Narrow the scope:** exclude actions that are inherently ambiguous or rarely used
- **Improve discovery:** ensure `discovery.sources` point at the right files so the surface is complete
- **Manual intervention:** read the failure analysis output and make targeted edits, then re-run
- **Adjust gates:** if `perModelFloor` or `targetWeightedAverage` are set very high, lower them to something achievable first, then ratchet up

## references/config.md — Configuration Reference

Loaded when the agent needs config details. Derived from the auto-generated `docs/reference/config-schema.md`.

### Sections

**1. Minimal Working Configs**

CLI surface:
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

SDK surface:
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

MCP surface:
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

**2. Field-by-Field Reference**

`target` section:
- `surface` (required): `"cli"`, `"sdk"`, or `"mcp"`
- `repoPath` (required): absolute or config-relative path to the target project root
- `skill` (required): path to the SKILL.md or guidance doc, relative to `repoPath`
- `discovery.mode`: `"auto"` (tree-sitter) or `"manifest"` (hand-written JSON)
- `discovery.sources`: array of source files for tree-sitter to parse, relative to `repoPath`
- `discovery.language` (SDK only): `"typescript"`, `"python"`, or `"rust"`
- `scope.include` (default `["*"]`): glob patterns for actions to include
- `scope.exclude` (default `[]`): glob patterns for actions to exclude

`benchmark` section:
- `format`: `"pi"` (uses OpenRouter via pi-ai)
- `apiKeyEnv`: environment variable name holding the API key (default `"OPENROUTER_API_KEY"`)
- `models[]`: array of model configs:
  - `id` (required): OpenRouter model ID (e.g., `"openrouter/anthropic/claude-sonnet-4.6"`)
  - `name`: human-readable label
  - `tier`: `"flagship"`, `"mid"`, or `"budget"` (informational)
  - `weight` (default 1.0): influence on weighted average
- `verdict.perModelFloor` (default 0.6): minimum score each model must reach
- `verdict.targetWeightedAverage` (default 0.7): minimum weighted average across models
- `taskGeneration.enabled` (default true): whether to auto-generate tasks
- `taskGeneration.maxTasks` (default 20): upper bound on tasks (must be >= in-scope action count)
- `taskGeneration.outputDir` (default `".skill-optimizer"`): where to write task artifacts

`optimize` section:
- `enabled` (default true): whether optimization is allowed
- `mode`: `"stable-surface"` (reuse tasks) or `"surface-changing"` (regenerate per iteration)
- `model`: OpenRouter model ID for the mutation agent
- `maxIterations` (default 5): max optimization rounds
- `allowedPaths`: files the mutation agent may edit (default: just the skill file)
- `requireCleanGit` (default true): block optimizer if target repo has uncommitted changes

**3. Model Configuration Tips**
- Browse available models at [OpenRouter models](https://openrouter.ai/models)
- Recommended starter set: one flagship (Claude Sonnet or GPT-4o) + one budget model (Gemini Flash or Haiku) to test both ends
- Use `weight` to prioritize: set flagship models to 2.0 and budget to 0.5 if flagship performance matters most
- `tier` is informational only — it doesn't affect scoring

**4. Scope Patterns**
The `*` wildcard matches any sequence of characters including dots and slashes (not limited to a single path segment).

Examples:
- `"Wallet.*"` — all Wallet methods
- `"*.internal*"` — exclude anything with "internal" in the name
- `"get_*"` — only getter actions
- `["create_*", "update_*", "delete_*"]` — only mutation actions

Task generation is coverage-guaranteed: every in-scope action gets at least one task. If coverage fails after retries, an error names the uncovered actions.

**5. Error Codes**
Most common errors (full list in `docs/reference/errors.md`):

| Code | Meaning | Fix |
|------|---------|-----|
| E_MISSING_SKILL | `target.skill` file not found | Create the file or fix the path |
| E_INVALID_SURFACE | `target.surface` is not cli/sdk/mcp | Use one of the three valid values |
| E_DIRTY_GIT | Uncommitted changes in target repo | Commit or stash, or set `requireCleanGit: false` |
| E_EMPTY_SCOPE | Scope filters matched no actions | Check `include`/`exclude` patterns |
| E_MISSING_API_KEY | `OPENROUTER_API_KEY` not set | `export OPENROUTER_API_KEY=sk-or-...` |

## Delivery

- **Location:** `SKILL/` folder at the root of the `skill-optimizer` repository
- **Branch:** New feature branch in the skill-benchmark repo (e.g., `feat/skill-optimizer-skill`)
- **PR:** Create a pull request against `main` after implementation
