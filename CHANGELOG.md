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

### Fixed

- **benchmark:** Strip provider prefix from model ID when using direct `anthropic` or `openai` formats. Previously, `anthropic/claude-sonnet-4-6` was sent as-is to the Anthropic API, which expects `claude-sonnet-4-6`. The `pi` format is unaffected.

## 1.0.0 — 2026-04-14

First public release.
