# SDK Demo Mock Repo

This mock repo is a small SDK target for manual benchmark and optimizer runs.

Files to use together:
- `benchmark.config.json` for benchmark runs
- `optimize.config.json` for optimizer runs
- `SKILL.md` as the agent-facing documentation surface

Manual flow after materializing this template into its own git repo:
- run validation with `node ./scripts/validate.mjs`
- run the benchmark with `benchmark.config.json`
- run the optimizer with `optimize.config.json`

The API is intentionally a little awkward:
- `LedgerBox.fetch_holdings(accountId)` returns balance-like data
- `LedgerBox.dispatch_transfer({ from, to, amount, memo })` sends funds

That mismatch is intentional so the optimizer has something real to improve.
