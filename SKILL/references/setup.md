# Setup & Init

This guide walks through setting up skill-optimizer for your project, from prerequisites to a verified configuration.

## 1. Prerequisites

Before starting, verify these three requirements:

**Node.js 20+:**
```bash
node --version
# Expected: v20.x.x or higher
```

**API key** (which one depends on your `benchmark.format`):
```bash
# Default — OpenRouter (format: "pi"):
export OPENROUTER_API_KEY=sk-or-your-key-here

# Direct OpenAI (format: "openai"):
export OPENAI_API_KEY=sk-your-key-here

# Direct Anthropic (format: "anthropic"):
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```
If you're just getting started, use OpenRouter — one key covers all providers.

**skill-optimizer available:**
```bash
npx skill-optimizer --help
# Expected: Usage information
# If not installed globally, install from the repo:
#   cd /path/to/skill-optimizer && npm install && npm run build && npm link
```

## 2. Determine Your Surface Type

skill-optimizer supports four surface types. Pick the one that matches your project:

| Surface | Your project exposes... | Examples |
|---------|------------------------|----------|
| `cli` | CLI commands or a binary | Yargs, Commander, @optique/core, argparse, Click, Clap |
| `sdk` | Library methods users call in code | TypeScript/Python/Rust SDKs |
| `mcp` | MCP tool handlers | MCP servers with `server.tool()` definitions |
| `prompt` | Prompt templates or agent skill docs | SKILL.md files, Claude Code skills, agent instructions |

If unsure: does your user run commands in a terminal (`cli`), import your package and call functions (`sdk`), connect an AI agent to your tool server (`mcp`), or follow a prompt template / skill document (`prompt`)?

## 3. Run the Init Wizard

From your project root:

```bash
npx skill-optimizer init <surface>
# Example: npx skill-optimizer init cli
```

The wizard prompts for:

- **Repo path** — absolute path to your project root (defaults to CWD)
- **Models** — model IDs to benchmark against (e.g., `openrouter/anthropic/claude-sonnet-4.6`)
- **SKILL.md location** — path to your existing documentation or guidance file
- **Discovery sources** — source files for tree-sitter to parse (e.g., `src/cli.ts`, `src/index.ts`)
- **Max tasks** — upper bound on generated benchmark tasks (default: 20)

**Non-interactive mode** (for CI or scripting):

The `--auto` and `--yes` flags are independent and serve different purposes:

| Flag | Effect |
|------|--------|
| `--yes` | Accept all defaults without prompting. Still requires a surface name unless combined with `--auto`. |
| `--auto` | Auto-detect the surface type from the current directory. Still opens the interactive wizard (pre-filled) unless combined with `--yes`. |
| `--auto --yes` | **Fully non-interactive**: detect surface + accept all defaults. Use this for automated pipelines where the surface type isn't known in advance. |

```bash
# Explicit surface, no prompts
npx skill-optimizer init cli --yes

# Auto-detect surface + no prompts (fully automated, zero interaction)
npx skill-optimizer init --auto --yes

# Load answers from a file
npx skill-optimizer init --answers answers.json
```

`answers.json` format:
```json
{
  "surface": "cli",
  "repoPath": "/absolute/path/to/your-repo",
  "models": ["openrouter/anthropic/claude-sonnet-4.6", "openrouter/openai/gpt-4o-mini"],
  "maxTasks": 20,
  "maxIterations": 5,
  "entryFile": "src/cli.ts"
}
```

## 4. Surface Discovery

After init, skill-optimizer needs to know what actions your project exposes. There are two discovery modes:

**Code-first (auto)** — tree-sitter parses your source files automatically. This works for:
- TypeScript: Yargs, Commander, @optique/core CLI frameworks
- TypeScript/Python/Rust: SDK method extraction
- TypeScript: MCP `server.tool()` definitions

If auto-discovery finds your actions, you're done. Check with:
```bash
npx skill-optimizer run --dry-run --config <config-path>
# Look for "Discovered N actions" in the output
```

**Manual / import** — if auto-discovery yields nothing or misses actions:

```bash
# Extract from TypeScript source, write to file
npx skill-optimizer import-commands --from ./src/cli.ts --out ./.skill-optimizer/cli-commands.json

# Overwrite an existing output file (required when the file already exists)
npx skill-optimizer import-commands --from ./src/cli.ts --out ./.skill-optimizer/cli-commands.json --force

# Extract from a compiled binary's help text, limit subcommand depth
npx skill-optimizer import-commands --from my-cli --scrape --depth 3
```

Key `import-commands` flags:

| Flag | Meaning |
|------|---------|
| `--from <path>` | Source file or binary name (required) |
| `--out <path>` | Write output to this file. Without `--out`, output goes to stdout. Do not use `>` shell redirection — it produces malformed output. |
| `--force` | Overwrite `--out` file if it already exists. Required on re-runs. |
| `--scrape` | Invoke as a binary and parse `--help` output instead of reading source |
| `--depth <n>` | Max subcommand depth during scrape. Flag is `--depth`, not `--max-depth`. |

This populates `.skill-optimizer/cli-commands.json` (CLI) or `.skill-optimizer/tools.json` (MCP). You can also edit these manifest files by hand.

## 5. Verify with Doctor

Run the config diagnostics to catch problems early:

```bash
npx skill-optimizer doctor --config <config-path>
```

If issues are found, auto-fix what's fixable:

```bash
npx skill-optimizer doctor --fix --config <config-path>
```

Two optional flags activate additional checks that are off by default:

| Flag | Effect | Note |
|------|--------|------|
| `--static` | Skip live code discovery (tree-sitter). Validates config and manifests only. | Flag is `--static`, not `--no-discovery`. |
| `--check-models` | Ping each configured model to verify API credentials and routing. | Flag is `--check-models`, not `--ping` or `--verify-models`. |

```bash
# Validate config without running discovery (fast, works without project source)
npx skill-optimizer doctor --config <config-path> --static

# Verify model API keys are working
npx skill-optimizer doctor --config <config-path> --check-models
```

## 6. What You Should Have Now

After successful setup:

- **`skill-optimizer.json`** — main config file (commit this); when created by `init`, the default location is `./.skill-optimizer/skill-optimizer.json`
- **`.skill-optimizer/`** — working directory for task artifacts, surface manifests, and versioned skill copies (gitignored)

Your project is ready for benchmarking. Read `references/benchmark.md` for next steps.

## 7. Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| "Config not found" | Wrong path to `skill-optimizer.json` | Use `--config` with the full path |
| "No actions discovered" | `discovery.sources` points at wrong files | Check paths are relative to `repoPath` |
| "Skill file not found" | `target.skill` path is wrong | Path is relative to `repoPath` — verify it exists |
| "repoPath not found" | Relative path resolved wrong | Use absolute path, or make it relative to config file location |
