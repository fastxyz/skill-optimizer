# Mock Repos

`mock-repos/` contains three tracked templates for manual benchmark and optimizer testing:

- `sdk-demo`
- `cli-demo`
- `mcp-demo`

Use the tracked template directly for read-only benchmark runs.

Materialize a standalone copy before running the optimizer so git checkpointing stays isolated:

```bash
tsx src/optimizer/materialize-mock-repo.ts sdk-demo ./.tmp/mock-repos
tsx src/optimizer/main.ts ./.tmp/mock-repos/sdk-demo/optimize.config.json
```
