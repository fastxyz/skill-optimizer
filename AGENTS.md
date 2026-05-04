# AGENTS.md

## Project Overview

`skill-optimizer` is a Docker workbench for running and grading agent skill eval cases. The current public CLI centers on `run-case` and `run-suite`.

## Key Commands

```bash
npm run build
npm run typecheck
npm test
npx tsx src/cli.ts --help
npx tsx src/cli.ts run-case --help
npx tsx src/cli.ts run-suite --help
```

## Important Files

- `src/cli.ts`: public CLI entrypoint
- `src/workbench/`: workbench case loading, suite loading, Docker runner, Pi agent, graders, and traces
- `docker/workbench-runner.Dockerfile`: generic non-root container image for setup, agent, grade, and cleanup phases
- `skills/skill-optimizer/SKILL.md`: canonical distributable Agent Skill
- `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `.opencode/`: cross-agent plugin manifests and install support
- `.agents/plugins/marketplace.json`: Codex repo marketplace entry for the root plugin
- `gemini-extension.json`, `GEMINI.md`: Gemini extension metadata and context file
- `examples/workbench/`: tracked example eval suites
- `README.md`: provider-specific installation instructions for Claude Code, Codex, Cursor, OpenCode, Gemini CLI, and skill-only installs
- `CONTRIBUTING.md`: contributor workflow and current workbench invariants

## Installation Docs

Keep the README installation section aligned with packaged plugin metadata:

- Claude Code: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
- Codex: `.agents/plugins/marketplace.json` and `.codex-plugin/plugin.json`
- Cursor: `.cursor-plugin/plugin.json` and `.cursor/INSTALL.md`
- OpenCode: `.opencode/plugins/skill-optimizer.js` and `.opencode/INSTALL.md`
- Gemini CLI: `gemini-extension.json` and `GEMINI.md`
- Skill-only installs: `npx skills add fastxyz/skill-optimizer --skill skill-optimizer ...`

## Invariants

- Keep evaluation static: extraction and matching are allowed; do not execute model-produced code outside the Docker workbench as part of evaluation.
- `run-suite` uses models from `suite.yml`; do not add a `run-suite --models` override.
- Keep OpenRouter model refs as `openrouter/...`; real model runs require `OPENROUTER_API_KEY`.
- Cases use `graders: [{ name, command }]`; legacy `check:` and `artifacts:` are invalid.
- Graders are the acceptance contract; evaluate outputs from `/work`, generated artifacts, `answer.json`, `trace.jsonl`, and result state.
- The agent phase sees only `/work`, not `/case` or `/results`.
- Keep plugin metadata pointed at the canonical `skills/skill-optimizer/SKILL.md`; do not create divergent skill copies.
- Codex plugin metadata lives in `.codex-plugin/plugin.json`; the repo marketplace lives in `.agents/plugins/marketplace.json` and points at `./`.
- Provider install docs should link to the same canonical skill/plugin metadata, not separate skill copies.
- Do not commit `.skill-eval/`, `.results/`, `.env`, or credentials.

## Testing Guidance

- Run `npm run typecheck` after TypeScript changes.
- Run `npm test` before finishing behavior changes.
- For Docker runner or image changes, also run `docker build -t skill-optimizer-workbench:local -f docker/workbench-runner.Dockerfile .`.
- For CLI/docs changes, verify `npx tsx src/cli.ts --help` if touched docs mention CLI behavior.
- For plugin/package metadata changes, run `npx tsx tests/smoke-skill-distribution.ts` and verify `npm pack --dry-run --json` includes required plugin files without result/cache directories.
