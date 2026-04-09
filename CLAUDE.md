# CLAUDE.md

## Project Overview

`skill-optimizer` measures whether LLMs pick the right SDK methods, CLI commands, or MCP tools from docs and task prompts.

The repo has two main halves:

- `src/benchmark/`: loads configs and tasks, builds prompts, calls models, extracts actions, evaluates them, and writes reports
- `src/optimizer/`: runs a benchmark-driven optimization loop against a constrained target repo

The benchmark is static. Do not change behavior in ways that execute model-produced code or shell commands as part of evaluation.

## Key Commands

```bash
npm run build
npm run typecheck
npm test
npx tsx src/cli.ts --help
tsx src/optimizer/main.ts --help
```

Typical benchmark run:

```bash
export OPENROUTER_API_KEY=...
npx skill-optimizer run --config ./benchmark.config.json
```

Typical optimizer run:

```bash
tsx src/optimizer/materialize-mock-repo.ts mcp-tracker-demo ./.tmp/mock-repos
pi /login
tsx src/optimizer/main.ts ./.tmp/mock-repos/mcp-tracker-demo/optimize.config.json
```

## Important Files

- `src/cli.ts`: benchmark CLI entrypoint
- `src/benchmark/runner.ts`: orchestration for benchmark execution
- `src/benchmark/types.ts`: benchmark config, task, report, and metric types
- `src/benchmark/init.ts`: scaffolded starter config and task generation
- `src/optimizer/main.ts`: optimizer CLI entrypoint
- `src/optimizer/loop.ts`: accept/reject iteration loop
- `src/optimizer/manifest.ts`: optimize manifest validation and defaults
- `src/optimizer/mock-repos.ts`: tracked template materialization and isolated git init
- `mock-repos/mcp-tracker-demo/`: current richer demo target for optimizer testing

## Invariants

- Keep benchmark evaluation static. Extraction and matching are allowed; executing generated code is not.
- Keep path resolution relative to the config or manifest file being loaded.
- `targetRepo.allowedPaths` is the optimizer safety boundary. Do not widen edits outside it during mutation.
- `requireCleanGit` must remain effectively enforced for optimizer targets.
- Materialized mock repos must stay isolated from tracked templates.
- Documentation examples should match the current CLI and config schema.

## Editing Guidance

- Prefer small changes in the existing architecture over broad refactors.
- When updating config or manifest types, also update the README examples and any scaffolding in `src/benchmark/init.ts` if needed.
- When changing optimizer behavior, verify both the loop and the manifest defaults still agree.
- Be careful around mock repo references: code may support template names that are not currently present in the working tree.

## Testing Guidance

- Run `npm run typecheck` after TypeScript changes.
- Run `npm test` before finishing when behavior changes may affect extraction, evaluation, reporting, or optimizer flow.
- For CLI-only or docs-only changes, at minimum verify `npx tsx src/cli.ts --help` still works if the touched docs reference CLI behavior.

## Environment Notes

- Do not commit `.env` or secrets.
- Pi-based examples use `llm.format: "pi"` and typically expect `OPENROUTER_API_KEY` for benchmark runs.
- Optimizer runs are usually done through `pi /login` for the orchestrator path.
