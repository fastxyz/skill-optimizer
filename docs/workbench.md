# Workbench Guide

`skill-optimizer` runs agent skill evals in a Docker workbench. A model receives a normal user task plus files under `/work`; deterministic graders inspect the final workspace and trace to decide whether the attempt passed.

## Mental Model

- A case is one user-like task plus one or more deterministic graders.
- A suite is a matrix of cases and OpenRouter models.
- `references/` is copied into `/work` before the agent starts. Put the skill under test here.
- `workspace/` is copied into `/work` after `references/`. Use it to seed starter files or repos.
- `checks/`, `fixtures/`, and `bin/` are case support files. They are mounted for setup and grading, not for the agent.
- The agent phase sees only `/work`. It cannot see `/case`, `/results`, graders, fixtures, or hidden metadata.
- Graders define acceptance. They inspect files, command logs, generated artifacts, `answer.json`, `trace.jsonl`, and result state.

## Directory Layout

```text
my-eval/
  suite.yml
  references/
    my-skill/SKILL.md
    my-skill/references/api.md
  checks/
    create-fixtures.mjs
    grade-output.mjs
  fixtures/
    seed-data.json
  bin/
    fake-product-cli
  workspace/
    starter-repo/
```

Support directory behavior:

| Directory | Visible To Agent | Purpose |
|-----------|------------------|---------|
| `references/` | yes, copied into `/work` | Skills and reference docs under test |
| `workspace/` | yes, copied into `/work` | Starter repos, input files, seed state |
| `checks/` | no during agent phase | Setup helpers and graders under `$CASE/checks` |
| `fixtures/` | no during agent phase | Immutable setup/grader inputs under `$CASE/fixtures` |
| `bin/` | yes, copied to `/work/bin` | Fixture CLIs and command recorders; also mounted under `$CASE/bin` for setup/grading |

## Suite And Case Files

Minimal suite:

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

Case fields:

- `name`: human-readable case name; inline suite cases use this to derive result slugs.
- `references`: directory copied into `/work`; required for standalone cases and defaulted by suites.
- `task`: natural user request sent to the agent.
- `graders`: shell commands run after the agent; every grader must pass for the case to pass.
- `setup`: shell commands run before the agent.
- `cleanup`: optional shell commands run after grading.
- `env`: host environment variable names forwarded into setup, agent, grading, and cleanup.
- `mcpServers`: optional MCP server map exposed through the agent's `mcp` tool.
- `mcpServices`: optional hidden Docker MCP services started beside the agent container.
- `model`: default model for `run-case`.
- `timeoutSeconds`: agent timeout, default `600`.

Task prompts should not mention graders, hidden answers, `/case`, `/results`, or eval internals. Ask for the real deliverable just like a user would.

## MCP Servers

Cases and suite inline-case defaults may define `mcpServers`. The workbench writes a per-trial `/work/mcporter.json` with only those servers and `imports: []`, then exposes an `mcp` command on `PATH` for the agent. The command delegates to `mcporter` inside the workbench image.

Example:

```yaml
mcpServers:
  calculator:
    baseUrl: http://calculator:3000/mcp

  context7:
    baseUrl: https://mcp.context7.com/mcp
    headers:
      Authorization: "Bearer ${CONTEXT7_API_KEY}"
env:
  - OPENROUTER_API_KEY
  - CONTEXT7_API_KEY

mcpServices:
  calculator:
    command: node
    args:
      - calculator-server.mjs
    port: 3000
```

Suite-level `mcpServers` apply to inline cases. Inline case definitions merge by server name, with the inline case winning. External case files do not inherit suite defaults.

Use `mcpServices` for local MCP servers whose source should not be visible to the agent. Service files live under the case `mcp/` support directory. During `run-case` and `run-suite`, Docker mounts that directory read-only into separate service containers at `/mcp`, joins those containers to a private Docker network, and joins the agent container to the same network. The agent sees only the configured `mcpServers` URL such as `http://calculator:3000/mcp`; it does not mount `/case` or the `mcp/` source directory.

Remote HTTP/SSE servers must be reachable from Docker. Host-local endpoints need Docker-reachable addresses such as `host.docker.internal`. Direct stdio `mcpServers.command` entries run inside the agent container and are only appropriate when the server implementation is intentionally agent-visible.

OAuth/browser auth is not supported in v1. Use non-interactive headers, bearer tokens, or environment-variable placeholders. Only env names listed in `env` are forwarded into the containers.

## Docker Execution Phases

`run-case` and `run-suite` use Docker for model attempts. Each trial has a prepared case directory, work directory, and result directory on the host; Docker mounts them into phase containers.

| Phase | Docker Mounts | Working Dir | What Happens |
|-------|---------------|-------------|--------------|
| setup | `/case:ro`, `/work:rw` | `/work` | Runs setup commands and prepares inputs |
| agent | `/work:rw` only | `/work` | Runs the agent/model with the user task |
| grade | `/case:ro`, `/work:rw`, `/results:rw` | `/work` | Runs graders and writes result files |
| cleanup | `/case:ro`, `/work:rw`, `/results:rw` | `/work` | Runs optional cleanup commands |

