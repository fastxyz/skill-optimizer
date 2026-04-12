# cli-taskfile-demo

A CLI surface demo for skill-optimizer.

This mock repo demonstrates optimizing a CLI tool's `SKILL.md` so that LLMs can use all five commands (`add`, `list`, `done`, `delete`, `update`) with the right flags. The included `SKILL.md` intentionally omits `delete`, `update`, and flag details like `--priority` and `--due` — leaving the optimizer room to improve coverage.

## What's here

| File | Purpose |
|------|---------|
| `skill-optimizer.json` | Unified benchmark + optimizer config |
| `SKILL.md` | Intentionally incomplete docs — the optimizer rewrites this |
| `src/commands.ts` | CLI command definitions (the surface being benchmarked) |

## Quickstart

Materialize an isolated copy before running the optimizer (required for git checkpointing):

```bash
tsx src/optimizer/materialize-mock-repo.ts cli-taskfile-demo ./.tmp/mock-repos
npx tsx src/cli.ts optimize --config ./.tmp/mock-repos/cli-taskfile-demo/skill-optimizer.json
```

Or run a benchmark-only pass against the tracked template:

```bash
npx tsx src/cli.ts run --config mock-repos/cli-taskfile-demo/skill-optimizer.json
```
