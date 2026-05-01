---
name: skill-optimizer
description: Use when creating, running, debugging, or documenting skill-optimizer workbench evals; working with agent skill cases, suites, graders, traces, Docker workspaces, OpenRouter model matrices, or the skill-optimizer SDK/CLI.
---

# skill-optimizer

`skill-optimizer` is an eval workbench for agent skills. It runs a model in an isolated Docker `/work` directory, provides skills/references as normal workspace files, captures an agent trace, and grades deterministic local outcomes.

Use this skill as the source of truth for authoring eval suites in this repo. Detailed schema and patterns are in `references/workbench.md`.

## Core Model

- A case is one user-like task plus one or more deterministic graders.
- A suite is a set of cases and OpenRouter models to run as a matrix.
- `references` are copied into `/work` before the agent starts; this is where eval skills live.
- The agent phase sees `/work` only. It cannot see `/case`, `/results`, graders, hidden answers, or hidden metadata.
- Cases can define `mcpServers`; these are exposed through a workbench `mcp` command during the agent phase.
- Graders run after the agent with `/case`, `/work`, and `/results` mounted.
- `trace.jsonl` is the debugging source for what the agent saw, said, and did.

## Commands

| Goal | Command |
|------|---------|
| Install deps | `npm install` |
| Build CLI | `npm run build` |
| Run one case | `npx tsx src/cli.ts run-case <case.yml>` |
| Run one case across models | `npx tsx src/cli.ts run-case <case.yml> --models openrouter/google/gemini-2.5-flash,openrouter/openai/gpt-5.4` |
| Run a suite | `npx tsx src/cli.ts run-suite <suite.yml>` |
| CLI help | `npx tsx src/cli.ts --help` |

Rules:

- Use only `openrouter/...` model refs.
- `OPENROUTER_API_KEY` is required for real model runs.
- `run-suite` uses `models:` from `suite.yml`; it has no model override flag.
- `run-case` can use its case `model:` or `--model` / `--models`.
- Docker image default is `skill-optimizer-workbench:local`.

## Install This Skill

This repository ships one canonical skill at `skills/skill-optimizer/SKILL.md` plus plugin metadata for Claude Code, OpenCode, Codex, Cursor, and Gemini.

Install the skill for common agents with:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a claude-code -a opencode -a codex -a cursor
```

Plugin entrypoints:

- Claude Code: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
- OpenCode: `.opencode/plugins/skill-optimizer.js`
- Codex: `.codex-plugin/plugin.json`
- Cursor: `.cursor-plugin/plugin.json`
- Gemini: `gemini-extension.json` and `GEMINI.md`

## Authoring Workflow

1. Create `suite.yml` with `models`, shared defaults, and inline cases or case paths.
2. Put the skill/reference material under `references/`; it will be copied into `/work`.
3. Write natural user tasks. Do not mention graders, hidden answers, `/case`, or eval internals.
4. Put setup helpers, grader helpers, and fake CLIs under `checks/` or `bin/` beside the suite/case.
5. Add one or more `graders` per case. Prefer small deterministic graders over one broad grader.
6. Run `run-suite --trials <n>` and inspect `suite-result.json`, failing `result.json`, `summary.json`, and `trace.jsonl`.

Variables listed in `env` are forwarded unchanged into setup, agent, grading, and cleanup containers. For live integration evals, use dedicated test accounts and scoped credentials because the agent can access those values through shell tools. Treat `trace.jsonl`, `result.json`, grader evidence, stdout/stderr, and preserved `workspace/` directories as potentially sensitive if an agent or grader prints or writes secret values.

Use `mcpServers` when the task should interact with MCP tools. For local servers whose source should stay hidden from the agent, put server files under the case `mcp/` support directory and define `mcpServices`; Docker starts those as separate service containers and the agent only sees their HTTP MCP URL. Direct stdio `mcpServers.command` entries run inside the agent container and are only appropriate when the server implementation is intentionally agent-visible. Remote HTTP/SSE servers must be reachable from Docker. The workbench generates `/work/mcporter.json` with `imports: []`, so host/user MCP configs are not imported. OAuth/browser auth is not supported; use env/header credentials listed in `env`.

Prefer the real CLI/API/service when you do not know its internal behavior well enough to mock it faithfully. Mock only when you are sure the mock matches the real command surface, validation, outputs, and failure modes; otherwise the eval will measure the mock, not the skill.

## Minimal Suite

```yaml
name: pdf-skill-eval
references: ./references
models:
  - openrouter/google/gemini-2.5-flash
