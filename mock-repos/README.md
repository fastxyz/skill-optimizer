# Mock Repos

`mock-repos/` contains tracked end-to-end demo templates for manual benchmark and optimizer testing:

- `mcp-tracker-demo` — MCP surface, `surface-changing` optimize mode
- `sdk-counter-demo` — SDK surface, intentionally lossy SKILL.md
- `cli-taskfile-demo` — CLI surface, intentionally lossy SKILL.md

Use a tracked template directly for read-only benchmark runs.

Materialize a standalone copy before running the optimizer so git checkpointing stays isolated:

```bash
tsx src/optimizer/materialize-mock-repo.ts mcp-tracker-demo ./.tmp/mock-repos
npx skill-optimizer optimize --config ./.tmp/mock-repos/mcp-tracker-demo/skill-optimizer.json
```

Each demo repo's `skill-optimizer.json` is the unified config entry point for both benchmarking and optimization.
