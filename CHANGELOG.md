# Changelog

## 2.0.0 — 2026-05-01

### Changed

- Rebuilt Skill Optimizer around the eval workbench: realistic skill cases, model matrices, isolated agent workspaces, trace inspection, deterministic grader evidence, and iterative skill improvement.
- Repositioned package and plugin metadata around the skill eval lab workflow instead of implementation mechanics.

### Breaking Changes

- Removed the legacy reference-solution preflight flow and `verify-suite`; graders are now the sole acceptance contract.
- Removed reference-solution SDK exports and packaged example solution scripts.

### Added

- Hidden MCP services for eval cases, exposed to agents through the workbench `mcp` command.
- Post-run optimization guidance for inspecting failures, updating skills or supporting code, and re-running evals.

## 1.1.0 — 2026-04-16

### Breaking Changes

The following public API exports have been removed. Update imports to use the canonical names:

| Removed | Replacement |
|---------|-------------|
| `CodeModeConfig` | `SdkSurfaceConfig` |
| `McpModeConfig` | `McpSurfaceConfig` |
| `ExpectedTool` | `ExpectedAction` |
| `ToolMatch` | `ActionMatch` |
| `LEGACY_PROJECT_CONFIG_NAME` | hard-code `".skill-optimizer/skill-optimizer.json"` |
| `toLegacyOptimizeManifest` | removed with no replacement |
| `SurfaceSnapshotArg` | removed with no replacement |

`TaskResult` fields renamed: `toolMatches` → `actionMatches`, `hallucinatedCalls` → `hallucinatedActions` (on `metrics`), `unnecessaryCalls` → `unnecessaryActions` (on `metrics`). `loadReport` does not validate old field names — old report JSON files may produce unexpected output in detail views. Re-run the benchmark to generate a current-format report.

Existing `tasks.json` files using `expected_tools` (instead of `expected_actions`) or `method` (instead of `name`) on action entries will now fail to load with an error. Update affected task files: rename `expected_tools` to `expected_actions` and rename each action's `method` field to `name`.

The config file `skill-benchmark.json` is no longer auto-detected. Rename it to `skill-optimizer.json`.

### Added
- **prompt surface type** — benchmark and optimize prompt templates, Claude Code skills, and agent instructions. Discovers phases and capabilities from markdown, evaluates output quality with content-based criteria.
- **Codex auth** — direct OpenAI model runs can use browser-login tokens stored by Codex (`~/.codex/auth.json`) instead of requiring `OPENAI_API_KEY`. Set `benchmark.authMode: "codex"` and use `openai/<model>` IDs.
- **skills folder** — bundled AI-agent guidance (`skills/skill-optimizer/SKILL.md`) so agents can use skill-optimizer reliably without extra setup.
- **Optimizer loop diagram** — README now includes a visual workflow diagram of the optimizer loop.
- **Stable task IDs** — task IDs are now derived from a SHA-1 hash of the action names (SDK/CLI/MCP surfaces) or prompt text (prompt surface). For SDK/CLI/MCP surfaces, where action names come from discovered code rather than LLM output, IDs are stable across regenerations and the `--task <id>` filter works reliably. For the prompt surface, IDs are stable when the LLM produces identical wording; if it rephrases a task the ID changes (fixes [#17](https://github.com/fastxyz/skill-optimizer/issues/17)).

### Fixed

- **benchmark:** Strip provider prefix from model ID when using direct `anthropic` or `openai` formats. Previously, `anthropic/claude-sonnet-4-6` was sent as-is to the Anthropic API, which expects `claude-sonnet-4-6`. The `pi` format is unaffected.
- **model IDs:** OpenRouter model slugs now preserve dots in version numbers (e.g. `openrouter/anthropic/claude-sonnet-4.6`). Presets updated to match OpenRouter's catalog exactly. The dot→hyphen rewrite in `validate`/`fix` now applies only to the `anthropic/` direct-API prefix; `openrouter/` and `openai/` slugs are exempt.
- **error message:** `E_MODEL_ID_FORMAT` now lists all three valid provider prefixes (`openrouter/`, `anthropic/`, `openai/`) instead of directing all users to use `openrouter/`.
- Prompt-surface benchmarks no longer hard-FAIL on `scopeCoverage.coverageViolation`; coverage is informational for prompt runs (`src/benchmark/scoring.ts`).
- Prompt-surface tasks are now scored against the specific capability they exercise via a required `capabilityId` on `GeneratedTask`. Previously every task was scored against the first discovered capability (`src/benchmark/runner.ts`, `src/benchmark/prompt-criteria.ts`, `src/tasks/generate.ts`).
- Prompt evaluator surfaces `noActiveCriteria: true` (score 0, runner-level FAIL with an actionable message) when a capability's section produces empty criteria, replacing the previous vacuous 1.0 pass (`src/benchmark/prompt-evaluator.ts`).
- `openai/` direct-API model IDs are exempt from dot→hyphen rewriting in `applyFixes`. OpenAI's API slugs use dots (`gpt-5.4`, `gpt-4.1`). (`src/project/fix.ts`)
- Removed dead `src/discovery/prompt.ts`. Active discovery path is `src/project/discover-prompt.ts`.

## 1.0.0 — 2026-04-14

First public release.
