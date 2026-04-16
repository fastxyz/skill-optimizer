<!-- AUTO-GENERATED — do not edit. Run `npm run gen-docs` to regenerate. -->


# Error Reference

Every `skill-optimizer` error has a code, a short message, and a fix list.
The catch-all `E_UNEXPECTED` appears if an error slips past the known list.

## Summary

| Code | Description | Quick fix |
|---|---|---|
| `E_INVALID_SURFACE` | Invalid surface value | Set target.surface to one of: sdk, cli, mcp, prompt |
| `E_MODELS_EMPTY` | benchmark.models is empty or missing | Add at least one model to benchmark.models, e.g.: |
| `E_MODEL_ID_FORMAT` | Model ID is missing the openrouter/ prefix | Prefix all model IDs with openrouter/, e.g. openrouter/anthropic/claude-sonnet-4-6 |
| `E_VERDICT_OUT_OF_RANGE` | Verdict threshold is out of range | Set benchmark.verdict.perModelFloor and targetWeightedAverage to values between 0.0 and 1.0 |
| `E_MAX_ITERATIONS_ZERO` | optimize.maxIterations must be a positive integer | Set optimize.maxIterations to a positive integer, e.g. 5 |
| `E_INVALID_FORMAT` | Invalid benchmark.format value | Set benchmark.format to one of: pi, openai, anthropic |
| `E_REPO_NOT_FOUND` | target.repoPath does not exist or is not a directory | Fix target.repoPath in your skill-optimizer.json to point at an existing directory |
| `E_MISSING_SKILL` | target.skill file not found | Create a SKILL.md at the path specified in target.skill |
| `E_SOURCES_NOT_FOUND` | One or more target.discovery.sources files do not exist | Check that all paths in target.discovery.sources exist in your repo |
| `E_CLI_MANIFEST_NOT_FOUND` | target.cli.commands manifest file not found | Run: skill-optimizer import-commands --from <entry-file> to auto-extract |
| `E_MCP_MANIFEST_NOT_FOUND` | target.mcp.tools manifest file not found | Create the tools.json file at the path specified in target.mcp.tools |
| `E_ALLOWED_PATHS_ESCAPE` | optimize.allowedPaths contains a path outside target.repoPath | All paths in optimize.allowedPaths must be inside target.repoPath |
| `E_OUTPUT_DIR_NOT_WRITABLE` | benchmark.output.dir is not writable | Check directory permissions for the path set in benchmark.output.dir |
| `E_MISSING_API_KEY` | API key environment variable is not set | Export your OpenRouter API key before running: export OPENROUTER_API_KEY=sk-or-... |
| `E_DISCOVERY_EMPTY` | Discovery found zero callable actions | Check that target.discovery.sources points at the right entry file |
| `E_MAXTASKS_TOO_LOW` | benchmark.taskGeneration.maxTasks is less than the in-scope action count | Raise benchmark.taskGeneration.maxTasks to at least the number of in-scope actions |
| `E_COVERAGE_EXHAUSTED` | Task generation could not cover all in-scope actions after 2 retry passes | Add guidance for the uncovered actions to your SKILL.md |
| `E_DIRTY_GIT` | Target repo has uncommitted changes | Commit or stash changes in target.repoPath before running the optimizer |
| `E_GIT_CHECKPOINT_FAILED` | Git checkpoint creation failed | Check disk space and git permissions in target.repoPath |
| `E_VALIDATION_FAILED` | Configured validation command exited non-zero | Fix the issue flagged by the validation command before retrying |
| `E_INIT_AUTO_LOW_CONFIDENCE` | init --auto --yes requires high confidence detection | Run init interactively to review and confirm detection: skill-optimizer init --auto |
| `E_UNEXPECTED` | An unexpected error occurred | Check the full error message and stack trace above for details |

## Details

### `E_INVALID_SURFACE`

**Invalid surface value**

**How to fix:**
- Set target.surface to one of: sdk, cli, mcp, prompt
- sdk = TypeScript/Python/Rust library, cli = command-line tool, mcp = MCP server, prompt = prompt template / skill document

### `E_MODELS_EMPTY`

**benchmark.models is empty or missing**

**How to fix:**
- Add at least one model to benchmark.models, e.g.:
-   { "id": "openrouter/anthropic/claude-sonnet-4-6", "name": "Claude Sonnet", "tier": "flagship" }

### `E_MODEL_ID_FORMAT`

**Model ID is missing the openrouter/ prefix**

**How to fix:**
- Prefix all model IDs with openrouter/, e.g. openrouter/anthropic/claude-sonnet-4-6
- Browse available models at https://openrouter.ai/models

### `E_VERDICT_OUT_OF_RANGE`

**Verdict threshold is out of range**

**How to fix:**
- Set benchmark.verdict.perModelFloor and targetWeightedAverage to values between 0.0 and 1.0
- Typical values: perModelFloor=0.6, targetWeightedAverage=0.7

