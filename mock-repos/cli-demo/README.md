# CLI Demo Mock Repo

This mock repo is a small CLI target for manual benchmark and optimizer runs.

Files to use together:
- `benchmark.config.json` for benchmark runs
- `optimize.config.json` for optimizer runs
- `SKILL.md` for the agent-facing CLI guidance

Materialize this template into its own git repo before running the optimizer.

The command tree is intentionally awkward:
- `pulse stash inspect --account <id>` shows balance-like information
- `pulse move create --from <id> --to <id> --units <n> [--memo <text>]` sends units
