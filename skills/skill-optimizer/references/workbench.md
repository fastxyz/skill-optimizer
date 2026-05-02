# Workbench Reference

This reference is for humans and agents authoring evals with the `skill-optimizer` CLI or SDK.

## What The Workbench Evaluates

The workbench is for tasks that can be graded from local evidence:

- Files the agent creates or edits in `/work`
- Command invocations recorded by fake CLIs
- Generated files such as PDF, DOCX, PPTX, XLSX, images, JSON, or code
- Static SQL, shell scripts, config, or source code
- Agent behavior captured in `trace.jsonl`

Avoid evals that require running model-produced arbitrary production code outside the container or using a second LLM as the default judge.

## CLI Surface

```bash
npx tsx src/cli.ts run-case <case.yml>
npx tsx src/cli.ts run-case <case.yml> --model openrouter/google/gemini-2.5-flash
npx tsx src/cli.ts run-case <case.yml> --models openrouter/google/gemini-2.5-flash,openrouter/openai/gpt-5.4 --trials 3 --concurrency 2
npx tsx src/cli.ts run-suite <suite.yml> --trials 3 --concurrency 2
```

Options:

| Command | Option | Meaning |
|---------|--------|---------|
| `run-case` | `--out <path>` | Results root, default `<case-dir>/.results` |
| `run-case` | `--model <model>` | Single OpenRouter model override |
| `run-case` | `--models <csv>` | Comma-separated OpenRouter model refs |
| `run-case` | `--trials <n>` | Independent trials per model |
| `run-suite` | `--out <path>` | Results root, default `<suite-dir>/.results` |
| `run-suite` | `--trials <n>` | Independent trials per case/model |
| both | `--concurrency <n>` | Maximum concurrent trial containers |
| both | `--image <image>` | Docker image, default `skill-optimizer-workbench:local` |
| both | `--keep-workspace` | Preserve successful workspaces too; failures are always preserved |

Only `openrouter/...` model refs are accepted. `run-suite` uses the `models:` array in the suite file.

## Case Schema

Case files may be `.yml`, `.yaml`, or `.json`.

```yaml
name: extract-pdf-facts
references: ./references
task: |
  Read statement.pdf and write answer.json with the account, quarter, approval code, and risk flags.
graders:
  - name: answer-json
    command: node $CASE/checks/extract-pdf-facts.mjs
setup:
  - node $CASE/checks/create-inputs.mjs
cleanup: []
env:
  - OPENROUTER_API_KEY
mcpServers:
  calculator:
    baseUrl: http://calculator:3000/mcp
mcpServices:
  calculator:
    command: node
    args:
      - calculator-server.mjs
model: openrouter/google/gemini-2.5-flash
timeoutSeconds: 600
```

Required fields:

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | Human-readable case name; suite inline cases slug this for result dirs |
| `references` | string | Directory copied into `/work` before the agent starts |
| `task` | string | User-like task sent to the agent |
| `graders` | array | Non-empty list of `{ name, command }` grader commands |

Optional fields:

| Field | Type | Meaning |
|-------|------|---------|
| `setup` | string[] | Commands run in `/work` before the agent phase |
| `cleanup` | string[] | Commands run after grading |
| `env` | string[] | Host environment variable names forwarded into setup, agent, grading, and cleanup containers |
| `mcpServers` | object | MCP servers exposed through the agent `mcp` tool |
| `mcpServices` | object | Hidden local MCP services started as separate Docker containers |
| `model` | string | Default model for `run-case`; defaults to `openrouter/google/gemini-2.5-flash` |
| `timeoutSeconds` | number | Agent timeout; defaults to `600` |

All relative paths resolve from the case file directory.

## Suite Schema

Suites may contain inline case objects or paths to external case files.

```yaml
name: pdf-workbench-example
references: ./references
models:
  - openrouter/google/gemini-2.5-flash
env:
  - OPENROUTER_API_KEY
timeoutSeconds: 600
setup:
  - node $CASE/checks/_pdf.mjs write-inputs input
appendSystemPrompt: |
  Keep task outputs at the top level of /work unless the user asks otherwise.
cases:
  - name: extract-pdf-facts
    task: |
      Read statement.pdf and write answer.json with the account, quarter, approval code, and risk flags.
    graders:
      - name: answer-json
        command: node $CASE/checks/extract-pdf-facts.mjs
  - cases/external-case/case.yml
```

Suite fields:

