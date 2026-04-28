---
name: skill-optimizer
description: Use when creating, running, debugging, or documenting skill-optimizer workbench evals; working with agent skill cases, suites, graders, reference solutions, trace.jsonl, Docker workspaces, OpenRouter model matrices, or the skill-optimizer SDK/CLI.
---

# skill-optimizer

`skill-optimizer` is an eval workbench for agent skills. It runs a model in an isolated Docker `/work` directory, provides skills/references as normal workspace files, captures an agent trace, and grades deterministic local outcomes.

Use this skill as the source of truth for authoring eval suites in this repo. Detailed schema and patterns are in `references/workbench.md`.

## Core Model

- A case is one user-like task plus one or more deterministic graders.
- A suite is a set of cases and OpenRouter models to run as a matrix.
- `references` are copied into `/work` before the agent starts; this is where eval skills live.
- The agent phase sees `/work` only. It cannot see `/case`, `/results`, graders, fixtures, or hidden metadata.
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
| Preflight reference solutions | `npx tsx src/cli.ts verify-suite <suite.yml>` |
| CLI help | `npx tsx src/cli.ts --help` |

Rules:

- Use only `openrouter/...` model refs.
- `OPENROUTER_API_KEY` is required for real model runs.
- `run-suite` uses `models:` from `suite.yml`; it has no model override flag.
- `run-case` can use its case `model:` or `--model` / `--models`.
- Docker image default is `skill-optimizer-workbench:local`.

## Authoring Workflow

1. Create `suite.yml` with `models`, shared defaults, and inline cases or case paths.
2. Put the skill/reference material under `references/`; it will be copied into `/work`.
3. Write natural user tasks. Do not mention graders, hidden answers, `/case`, or eval internals.
4. Put immutable fixtures and grader helpers under `checks/`, `fixtures/`, or `bin/` beside the suite/case.
5. Add one or more `graders` per case. Prefer small deterministic graders over one broad grader.
6. Add `solutions/<case-slug>/solution.sh` for each case.
7. Run `verify-suite` before running models.
8. Run `run-suite --trials <n>` and inspect `suite-result.json`, failing `result.json`, `summary.json`, and `trace.jsonl`.

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
  - node $CASE/checks/create-fixtures.mjs
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
    create-fixtures.mjs
    extract-pdf-facts.mjs
  fixtures/
    seed-data.json
  bin/
    fake-cli
  workspace/
    starter-app/
  solutions/
    extract-pdf-facts/solution.sh
```

Support directories are optional. `checks/`, `fixtures/`, and `bin/` are mounted read-only at `/case/...` for setup/grading. `workspace/` is copied into `/work` after `references/`.

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

## Reference Solutions

`verify-suite` runs authored solutions without calling a model:

```text
solutions/<case-slug>/solution.sh
```

The script runs from `$WORK` with `$CASE`, `$WORK`, and `$RESULTS` set. It can call Node, Python, shell tools, or helper scripts. After it exits, normal graders run against the resulting workspace.

Use `verify-suite` to prove fixtures, setup, solutions, and graders agree before spending model tokens. It is stdout-only and does not create a `.results` run.

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

## Programmatic SDK

The package exports workbench APIs from `skill-optimizer` after build:

```ts
import {
  loadWorkbenchCase,
  loadWorkbenchSuite,
  runWorkbenchCase,
  runWorkbenchSuite,
  runWorkbenchReferenceSolutions,
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
| `examples/workbench/pdf/checks/*.mjs` | Deterministic grader and fixture helper patterns |
| `examples/workbench/pdf/solutions/*/solution.sh` | Reference solutions used by `verify-suite` |

```bash
npx tsx src/cli.ts verify-suite examples/workbench/pdf/suite.yml
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
```

The PDF demo covers setup, suite models, reference solutions, positive output grading, and trace-based negative grading.

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