Important agent-phase constraints:

- The agent cannot see `/case` or `/results`.
- The Docker socket is not mounted.
- Global/user Pi skills are not mounted.
- Additional skills are discovered from `/work`.
- If configured, MCP servers are exposed through the `mcp` command using `/work/mcporter.json`.
- Python installs should use `/work/.venv`.
- Environment variables listed in `env` are available unchanged to the agent.

Use dedicated test accounts and scoped credentials for live integration evals. Treat `trace.jsonl`, `result.json`, grader evidence, stdout/stderr, and preserved workspaces as potentially sensitive.

## Graders

Graders are shell commands. They run from `/work` with these environment variables:

| Variable | Meaning |
|----------|---------|
| `$CASE` | Read-only case directory mounted at `/case` |
| `$WORK` | Mutable workspace used by the agent |
| `$RESULTS` | Result directory containing `trace.jsonl` |

Preferred grader output is one JSON object on stdout:

```json
{ "pass": false, "score": 0, "evidence": ["answer.json missing approvalCode"] }
```

If no JSON object is printed, exit code `0` passes and non-zero fails. Keep graders deterministic and local. Do not use an LLM judge unless the eval explicitly requires one.

Good graders check one thing when practical:

- Exact JSON shape and values.
- PDF, DOCX, PPTX, XLSX, image, ZIP, or database structure.
- Command calls recorded by a fixture CLI.
- Static SQL, source code, diffs, or generated files.
- `trace.jsonl` for negative behavior, such as reading an irrelevant skill file.

## Acceptance Contract

Graders are the only source of truth for pass/fail. Design graders to inspect whatever local evidence the task should produce, including:

- Workspace files and generated artifacts under `$WORK`
- Structured outputs such as `answer.json`
- Agent behavior captured in `$RESULTS/trace.jsonl`
- Any additional result-state files your setup/graders write under `$RESULTS`

Keep graders deterministic and local so acceptance criteria stay stable across model runs.

## Running Evals

Run one case:

```bash
npx tsx src/cli.ts run-case ./case.yml
```

Run a case across models:

```bash
npx tsx src/cli.ts run-case ./case.yml \
  --models openrouter/google/gemini-2.5-flash,openrouter/openai/gpt-5.4 \
  --trials 3 \
  --concurrency 2
```

Run a suite:

```bash
npx tsx src/cli.ts run-suite ./suite.yml --trials 3 --concurrency 2
```

Useful options:

- `--out <path>`: results root, default `<case-dir>/.results` or `<suite-dir>/.results`.
- `--model <model>`: single `run-case` model override.
- `--models <models>`: comma-separated `run-case` model list.
- `--trials <n>`: independent trials per model/case, default `1`.
- `--concurrency <n>`: maximum concurrent trial containers, default `1`.
- `--image <image>`: Docker image name, default `skill-optimizer-workbench:local`.
- `--keep-workspace`: copy final `/work` to results; failed trials are always preserved.

`run-suite` always uses `models:` from `suite.yml`; it does not have a model override flag.

## Outputs

Single-trial `run-case` output:

```text
case/.results/<run-id>/
  trace.jsonl
  result.json
  summary.json
  workspace/        # on failure or --keep-workspace
```

Matrix `run-case` output:

```text
case/.results/<run-id>/
  run-result.json
  trials/<model-slug>--001/trace.jsonl
  trials/<model-slug>--001/result.json
```

`run-suite` output:

```text
suite/.results/<run-id>/
  suite-result.json
  trials/<case-slug>--<model-slug>--001/trace.jsonl
  trials/<case-slug>--<model-slug>--001/result.json
```

`result.json` includes `pass`, `score`, `evidence`, per-grader results, duration, turns, tool counts, tokens, and cost. Aggregates include trial pass rate, pass@k, pass^k, mean score, and relative result/trace paths.

`trace.jsonl` is the primary debugging source. It records assistant messages, tool calls, tool results, stop reasons, and errors. Use it to understand why a model failed or to grade negative cases.

## Debugging Failed Runs

1. Read the failing trial `result.json` evidence.
2. Inspect `graders[]` to identify the failed grader.
3. Open `summary.json` for final assistant text and commands.
4. Open `trace.jsonl` to inspect tool calls and file reads.
5. Inspect preserved `workspace/` for failed trials.
6. If model runs fail, improve the skill, task clarity, fixtures, or grader tolerance.

## Example

The tracked PDF demo is the best starting point:

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
npx tsx src/cli.ts run-suite examples/workbench/mcp/suite.yml --trials 1
```

Useful files:

- `examples/workbench/pdf/suite.yml`: inline suite with models, setup, graders, and append prompt.
- `examples/workbench/pdf/references/pdf-skill/SKILL.md`: skill under test copied into `/work`.
- `examples/workbench/pdf/checks/*.mjs`: deterministic graders and fixture helpers.
- `examples/workbench/pdf/README.md`: demo walkthrough.