| Field | Required | Meaning |
|-------|----------|---------|
| `name` | yes | Suite name in aggregate output |
| `models` | yes | OpenRouter model refs for the case/model matrix |
| `cases` | yes | Inline case objects or paths to case files |
| `references` | no | Default references dir for inline cases; defaults to `./references` |
| `env` | no | Default env allowlist for inline cases |
| `setup` | no | Default setup commands for inline cases |
| `cleanup` | no | Default cleanup commands for inline cases |
| `mcpServers` | no | Default MCP servers for inline cases, merged by server name |
| `mcpServices` | no | Default hidden MCP service containers for inline cases, merged by service name |
| `timeoutSeconds` | no | Default agent timeout for inline cases |
| `appendSystemPrompt` | no | Extra suite-wide system prompt appended after the workbench prompt |

Inline case fields override suite defaults. External case files are loaded from their own file directory and do not inherit suite defaults.

Environment variables listed in `env` are forwarded unchanged. This intentionally supports live integration evals such as authenticated CLI calls, but it also means the agent can read or print those values through shell tools. Use dedicated test accounts, least-privilege credentials, and cleanup routines for live systems. Treat `trace.jsonl`, `result.json`, grader evidence, stdout/stderr, and preserved `workspace/` directories as potentially sensitive if an agent or grader prints or writes secret values.

## MCP Servers

`mcpServers` uses mcporter-compatible server entries. During each Docker trial, the workbench writes `/work/mcporter.json` with `imports: []` and exposes an `mcp` command on `PATH`.

The `mcp` command delegates to `mcporter`:

```bash
mcp list calculator
mcp call calculator.add a=17 b=25
```

Example suite default:

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
```

Suite-level `mcpServers` apply only to inline cases. Inline cases merge by server name and win on conflicts. External case files define their own MCP servers and do not inherit suite defaults.

Use `mcpServices` for local MCP servers whose source should not be visible to the agent. Service files live under the case `mcp/` support directory. During Docker runs, the workbench mounts that directory read-only into separate service containers at `/mcp`, joins those containers to a private Docker network, and joins the agent container to the same network. The agent sees only the configured `mcpServers` URL such as `http://calculator:3000/mcp`; it does not mount `/case` or the `mcp/` source directory. Set service ports in the matching `mcpServers` URL rather than in `mcpServices`.

Remote HTTP/SSE servers must be reachable from Docker. `localhost` means the container, not the host, so use `host.docker.internal` or Docker networking for host-local services. Direct stdio `mcpServers.command` entries run inside the agent container and are only appropriate when the server implementation is intentionally agent-visible.

OAuth/browser auth is not supported. Use non-interactive headers, bearer tokens, or env placeholders. Only variables listed in `env` are forwarded.

## Directory Layout

```text
eval-root/
  suite.yml
  references/
    product-skill/SKILL.md
    product-skill/references/api.md
  checks/
    create-inputs.mjs
    grade-output.mjs
    trace-guards.mjs
  bin/
    fake-product-cli
  workspace/
    starter-repo/
```

Directory behavior:

| Directory | Visible To Agent | Purpose |
|-----------|------------------|---------|
| `references/` | yes, copied into `/work` | Skills, docs, examples, starter reference files |
| `workspace/` | yes, copied into `/work` | Seed app repo or starter files the agent may edit |
| `checks/` | no during agent phase | Graders and setup helpers under `/case/checks` |
| `bin/` | yes, copied into `/work/bin` and mounted as `/case/bin` during setup and grading | Fake CLIs and command shims on `PATH` |

## Execution Phases

`run-case` and `run-suite` use Docker for model attempts. Each trial is prepared on the host, then mounted into phase containers.

| Phase | Docker Mounts | Working Dir | What Happens |
|-------|---------------|-------------|--------------|
| setup | `/case:ro`, `/work:rw` | `/work` | Run `setup` commands and prepare inputs |
| agent | `/work:rw` only | `/work` | Pi agent receives task and uses tools |
| grade | `/case:ro`, `/work:rw`, `/results:rw` | `/work` | Run grader commands and write result files |
| cleanup | `/case:ro`, `/work:rw`, `/results:rw` | `/work` | Run optional cleanup commands |

Agent phase constraints:

- No `/case` mount
- No `/results` mount
- No Docker socket
- No global/user Pi skills
- Additional skills are discovered from `/work`
- Configured MCP servers are exposed through the `mcp` command using `/work/mcporter.json`
- Python installs should use `/work/.venv`
- Internet is available unless Docker environment blocks it
- `env` allowlisted credentials are available unchanged to agent shell commands

## Task Writing Rules

Write tasks like normal user requests:

- Ask for the actual deliverable and path.
- Include enough business detail to complete the task.
- Keep hidden expected answers in graders or hidden case support files, not in the task.
- Do not mention graders, answer keys, trace checks, `/case`, `/results`, or benchmark metadata.
- Do not instruct the agent to read or not read a skill unless that is the real user behavior being evaluated.

