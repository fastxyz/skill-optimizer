# CLAUDE.md

## Project Overview

`skill-optimizer` measures whether LLMs pick the right SDK methods, CLI commands, or MCP tools from docs and task prompts, and can run a benchmark-driven optimization loop over an allowed target repo.

The repo now has four important layers:

- `src/project/`: unified `skill-optimizer.json` config loading, validation, and path resolution
- `src/runtime/pi/`: shared Pi auth/model/runtime helpers
- `src/tasks/`: shared task generation, grounding, and artifact freezing from discovered surfaces
- `src/benchmark/`: loads tasks and surface definitions, builds prompts, calls models, extracts actions, evaluates them, and writes reports
- `src/optimizer/`: runs a benchmark-driven optimization loop against a constrained target repo

The benchmark is static. Do not change behavior in ways that execute model-produced code or shell commands as part of evaluation.

## Key Commands

```bash
npm run build
npm run typecheck
npm test
npx tsx src/cli.ts --help
npx tsx src/cli.ts generate-tasks --help
npx tsx src/cli.ts optimize --help
```

Typical benchmark run:

```bash
export OPENROUTER_API_KEY=...
npx tsx src/cli.ts run --config ./skill-optimizer.json
```

Generate tasks only:

```bash
npx tsx src/cli.ts generate-tasks --config ./skill-optimizer.json
```

Typical optimizer run:

```bash
tsx src/optimizer/materialize-mock-repo.ts mcp-tracker-demo ./.tmp/mock-repos
npx tsx src/cli.ts optimize --config ./.tmp/mock-repos/mcp-tracker-demo/skill-optimizer.json
```

## Important Files

- `src/cli.ts`: public CLI entrypoint (`init`, `run`, `optimize`, `compare`)
- `src/project/types.ts`: unified public project config types
- `src/project/load.ts`: unified `skill-optimizer.json` loader
- `src/runtime/pi/models.ts`: shared Pi model/auth resolution
- `src/tasks/index.ts`: shared task generation entrypoint over discovered surfaces
- `src/benchmark/runner.ts`: orchestration for benchmark execution
- `src/benchmark/types.ts`: benchmark report, metric, and extraction types
- `src/benchmark/init.ts`: scaffolded starter `skill-optimizer.json`
- `src/optimizer/loop.ts`: accept/reject iteration loop
- `src/optimizer/manifest.ts`: adapter from unified project config into the current optimizer loop
- `src/optimizer/mock-repos.ts`: tracked template materialization and isolated git init
- `mock-repos/mcp-tracker-demo/`: current richer demo target for optimizer testing

## Invariants

- Keep benchmark evaluation static. Extraction and matching are allowed; executing generated code is not.
- Keep path resolution relative to the unified config file being loaded.
- `targetRepo.allowedPaths` is the optimizer safety boundary. Do not widen edits outside it during mutation.
- `requireCleanGit` must remain effectively enforced for optimizer targets.
- Optimizer-owned artifacts under the configured task-generation output dir must not be treated as target-repo mutations.
- **The target repo's skill file is never modified.** The optimizer copies it to `.skill-optimizer/skill-v0.md` on start and creates versioned copies per accepted iteration. The mutation agent writes to these local copies; `skillOverride` makes the benchmark read from them.
- Stable-surface optimize runs assume the callable surface is frozen for the duration of the run. If a change renames commands/tools/APIs, the surface must be rediscovered and the benchmark snapshot regenerated before further comparisons are meaningful.
- Materialized mock repos must stay isolated from tracked templates.
- Documentation examples should match the current CLI and config schema.

## Editing Guidance

- Prefer small changes in the existing architecture over broad refactors.
- When updating config or project types, also update the README examples and any scaffolding in `src/benchmark/init.ts` if needed.
- When changing optimizer behavior, verify both the loop and the unified project defaults still agree.
- Code-first surface discovery is now active for `sdk`, `cli`, and `mcp` via `target.discovery.sources`. Explicit manifests/declared surface metadata still exist as transitional internal fallbacks, but new public examples should prefer code-first discovery.
- Be careful around mock repo references: code may support template names that are not currently present in the working tree.

## Testing Guidance

- Run `npm run typecheck` after TypeScript changes.
- Run `npm test` before finishing when behavior changes may affect extraction, evaluation, reporting, or optimizer flow.
- For CLI-only or docs-only changes, at minimum verify `npx tsx src/cli.ts --help` still works if the touched docs reference CLI behavior.

## Environment Notes

- Do not commit `.env` or secrets.
- Pi-based examples use `benchmark.format: "pi"` and typically expect `OPENROUTER_API_KEY`.
- The current unified config also allows the optimizer model to use `OPENROUTER_API_KEY`.
