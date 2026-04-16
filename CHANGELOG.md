# Changelog

## 1.1.0 — 2026-04-16

### Breaking Changes

The following public API exports have been removed. Update imports to use the canonical names:

| Removed | Replacement |
|---------|-------------|
| `CodeModeConfig` | `SdkSurfaceConfig` |
| `McpModeConfig` | `McpSurfaceConfig` |
| `ExpectedTool` | `ExpectedAction` |
| `ToolMatch` | `ActionMatch` |
| `LEGACY_PROJECT_CONFIG_NAME` | hard-code `"skill-optimizer.json"` |
| `toLegacyOptimizeManifest` | removed with no replacement |
| `SurfaceSnapshotArg` | removed with no replacement |

`TaskResult` fields renamed: `toolMatches` → `actionMatches`, `hallucinatedCalls` → `hallucinatedActions` (on `metrics`), `unnecessaryCalls` → `unnecessaryActions` (on `metrics`). `loadReport` does not validate old field names — old report JSON files may produce unexpected output in detail views. Re-run the benchmark to generate a current-format report.

Existing `tasks.json` files using `expected_tools` (instead of `expected_actions`) or `method` (instead of `name`) on action entries will now fail to load with an error. Update affected task files: rename `expected_tools` to `expected_actions` and rename each action's `method` field to `name`.

The config file `skill-benchmark.json` is no longer auto-detected. Rename it to `skill-optimizer.json`.

### Added
- **prompt surface type** — benchmark and optimize prompt templates, Claude Code skills, and agent instructions. Discovers phases and capabilities from markdown, evaluates output quality with content-based criteria.
- **Codex auth** — direct OpenAI model runs can use browser-login tokens stored by Codex (`~/.codex/auth.json`) instead of requiring `OPENAI_API_KEY`. Set `benchmark.authMode: "codex"` and use `openai/<model>` IDs.
- **SKILL folder** — bundled AI-agent guidance (`SKILL/SKILL.md`) so agents can use skill-optimizer reliably without extra setup.
- **Optimizer loop diagram** — README now includes a visual workflow diagram of the optimizer loop.
- **Stable task IDs** — task IDs are now derived from a SHA-1 hash of the action names (SDK/CLI/MCP surfaces) or prompt text (prompt surface). For SDK/CLI/MCP surfaces, where action names come from discovered code rather than LLM output, IDs are stable across regenerations and the `--task <id>` filter works reliably. For the prompt surface, IDs are stable when the LLM produces identical wording; if it rephrases a task the ID changes (fixes [#17](https://github.com/fastxyz/skill-optimizer/issues/17)).

### Fixed

- **benchmark:** Strip provider prefix from model ID when using direct `anthropic` or `openai` formats. Previously, `anthropic/claude-sonnet-4-6` was sent as-is to the Anthropic API, which expects `claude-sonnet-4-6`. The `pi` format is unaffected.
- **model IDs:** OpenRouter model slugs now preserve dots in version numbers (e.g. `openrouter/anthropic/claude-sonnet-4.6`). Presets updated to match OpenRouter's catalog exactly. The dot→hyphen rewrite in `validate`/`fix` now applies only to the `anthropic/` direct-API prefix; `openrouter/` and `openai/` slugs are exempt.
- **error message:** `E_MODEL_ID_FORMAT` now lists all three valid provider prefixes (`openrouter/`, `anthropic/`, `openai/`) instead of directing all users to use `openrouter/`.

## 1.0.0 — 2026-04-14

First public release.
