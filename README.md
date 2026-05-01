# skill-optimizer

Docker workbench and Agent Skill for running deterministic evals against agent skills.

Use this repo in two ways:

- Install the `skill-optimizer` skill/plugin into your agent so it can author and debug eval suites.
- Run the local CLI to execute cases and suites in Docker against OpenRouter models.

## Install For Agents

The canonical skill is `skills/skill-optimizer/SKILL.md`. Plugin metadata points at that same file for every supported agent.

Install the skill for common agents with the open skills CLI:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a claude-code -a opencode -a codex -a cursor
```

Claude Code plugin install:

```text
/plugin marketplace add fastxyz/skill-optimizer
/plugin install skill-optimizer@skill-optimizer
```

OpenCode plugin install in `opencode.json`:

```json
{
  "plugin": ["skill-optimizer@git+https://github.com/fastxyz/skill-optimizer.git"]
}
```

See `docs/README.opencode.md` for OpenCode details.

Codex plugin install:

```bash
codex plugin marketplace add fastxyz/skill-optimizer
```

Then open `/plugins` and install `skill-optimizer`. See `docs/README.codex.md` for the skill-only Codex path.

Cursor can install the skill through the skills CLI command above or from GitHub via Settings -> Rules -> Project Rules -> Add Rule -> Remote Rule (Github). The Cursor plugin metadata lives at `.cursor-plugin/plugin.json`.

Gemini extension metadata is provided by `gemini-extension.json`; it loads `GEMINI.md`, which references the canonical skill and workbench reference.

## Local CLI Setup

Requirements:

- Node.js 20+
- Docker
- `OPENROUTER_API_KEY` for real model runs

Install and build:

```bash
npm install
npm run build
```

Only `openrouter/...` model refs are supported.

## Quick Start

Verify a suite's fixtures, reference solutions, and graders without calling a model:

```bash
npx tsx src/cli.ts verify-suite examples/workbench/pdf/suite.yml
```

Run the suite against the models listed in `suite.yml`:

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
```

Run one case directly:

```bash
npx tsx src/cli.ts run-case ./case.yml --model openrouter/google/gemini-2.5-flash
```

CLI help:

```bash
npx tsx src/cli.ts --help
npx tsx src/cli.ts run-case --help
npx tsx src/cli.ts run-suite --help
npx tsx src/cli.ts verify-suite --help
```

## How The Workbench Works

The workbench gives an agent a skill/reference folder, an isolated `/work` directory, and deterministic graders. It is designed for evals where success can be verified from files, command logs, SQL, generated artifacts, or other local state.

Core concepts:

- A case is one user-like task plus one or more graders.
- A suite is a matrix of cases and OpenRouter models.
- `references/` is copied into `/work`; this is where the skill under test lives.
- The agent phase sees only `/work`, not graders, fixtures, hidden answers, `/case`, or `/results`.
- Graders run after the agent with `$CASE`, `$WORK`, and `$RESULTS` available.
- `solutions/<case-slug>/solution.sh` is an optional known-good producer used by `verify-suite`; it is not the answer key.

Read `docs/workbench.md` for the full model: directory layout, Docker phases, graders, reference solutions, outputs, and debugging.

## Examples

Tracked examples live under `examples/workbench/`. The PDF example includes positive PDF extraction/splitting/creation cases and a negative case that checks the agent did not read the PDF skill file for a non-PDF task. The MCP example shows a local calculator server started as a hidden Docker service and exposed through the workbench `mcp` command.

```bash
npx tsx src/cli.ts verify-suite examples/workbench/pdf/suite.yml
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
npx tsx src/cli.ts verify-suite examples/workbench/mcp/suite.yml
```

## Development

```bash
npm run typecheck
npm test
npm run build
npx tsx src/cli.ts --help
```

For Docker runner or image changes:

```bash
docker build -t skill-optimizer-workbench:local -f docker/workbench-runner.Dockerfile .
```

Do not commit `.skill-eval/`, `.results/`, `.env`, or credentials.
