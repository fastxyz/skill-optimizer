# Contributing to skill-optimizer

Thanks for contributing! This project is a small, opinionated Docker workbench for evaluating agent skills. Changes should preserve deterministic grading, isolated agent workspaces, and the canonical `skills/skill-optimizer/SKILL.md` distribution path.

## Installing The Skill

See `README.md#installation` for provider-specific install instructions for Claude Code, OpenAI Codex CLI/App, Cursor, OpenCode, Gemini CLI, and skill-only installs.

## Local workflow

```bash
git clone https://github.com/fastxyz/skill-optimizer
cd skill-optimizer
npm install
npm run typecheck
npm test
npm run build
```

All three commands must pass before opening a PR when code changes are involved.

## Project layout

- `src/cli.ts` — public CLI entry point for `run-case` and `run-suite`.
- `src/workbench/` — case/suite loading, Docker runner, Pi agent wiring, graders, traces, metrics, MCP support, and trial aggregation.
- `docker/workbench-runner.Dockerfile` — non-root container image for setup, agent, grade, and cleanup phases.
- `skills/skill-optimizer/SKILL.md` — canonical distributable Agent Skill.
- `skills/skill-optimizer/references/workbench.md` — detailed workbench schema and authoring reference.
- `examples/workbench/` — packaged example suites.
- `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.opencode/`, `.agents/plugins/marketplace.json`, `gemini-extension.json`, `GEMINI.md` — cross-agent plugin and extension metadata.
- `tests/` — hand-rolled smoke tests (`tsx tests/smoke-*.ts`).

## Pre-submit expectations

- One feature per PR.
- TDD: write the failing test first, implement, confirm green, commit.
- Update docs and examples when behavior or install flow changes.
- No new npm dependencies without discussion.
- Error messages name the next step.
- Do not commit `.skill-eval/`, `.results/`, `.env`, or credentials.

## Workbench invariants

- Keep evaluation static: extraction and matching are allowed; do not execute model-produced code outside the Docker workbench as part of evaluation.
- Use only `openrouter/...` model refs; real model runs require `OPENROUTER_API_KEY`.
- `run-suite` uses models from `suite.yml`; do not add a `run-suite --models` override.
- Cases use `graders: [{ name, command }]`; legacy `check:` and `artifacts:` are invalid.
- The agent phase sees only `/work`, not `/case`, `/results`, graders, hidden answers, or hidden metadata.
- Keep plugin metadata pointed at the canonical `skills/skill-optimizer/SKILL.md`; do not create divergent skill copies.

## Testing guidance

- Run `npm run typecheck` after TypeScript changes.
- Run `npm test` before finishing behavior changes.
- For Docker runner or image changes, also run `docker build -t skill-optimizer-workbench:local -f docker/workbench-runner.Dockerfile .`.
- For CLI/docs changes, verify `npx tsx src/cli.ts --help` if touched docs mention CLI behavior.
- For plugin/package metadata changes, run `npx tsx tests/smoke-skill-distribution.ts` and verify `npm pack --dry-run --json` includes required plugin files without result/cache directories.

## Adding workbench capabilities

Keep new capabilities small and deterministic. Add validation in the relevant loader, tests in `tests/smoke-workbench-*.ts`, and docs in `skills/skill-optimizer/references/workbench.md` or `docs/workbench.md` when users need to author new YAML fields or understand new runtime behavior.

## Commit style

`<type>(<scope>): <short summary>` — matching existing history (`feat(optimizer): ...`, `fix(benchmark): ...`, `chore(deps): ...`, `docs(readme): ...`, `test(dry-run): ...`).