env:
  - OPENROUTER_API_KEY
timeoutSeconds: 600
setup:
  - node $CASE/checks/create-inputs.mjs
appendSystemPrompt: |
  Keep task outputs at the top level of /work unless the user asks otherwise.
cases:
  - name: extract-pdf-facts
    task: |
      Read statement.pdf and write answer.json with the account, quarter, approval code, and risk flags.
    graders:
      - name: answer-json
        command: node $CASE/checks/extract-pdf-facts.mjs
```

## Directory Layout

```text
my-eval/
  suite.yml
  references/
    my-skill/SKILL.md
  checks/
    create-inputs.mjs
    extract-pdf-facts.mjs
  bin/
    fake-cli
  workspace/
    starter-app/
```

Support directories are optional. `checks/` and `bin/` are mounted read-only at `/case/...` for setup/grading. `workspace/` is copied into `/work` after `references/`.

## Grader Contract

Graders are shell commands. They run with:

- `$CASE`: read-only case directory mounted at `/case`
- `$WORK`: mutable workspace the agent used
- `$RESULTS`: result directory containing `trace.jsonl`

Preferred grader output:

```json
{ "pass": true, "score": 1, "evidence": ["answer matched"] }
```

If no JSON object is printed, exit code `0` passes and non-zero fails. Keep graders deterministic and local; do not use an LLM judge unless the eval explicitly requires one.

Graders are the acceptance contract. They should evaluate evidence in `/work`, generated artifacts, `answer.json`, `trace.jsonl`, and any relevant result-state files under `$RESULTS`.

## Outputs

```text
.results/<run-id>/
  suite-result.json                  # run-suite aggregate
  run-result.json                    # run-case matrix aggregate
  trials/<case>--<model>--001/
    trace.jsonl                      # agent messages and tool calls
    result.json                      # pass, score, evidence, graders, metrics
    summary.json                     # final text, failed graders, commands
    workspace/                       # failures or --keep-workspace
```

Use `trace.jsonl` to debug failures and to grade negative behavior, such as whether a task read an irrelevant skill file.

## Optimization Loop

After a run, inspect failing `result.json`, `summary.json`, `trace.jsonl`, and preserved `workspace/` evidence. Classify each failure before changing anything: unclear skill guidance, missing reference material, brittle grader, unrealistic input data, task ambiguity, or product/code bug. Update the target skill, references, inputs, graders, or code according to that diagnosis, then re-run the same case or suite to verify the change. Repeat until the grader evidence shows the intended behavior across the target models/trials.

## Programmatic SDK

The package exports workbench APIs from `skill-optimizer` after build:

```ts
import {
  loadWorkbenchCase,
  loadWorkbenchSuite,
  runWorkbenchCase,
  runWorkbenchSuite,
  runGraderCommands,
  parseModelList,
} from 'skill-optimizer';
```

The CLI is the stable path for normal eval runs. Use SDK functions for tests, wrappers, and internal automation.

## Examples

Tracked demos live in `examples/` (the same repo path users may refer to as `@examples/`). Read these alongside the skill docs when building or debugging evals:

| Path | Why It Matters |
|------|----------------|
| `examples/workbench/README.md` | Short command walkthrough for demos |
| `examples/workbench/pdf/README.md` | Explains the PDF demo cases and expected outputs |
| `examples/workbench/pdf/suite.yml` | Concrete suite using models, setup, env, graders, and append prompt |
| `examples/workbench/pdf/references/pdf-skill/SKILL.md` | Example skill copied into `/work` for the agent |
| `examples/workbench/pdf/checks/*.mjs` | Deterministic grader and setup helper patterns |
| `examples/workbench/mcp/suite.yml` | Hidden-service MCP calculator example |
| `examples/workbench/mcp/mcp/calculator-server.mjs` | Example MCP server with add/subtract/multiply/divide tools |

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
npx tsx src/cli.ts run-suite examples/workbench/mcp/suite.yml --trials 1
```

The PDF demo covers setup, suite models, positive output grading, and trace-based negative grading.

## Development Checks

After code or docs that affect behavior:

```bash
npm run typecheck
npm test
npm run build
npx tsx src/cli.ts --help
node dist/cli.js --help
```

After Dockerfile/container-runner changes:

```bash
docker build -t skill-optimizer-workbench:local -f docker/workbench-runner.Dockerfile .
```

Do not commit `.skill-eval/`; it is local ignored eval data.
