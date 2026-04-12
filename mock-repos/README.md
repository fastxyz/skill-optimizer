# Mock Repos

`mock-repos/` contains the tracked end-to-end demo template for manual benchmark and optimizer testing:

- `mcp-tracker-demo`

Use the tracked template directly for read-only benchmark runs.

Materialize a standalone copy before running the optimizer so git checkpointing stays isolated:

```bash
tsx src/optimizer/materialize-mock-repo.ts mcp-tracker-demo ./.tmp/mock-repos
npx skill-optimizer optimize --config ./.tmp/mock-repos/mcp-tracker-demo/skill-optimizer.json
```

`mcp-tracker-demo` is the current OSS example for the unified `skill-optimizer.json` flow.
It discovers MCP tools from `src/server.ts`, generates benchmark tasks under `./.skill-optimizer`,
and runs the optimizer in `surface-changing` mode.