Good task:

```text
Read statement.pdf and write answer.json with the account, quarter, approval code, and risk flags.
```

Poor task:

```text
Use the PDF skill and satisfy the grader in /case/checks/extract-pdf-facts.mjs.
```

## Grader Contract

Each grader is a shell command run in `/work`.

Environment variables:

| Var | Meaning |
|-----|---------|
| `$CASE` | Read-only case directory mounted at `/case` |
| `$WORK` | Mutable workspace from the agent run |
| `$RESULTS` | Trial result directory with `trace.jsonl` |

Preferred output is one JSON object on stdout:

```json
{ "pass": false, "score": 0, "evidence": ["answer.json missing approvalCode"] }
```

Accepted fields:

| Field | Type | Meaning |
|-------|------|---------|
| `pass` | boolean | Whether the grader passed |
| `score` | number | Optional score clamped to 0..1; defaults to 1 for pass and 0 for fail |
| `evidence` | string or string[] | Human-readable details surfaced in result files |

If stdout does not contain a JSON object, exit code `0` passes and non-zero fails. JSON can be surrounded by logs; the runner parses the first object-shaped span from stdout.

Grader principles:

- Check one concept per grader when practical.
- Prefer exact structural checks over brittle prose matching.
- Print useful evidence for failure triage.
- Keep all grading deterministic and local.
- Graders should inspect `/work`, command logs, generated outputs, or `trace.jsonl`.

## Grader Examples

JSON output grader:

```js
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const path = join(process.env.WORK, 'answer.json');
const failures = [];

if (!existsSync(path)) {
  failures.push('answer.json was not created');
} else {
  const answer = JSON.parse(readFileSync(path, 'utf-8'));
  if (answer.approvalCode !== 'PDF-7429') failures.push('approvalCode mismatch');
}

console.log(JSON.stringify({
  pass: failures.length === 0,
  score: failures.length === 0 ? 1 : 0,
  evidence: failures.length === 0 ? ['answer.json matched'] : failures,
}));
process.exit(failures.length === 0 ? 0 : 1);
```

Trace guard grader:

```js
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tracePath = join(process.env.RESULTS, 'trace.jsonl');
const lines = existsSync(tracePath) ? readFileSync(tracePath, 'utf-8').trim().split(/\r?\n/) : [];
const readForbiddenSkill = lines.some((line) => {
  try {
    const entry = JSON.parse(line);
    const path = entry?.arguments?.path ?? entry?.arguments?.filePath;
    return entry.type === 'tool_call' && entry.name === 'read' && /\/pdf-skill\/SKILL\.md$/.test(path);
  } catch {
    return false;
  }
});

console.log(JSON.stringify({
  pass: !readForbiddenSkill,
  score: readForbiddenSkill ? 0 : 1,
  evidence: readForbiddenSkill ? ['agent read the PDF skill'] : ['no forbidden skill read'],
}));
process.exit(readForbiddenSkill ? 1 : 0);
```

## Acceptance Contract

Graders are the source of truth for pass/fail. They can evaluate:

- Files and generated artifacts in `/work`
- Structured outputs such as `answer.json`
- Behavior traces in `$RESULTS/trace.jsonl`
- Any additional result-state files your checks create under `$RESULTS`

Keep grading deterministic and local so results stay stable and reproducible.

## Results And Metrics

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

`result.json` includes:

- `pass`, `score`, and `evidence`
- Per-grader results under `graders`
- `metrics.durationMs`, turns, tool counts, tokens, and cost

Aggregate files include:

- `trialPassRate`: passed trials / total trials
- `meanScore`: mean top-level score
- `passAtK`: at least one trial passed
- `passHatK`: all trials passed
- Relative `tracePath`, `resultPath`, and `summaryPath` entries

## Trace JSONL

`trace.jsonl` is newline-delimited JSON. Useful entry shapes:

```json
{ "type": "trace_start", "caseName": "extract-pdf-facts", "model": "openrouter/google/gemini-2.5-flash" }
{ "type": "message", "role": "assistant", "text": "..." }
{ "type": "tool_call", "name": "bash", "arguments": { "command": "node script.mjs" } }
{ "type": "tool_call", "name": "read", "arguments": { "path": "/work/pdf-skill/SKILL.md" } }
{ "type": "tool_result", "name": "bash", "text": "...", "isError": false }
```

Use trace evidence to debug why a model failed, verify tool usage, or enforce negative cases.

## SDK Surface

After `npm run build`, the package exports these workbench APIs from `skill-optimizer`:

