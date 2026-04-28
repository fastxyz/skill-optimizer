# skill-optimizer

Docker workbench for running and grading agent skill cases.

The workbench gives an agent a skill/reference folder, an isolated `/work` directory, and deterministic graders. It is designed for evals where success can be verified from files, command logs, SQL, generated artifacts, or other local state.

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
  --trials 3
```

Useful options:

- `--out <path>`: results root, default `<case-dir>/.results`
- `--model <model>`: single model override
- `--models <models>`: comma-separated OpenRouter model refs
- `--trials <n>`: independent trials per model, default `1`
- `--image <image>`: Docker image name, default `skill-optimizer-workbench:local`
- `--keep-workspace`: copy final `/work` to results

## Run A Suite

```bash
npx tsx src/cli.ts run-suite ./suite.yml
```

Example `suite.yml`:

```yaml
name: supabase-postgres-best-practices
models:
  - openrouter/google/gemini-2.5-flash
  - openrouter/openai/gpt-5.4
cases:
  - cases/missing-index/case.yml
  - cases/partial-index/case.yml
```

`run-suite` executes the full `cases x models` matrix sequentially. CLI `--models` overrides suite `models`.
Use `--trials <n>` to run independent trials per case/model and report trial pass rate, pass@k, pass^k, and mean score.

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
artifacts:
  - .firecrawl/**
  - firecrawl-calls.ndjson
```

Required fields:

- `name`: case name
- `references`: directory copied into `/work` before the agent runs
- `task`: prompt task given to the agent
- `graders`: commands run after the agent finishes; every grader must pass for the case to pass

Optional fields:

- `setup`: commands run in `/work` before the agent
- `cleanup`: commands run after grading
- `env`: host environment variable names passed into Docker
- `model`: default model for single-case runs
- `timeoutSeconds`: agent timeout, default `600`
- `artifacts`: optional `/work` glob patterns copied to `results/artifacts/` after grading

## Case Directories

The case file directory may include these support directories:

- `checks/`: copied read-only to `/case/checks`; use for graders
- `fixtures/`: copied read-only to `/case/fixtures`; use for immutable inputs
- `bin/`: copied read-only to `/case/bin` and prepended to `PATH`; use for fixture CLIs like `gws`
- `workspace/`: copied into `/work` after references; use to seed an app repo or starter files

The agent can modify only `/work`. Graders should live under `/case/checks` so the agent cannot edit them.

## Outputs

Single-model `run-case`:

```text
case/.results/<run-id>/
  trace.json
  result.json
```

Multi-model `run-case`:

```text
case/.results/<run-id>/
  models/<model-slug>/trace.json
  models/<model-slug>/result.json
  run-result.json
```

`run-suite`:

```text
suite/.results/<run-id>/
  cases/<case-slug>/<model-slug>/trace.json
  cases/<case-slug>/<model-slug>/result.json
  suite-result.json
```

`result.json` contains `pass`, `score`, `evidence`, per-grader results, and trace-derived metrics. A case passes only when every grader passes; the top-level score is the fraction of graders that passed. Trial runs also write `trial-summary.json` with failed graders, bash commands, final assistant text, and metrics. Aggregates include trial pass rate, pass@k, pass^k, mean score, and relative paths to each trace/result.

## Suite Validation

Suites can include authored reference solutions and grader fixtures. These do not decide whether tasks are fair; they give suite authors deterministic checks that the eval plumbing works before running models.

```bash
npx tsx src/cli.ts verify-suite .skill-eval/firecrawl-cli/suite.yml
npx tsx src/cli.ts test-graders .skill-eval/firecrawl-cli/suite.yml
```

Reference solution convention:

```text
solutions/<case-slug>/solution.sh
```

Grader fixture convention:

```text
grader-fixtures/<case-slug>/<fixture-name>/
  expected.json
```

`expected.json` maps grader names to expected pass/fail values:

```json
{
  "graders": {
    "uses-search": true,
    "saves-output": false
  }
}
```

Public skill suites can also declare source provenance:

```yaml
source:
  type: git
  url: https://github.com/firecrawl/cli
  ref: 3c6ac28a0c7b3d877df811db7942e918c32235ca
  includedPaths:
    - skills/
```

When `source` is present, the suite root must include a matching `provenance.json`, and each included path must exist under `references/source/`.

## Grader Patterns

For CLI skills, put a fixture executable in `bin/` that records invocations to `$WORK/*.ndjson`, then grade command names, flags, JSON bodies, saved outputs, and safety behavior as separate graders where useful.

For SQL skills, ask the agent to write `solution.sql`, then check it statically or execute it against a disposable local database from `checks/`.

For artifact skills, check output validity directly: PDF page counts, DOCX/PPTX/XLSX structure, browser console output, screenshot properties, or file hashes.

## Development

```bash
npm run typecheck
npm test
npx tsx src/cli.ts --help
```

Run the included PDF fixture:

```bash
OPENROUTER_API_KEY=sk-or-... \
npx tsx src/cli.ts run-case tests/fixtures/workbench/pdf-merge/case.yml
```
