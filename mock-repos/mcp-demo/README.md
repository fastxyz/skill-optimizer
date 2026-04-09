# MCP Demo Mock Repo

This mock repo is a small MCP-style target for manual benchmark and optimizer runs.

Files to use together:
- `benchmark.config.json` for benchmark runs
- `optimize.config.json` for optimizer runs
- `tools.json` for the tool contract under benchmark
- `SKILL.md` for the agent-facing tool guidance

Materialize this template into its own git repo before running the optimizer.

The tool names are intentionally awkward:
- `vault_lookup` behaves like a balance lookup
- `vault_dispatch` behaves like a transfer tool