| API | Purpose |
|-----|---------|
| `loadWorkbenchCase(path)` | Parse and validate a case file |
| `loadWorkbenchSuite(path)` | Parse and validate a suite file |
| `runWorkbenchCase(params)` | Run one case or a model/trial matrix |
| `runWorkbenchSuite(params)` | Run a suite matrix |
| `runDockerWorkbenchCase(params)` | Lower-level Docker case runner |
| `runGraderCommands(graders, opts)` | Execute grader commands and normalize results |
| `normalizeCheckResult(result)` | Normalize shell output into a grade |
| `parseModelList(raw)` | Parse comma-separated OpenRouter refs |
| `aggregateTrials(results)` | Compute pass@k/pass^k/trial metrics |

Example:

```ts
import { runWorkbenchSuite } from 'skill-optimizer';

await runWorkbenchSuite({
  suitePath: 'examples/workbench/pdf/suite.yml',
  trials: 3,
  concurrency: 2,
});
```

Use CLI commands for normal human workflows. Use SDK functions for tests, wrappers, and automation inside this repo.

## Eval Patterns

Live CLI/API Skills:

- Prefer the real CLI/API/service when you are not certain how to mock its internals.
- Mock only when you know the real command surface, validation, outputs, and failure modes well enough to reproduce them faithfully.
- Use dedicated test credentials with least privilege, allowlist only the needed env vars, and avoid printing secrets into trace or grader evidence.
- If mocking is justified, put a fake executable in `bin/` and record calls to `$WORK/calls.jsonl`. Grade command names, flags, output files, and trace behavior.
- If the real tool is safe to call with setup/cleanup and scoped test credentials, install it in `setup` and grade its real dry-run or live request output.
- Include a basic-command case and a flag/options case for command-selection coverage.
- Include a no-tool-needed control case to catch unnecessary skill or CLI use.
- Include a prompt-injection or unsafe-instruction case when external content, fetched pages, or third-party responses can influence the agent.

File-output skills:

- Ask for a concrete output file.
- Grade structure directly, such as PDF page count, ZIP members, JSON schema, image dimensions, or file hash.
- Inspect failed workspaces or rerun with `--keep-workspace` when you need output files for triage.

Code/editing skills:

- Seed `workspace/` with a small repo.
- Ask for a normal change.
- Grade diff, tests, generated files, or static properties.

Negative/control cases:

- Ask for a task that should not require the target skill.
- Grade `trace.jsonl` for forbidden reads, tool calls, or commands.
- For trace-based negative cases, ensure graders handle missing or empty trace entries defensively.

## Debugging Failed Runs

1. Open the failing trial `result.json` and read top-level `evidence`.
2. Open `graders[]` to see which grader failed.
3. Open `summary.json` for final assistant text and bash commands.
4. Open `trace.jsonl` to inspect tool calls and file reads.
5. Inspect preserved `workspace/` for failed trials.
6. Classify the failure as unclear skill guidance, missing reference material, brittle grader, unrealistic input data, task ambiguity, or product/code bug.
7. Update the target skill, references, inputs, graders, or code according to that diagnosis.
8. Re-run the same case or suite and compare grader evidence across the target models/trials.

## Example Suite

The `examples/` tree (often referenced as `@examples/` in path-aware prompts) is part of the packaged skill-optimizer reference material. Use it as the concrete companion to this document.

Start here:

```text
examples/
  workbench/
    README.md
    pdf/
      README.md
      suite.yml
      references/pdf-skill/SKILL.md
      checks/*.mjs
    mcp/
      mcp/calculator-server.mjs
```

The tracked PDF demo is the best starting point:

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
```

Files to inspect:

| File | Purpose |
|------|---------|
| `examples/workbench/README.md` | Top-level example command walkthrough |
| `examples/workbench/pdf/suite.yml` | Inline suite using models, setup, graders, and append prompt |
| `examples/workbench/pdf/references/pdf-skill/SKILL.md` | Skill under test copied into `/work` |
| `examples/workbench/pdf/checks/*.mjs` | Deterministic graders and setup helpers |
| `examples/workbench/pdf/README.md` | Demo walkthrough |
| `examples/workbench/mcp/suite.yml` | Hidden-service MCP calculator demo |
| `examples/workbench/mcp/mcp/calculator-server.mjs` | Calculator MCP server with add/subtract/multiply/divide |

## Repository Verification

Use these before claiming repo changes are complete:

```bash
npm run typecheck
npm test
npm run build
npx tsx src/cli.ts --help
node dist/cli.js --help
```

For runner/Docker changes, rebuild the image:

```bash
docker build -t skill-optimizer-workbench:local -f docker/workbench-runner.Dockerfile .
```
