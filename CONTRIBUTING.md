# Contributing to skill-optimizer

Thanks for contributing! This project is a small, opinionated tool — changes should preserve its core invariants (static evaluation, `allowedPaths` safety boundary, per-model universality).

## Local workflow

```bash
git clone https://github.com/fastxyz/skill-optimizer
cd skill-optimizer
npm install
npm run typecheck
npm test
npm run build
```

All three commands must pass before opening a PR.

## Project layout

- `src/cli.ts` — CLI entry point (single source of truth; all `npm run <script>` aliases go through it).
- `src/project/` — config load / validate / resolve.
- `src/tasks/` — scope filtering, coverage-guaranteed task generation.
- `src/benchmark/` — runner, evaluator, reporter, scoring.
- `src/optimizer/` — mutation loop, feedback pipeline, ledger.
- `src/verdict/` — recommendations critic + rendering.
- `tests/` — hand-rolled smoke tests (`tsx tests/smoke-*.ts`).

## Pre-submit expectations

- One feature per PR.
- TDD: write the failing test first, implement, confirm green, commit.
- Update `CHANGELOG.md` under the next release section.
- No new npm dependencies without discussion.
- Error messages name the next step.

## Adding a surface type

A surface discoverer returns `ActionDefinition[]`. To add one:

1. Extend `BenchmarkSurface` in `src/benchmark/types.ts`.
2. Add a branch to `src/project/validate.ts` and `src/project/resolve.ts`.
3. Implement the new code-first discoverer in `src/actions/discover.ts`, then register it in `src/project/snapshot.ts` (the dispatcher that routes surfaces to discoverers).
4. Add a discovery smoke test.

## Adding an LLM provider

Current transport is pi-ai + OpenRouter. To add a provider:

1. Add a new format value to `LLMConfig.format` in `src/benchmark/types.ts`.
2. Implement the transport adapter alongside `src/runtime/pi/`.
3. Update `createDefaultPiTaskGenerator`, `createDefaultPiCritic`, and the benchmark runner to branch on the new format.

## Commit style

`<type>(<scope>): <short summary>` — matching existing history (`feat(optimizer): ...`, `fix(benchmark): ...`, `chore(deps): ...`, `docs(readme): ...`, `test(dry-run): ...`).
