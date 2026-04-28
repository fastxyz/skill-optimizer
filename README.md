# skill-optimizer

Docker workbench for running and grading agent skill cases.

The workbench gives an agent a skill/reference folder, an isolated `/work` directory, and deterministic graders. It is designed for evals where success can be verified from files, command logs, SQL, generated outputs, or other local state.

## Requirements

- Node.js 20+
- Docker
- `OPENROUTER_API_KEY` for real agent runs

Only `openrouter/...` model refs are supported.

## Install

```bash
npm install
npm run build
```

## Run One Case

```bash
npx tsx src/cli.ts run-case ./case.yml
```

Run a case against multiple models:

```bash
npx tsx src/cli.ts run-case ./case.yml \
  --models openrouter/google/gemini-2.5-flash,openrouter/openai/gpt-5.4 \
  --trials 3 \
  --concurrency 2
```

Useful options:

- `--out <path>`: results root, default `<case-dir>/.results`
- `--model <model>`: single model override
- `--models <models>`: comma-separated OpenRouter model refs
- `--trials <n>`: independent trials per model, default `1`
- `--concurrency <n>`: maximum concurrent trial containers, default `1`
- `--image <image>`: Docker image name, default `skill-optimizer-workbench:local`
- `--keep-workspace`: copy final `/work` to results; failed trials are always preserved

## Run A Suite

```bash
npx tsx src/cli.ts run-suite ./suite.yml
```

Example `suite.yml`:

```yaml
name: supabase-postgres-best-practices
appendSystemPrompt: |
  Prefer simple, deterministic shell commands when possible.
models:
  - openrouter/google/gemini-2.5-flash
  - openrouter/openai/gpt-5.4
cases:
  - cases/missing-index/case.yml
  - cases/partial-index/case.yml
```

`run-suite` executes the full `cases x models x trials` matrix. Models are defined in `suite.yml`. Use `--trials <n>` to run independent trials per case/model and report trial pass rate, pass@k, pass^k, and mean score. Use `--concurrency <n>` to run independent trial containers in parallel.

Suites may include `appendSystemPrompt` to add suite-wide instructions after the workbench's default operating-environment prompt. This applies to every case in the suite.

## Case Format

```yaml
name: pdf-merge
references: ./references
task: |
  Merge /work/inputs/cover.pdf and /work/inputs/body.pdf into /work/outputs/book.pdf.
graders:
  - name: output-exists
    command: node $CASE/checks/output-exists.mjs
  - name: merged-content
    command: node $CASE/checks/merged-content.mjs
setup:
  - npm install
  - node scripts/create-inputs.mjs
cleanup: []
env:
  - OPENROUTER_API_KEY
model: openrouter/google/gemini-2.5-flash
timeoutSeconds: 600
```

Required fields:

- `name`: case name
- `references`: directory copied into `/work` before the agent runs
- `task`: prompt task given to the agent
- `graders`: commands run after the agent finishes; every grader must pass for the case to pass

Optional fields:

- `setup`: commands run in `/work` before the agent, with `/case` mounted read-only for fixtures/check helpers
- `cleanup`: commands run after grading
- `env`: host environment variable names passed into Docker
- `model`: default model for single-case runs
- `timeoutSeconds`: agent timeout, default `600`

## Case Directories

The case file directory may include these support directories. In setup, grading, and cleanup commands, `$CASE` is exactly the mounted case directory at `/case`; these are just optional directories under it.

- `checks/`: copied read-only to `/case/checks`; use for graders
- `fixtures/`: copied read-only to `/case/fixtures`; use for immutable inputs
- `bin/`: copied read-only to `/case/bin` and prepended to `PATH`; use for fixture CLIs like `gws`
- `workspace/`: copied into `/work` after references; use to seed an app repo or starter files

The agent can modify only `/work`. Graders should live under `/case/checks` so the agent cannot edit them.

## Outputs

Single-model `run-case`:

```text
case/.results/<run-id>/
  trace.jsonl
  result.json
  workspace/        # on failure or --keep-workspace
```

Multi-model `run-case`:

```text
case/.results/<run-id>/
  trials/<model-slug>--001/trace.jsonl
  trials/<model-slug>--001/result.json
  run-result.json
```

`run-suite`:

```text
suite/.results/<run-id>/
  trials/<case-slug>--<model-slug>--001/trace.jsonl
  trials/<case-slug>--<model-slug>--001/result.json
  suite-result.json
```

`trace.jsonl` is the primary agent-loop trace. `result.json` contains `pass`, `score`, `evidence`, per-grader results, and trace-derived metrics. A case passes only when every grader passes; the top-level score is the fraction of graders that passed. Aggregates include trial pass rate, pass@k, pass^k, mean score, and relative paths to each trace/result.

## Suite Validation

Suites can include authored reference solutions. These run through the same graders as model attempts, proving that the task is solvable and that the graders can accept a known-good solution before running models.

```bash
npx tsx src/cli.ts verify-suite ./suite.yml
```

`verify-suite` is a dry preflight: it prints the reference grade to stdout and does not write a `.results` run.

Reference solution convention:

```text
solutions/<case-slug>/solution.sh
```

## Grader Patterns

For CLI skills, put a fixture executable in `bin/` that records invocations to `$WORK/*.json`, then grade command names, flags, JSON bodies, saved outputs, and safety behavior as separate graders where useful.

For SQL skills, ask the agent to write `solution.sql`, then check it statically or execute it against a disposable local database from `checks/`.

For file-output skills, check output validity directly: PDF page counts, DOCX/PPTX/XLSX structure, browser console output, screenshot properties, or file hashes.

For negative cases, grade `trace.jsonl` directly. For example, a task that should not need the PDF skill can fail when `trace.jsonl` contains a `read` tool call for `/work/pdf-skill/SKILL.md`.

## Examples

Tracked examples live under `examples/workbench/`. The PDF example includes positive PDF extraction/splitting/creation cases and a negative case that checks the agent did not read the PDF skill file for a non-PDF task.

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml
```

## Development

```bash
npm run typecheck
npm test
npx tsx src/cli.ts --help
```

Run authored reference solutions for a local suite:

```bash
npx tsx src/cli.ts verify-suite ./suite.yml
```