### `E_MAX_ITERATIONS_ZERO`

**optimize.maxIterations must be a positive integer**

**How to fix:**
- Set optimize.maxIterations to a positive integer, e.g. 5

### `E_INVALID_FORMAT`

**Invalid benchmark.format value**

**How to fix:**
- Set benchmark.format to one of: pi, openai, anthropic

### `E_REPO_NOT_FOUND`

**target.repoPath does not exist or is not a directory**

**How to fix:**
- Fix target.repoPath in your skill-optimizer.json to point at an existing directory
- Paths in the config are relative to the config file location

### `E_MISSING_SKILL`

**target.skill file not found**

**How to fix:**
- Create a SKILL.md at the path specified in target.skill
- Or update target.skill in your config to point at an existing file

### `E_SOURCES_NOT_FOUND`

**One or more target.discovery.sources files do not exist**

**How to fix:**
- Check that all paths in target.discovery.sources exist in your repo
- Paths are relative to target.repoPath
- For CLI: point at your main entry file (e.g. src/cli.ts)
- For MCP: point at your server entry file (e.g. src/server.ts)

### `E_CLI_MANIFEST_NOT_FOUND`

**target.cli.commands manifest file not found**

**How to fix:**
- Run: skill-optimizer import-commands --from <entry-file> to auto-extract
- Or create the file manually and populate it with your CLI commands
- Format: Array of { command, description, options[] }

### `E_MCP_MANIFEST_NOT_FOUND`

**target.mcp.tools manifest file not found**

**How to fix:**
- Create the tools.json file at the path specified in target.mcp.tools
- Format: Array of OpenAI function tool definitions { type: "function", function: { name, description, parameters } }

### `E_ALLOWED_PATHS_ESCAPE`

**optimize.allowedPaths contains a path outside target.repoPath**

**How to fix:**
- All paths in optimize.allowedPaths must be inside target.repoPath
- This is a safety boundary — the optimizer will only edit files within this list

### `E_OUTPUT_DIR_NOT_WRITABLE`

**benchmark.output.dir is not writable**

**How to fix:**
- Check directory permissions for the path set in benchmark.output.dir
- Or change benchmark.output.dir to a path you have write access to

### `E_MISSING_API_KEY`

**API key environment variable is not set**

**How to fix:**
- Export your OpenRouter API key before running: export OPENROUTER_API_KEY=sk-or-...
- Or add it to a .env file alongside your skill-optimizer.json
- Get a key at https://openrouter.ai/keys

### `E_DISCOVERY_EMPTY`

**Discovery found zero callable actions**

**How to fix:**
- Check that target.discovery.sources points at the right entry file
- For SDK: should be your public API entry (e.g. src/index.ts)
- For CLI: should be the file that registers all subcommands
- For MCP: should be the file that registers all tools
- Add a fallback manifest: target.discovery.fallbackManifest or target.cli.commands / target.mcp.tools

### `E_MAXTASKS_TOO_LOW`

**benchmark.taskGeneration.maxTasks is less than the in-scope action count**

**How to fix:**
- Raise benchmark.taskGeneration.maxTasks to at least the number of in-scope actions
- Run: skill-optimizer --dry-run --config ./skill-optimizer.json to see the action count
- Or narrow the scope with target.scope.exclude to reduce the action count

### `E_COVERAGE_EXHAUSTED`

**Task generation could not cover all in-scope actions after 2 retry passes**

**How to fix:**
- Add guidance for the uncovered actions to your SKILL.md
- The error message above names the specific uncovered actions
- Or exclude them with target.scope.exclude if they should not be benchmarked

### `E_DIRTY_GIT`

**Target repo has uncommitted changes**

**How to fix:**
- Commit or stash changes in target.repoPath before running the optimizer
- Run: git -C <repoPath> stash
- Or: git -C <repoPath> add -A && git -C <repoPath> commit -m "wip: before optimizer run"

### `E_GIT_CHECKPOINT_FAILED`

**Git checkpoint creation failed**

**How to fix:**
- Check disk space and git permissions in target.repoPath
- Make sure the directory is a valid git repository
- Run: git -C <repoPath> status to verify git state

### `E_VALIDATION_FAILED`

**Configured validation command exited non-zero**

**How to fix:**
- Fix the issue flagged by the validation command before retrying
- The failing command is listed in optimize.validation in your config
- Run the validation command manually to see the full error output

### `E_INIT_AUTO_LOW_CONFIDENCE`

**init --auto --yes requires high confidence detection**

**How to fix:**
- Run init interactively to review and confirm detection: skill-optimizer init --auto
- Or supply a pre-filled answers file: skill-optimizer init --answers answers.json
- See README for the answers.json format

### `E_UNEXPECTED`

**An unexpected error occurred**

**How to fix:**
- Check the full error message and stack trace above for details
- File an issue at https://github.com/fastxyz/skill-optimizer/issues with the full output
