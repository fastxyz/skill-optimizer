# skill-optimizer

Docker workbench and Agent Skill for running deterministic evals against agent skills.

Use this repo in two ways:

- Install the `skill-optimizer` skill/plugin into your agent so it can author and debug eval suites.
- Run the local CLI to execute cases and suites in Docker against OpenRouter models.

## Installation

Installation differs by agent. The canonical skill is `skills/skill-optimizer/SKILL.md`; every plugin manifest points at that same file.

### Claude Code

Register this repository as a Claude Code plugin marketplace:

```text
/plugin marketplace add fastxyz/skill-optimizer
```

Then install the plugin:

```text
/plugin install skill-optimizer@skill-optimizer
```

### OpenAI Codex CLI

Register this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add fastxyz/skill-optimizer
```

Then open the plugin search interface:

```text
/plugins
```

Select `skill-optimizer` and install it.

### OpenAI Codex App

In the Codex app, open Plugins from the sidebar, search for `skill-optimizer`, and install it from the Coding section.

If it is not listed, install it from Codex CLI first:

```bash
codex plugin marketplace add fastxyz/skill-optimizer
```

### Cursor

Install the skill with the open skills CLI:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a cursor -y
```

Cursor can also import the skill from GitHub via Settings -> Rules -> Project Rules -> Add Rule -> Remote Rule (Github). The Cursor plugin metadata lives at `.cursor-plugin/plugin.json`.

### OpenCode

Tell OpenCode:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/fastxyz/skill-optimizer/refs/heads/main/.opencode/INSTALL.md
```

Or add the plugin to `opencode.json` at user or project scope:

```json
{
  "plugin": ["skill-optimizer@git+https://github.com/fastxyz/skill-optimizer.git"]
}
```

Restart OpenCode. See `docs/README.opencode.md` for details.

### Gemini CLI

Install the Gemini extension from GitHub:

```bash
gemini extensions install https://github.com/fastxyz/skill-optimizer
```

To update:

```bash
gemini extensions update skill-optimizer
```

### Skill-Only Install

If you only want the skill files without plugin metadata, use the open skills CLI:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a claude-code -a opencode -a codex -a cursor -y
```

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
```

## How The Workbench Works

The workbench gives an agent a skill/reference folder, an isolated `/work` directory, and deterministic graders. It is designed for evals where success can be verified from files, command logs, SQL, generated artifacts, or other local state.

Core concepts:

- A case is one user-like task plus one or more graders.
- A suite is a matrix of cases and OpenRouter models.
- `references/` is copied into `/work`; this is where the skill under test lives.
- The agent phase sees only `/work`, not graders, hidden answers, `/case`, or `/results`.
- Graders run after the agent with `$CASE`, `$WORK`, and `$RESULTS` available.
- Graders are the acceptance contract. They can inspect workspace files and artifacts, `answer.json`, `trace.jsonl`, and result state under `$RESULTS`.

Read `docs/workbench.md` for the full model: directory layout, Docker phases, graders, outputs, and debugging.

## Examples

Tracked examples live under `examples/workbench/`. The PDF example includes positive PDF extraction/splitting/creation cases and a negative case that checks the agent did not read the PDF skill file for a non-PDF task. The MCP example shows a local calculator server started as a hidden Docker service and exposed through the workbench `mcp` command.

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
npx tsx src/cli.ts run-suite examples/workbench/mcp/suite.yml --trials 1
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
