# Changelog

## Unreleased

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

`TaskResult` fields renamed: `toolMatches` → `actionMatches`, `hallucinatedCalls` → `hallucinatedActions` (on `metrics`), `unnecessaryCalls` → `unnecessaryActions` (on `metrics`). Existing report JSON files using the old field names will be rejected by `loadReport` with a clear error — re-run the benchmark to generate a current-format report.

The config file name `skill-benchmark.json` is no longer auto-detected. Rename to `skill-optimizer.json`.

### Fixed

- **benchmark:** Strip provider prefix from model ID when using direct `anthropic` or `openai` formats. Previously, `anthropic/claude-sonnet-4-6` was sent as-is to the Anthropic API, which expects `claude-sonnet-4-6`. The `pi` format is unaffected.

## 1.0.0 — 2026-04-14

First public release.
