export interface ErrorDef {
  code: string;
  message: string;
  fix: string[];
}

export class SkillOptimizerError extends Error {
  constructor(public readonly def: ErrorDef, public readonly detail?: string) {
    super(detail ? `${def.message}: ${detail}` : def.message);
    this.name = def.code;
  }
}

export function printError(err: SkillOptimizerError): void {
  console.error(`\nError [${err.def.code}]: ${err.message}`);
  if (err.def.fix.length > 0) {
    console.error('How to fix:');
    for (const step of err.def.fix) {
      console.error(`  • ${step}`);
    }
  }
}

export const ERRORS = {
  // ── Config validation ──────────────────────────────────────────────────────
  E_INVALID_SURFACE: {
    code: 'E_INVALID_SURFACE',
    message: 'Invalid surface value',
    fix: [
      'Set target.surface to one of: sdk, cli, mcp',
      'sdk = TypeScript/Python/Rust library, cli = command-line tool, mcp = MCP server',
    ],
  },
  E_MODELS_EMPTY: {
    code: 'E_MODELS_EMPTY',
    message: 'benchmark.models is empty or missing',
    fix: [
      'Add at least one model to benchmark.models, e.g.:',
      '  { "id": "openrouter/anthropic/claude-sonnet-4-6", "name": "Claude Sonnet", "tier": "flagship" }',
    ],
  },
  E_MODEL_ID_FORMAT: {
    code: 'E_MODEL_ID_FORMAT',
    message: 'Model ID is missing the openrouter/ prefix',
    fix: [
      'Prefix all model IDs with openrouter/, e.g. openrouter/anthropic/claude-sonnet-4-6',
      'Browse available models at https://openrouter.ai/models',
    ],
  },
  E_VERDICT_OUT_OF_RANGE: {
    code: 'E_VERDICT_OUT_OF_RANGE',
    message: 'Verdict threshold is out of range',
    fix: [
      'Set benchmark.verdict.perModelFloor and targetWeightedAverage to values between 0.0 and 1.0',
      'Typical values: perModelFloor=0.6, targetWeightedAverage=0.7',
    ],
  },
  E_MAX_ITERATIONS_ZERO: {
    code: 'E_MAX_ITERATIONS_ZERO',
    message: 'optimize.maxIterations must be a positive integer',
    fix: [
      'Set optimize.maxIterations to a positive integer, e.g. 5',
    ],
  },
  E_INVALID_FORMAT: {
    code: 'E_INVALID_FORMAT',
    message: 'Invalid benchmark.format value',
    fix: [
      'Set benchmark.format to one of: pi, openai, anthropic',
    ],
  },
  // ── Path resolution ────────────────────────────────────────────────────────
  E_REPO_NOT_FOUND: {
    code: 'E_REPO_NOT_FOUND',
    message: 'target.repoPath does not exist or is not a directory',
    fix: [
      'Fix target.repoPath in your skill-optimizer.json to point at an existing directory',
      'Paths in the config are relative to the config file location',
    ],
  },
  E_MISSING_SKILL: {
    code: 'E_MISSING_SKILL',
    message: 'target.skill file not found',
    fix: [
      'Create a SKILL.md at the path specified in target.skill',
      'Or update target.skill in your config to point at an existing file',
    ],
  },
  E_SOURCES_NOT_FOUND: {
    code: 'E_SOURCES_NOT_FOUND',
    message: 'One or more target.discovery.sources files do not exist',
    fix: [
      'Check that all paths in target.discovery.sources exist in your repo',
      'Paths are relative to target.repoPath',
      'For CLI: point at your main entry file (e.g. src/cli.ts)',
      'For MCP: point at your server entry file (e.g. src/server.ts)',
    ],
  },
  E_CLI_MANIFEST_NOT_FOUND: {
    code: 'E_CLI_MANIFEST_NOT_FOUND',
    message: 'target.cli.commands manifest file not found',
    fix: [
      'Run: skill-optimizer import-commands --from <entry-file> to auto-extract',
      'Or create the file manually and populate it with your CLI commands',
      'Format: Array of { command, description, options[] }',
    ],
  },
  E_MCP_MANIFEST_NOT_FOUND: {
    code: 'E_MCP_MANIFEST_NOT_FOUND',
    message: 'target.mcp.tools manifest file not found',
    fix: [
      'Create the tools.json file at the path specified in target.mcp.tools',
      'Format: Array of OpenAI function tool definitions { type: "function", function: { name, description, parameters } }',
    ],
  },
  E_ALLOWED_PATHS_ESCAPE: {
    code: 'E_ALLOWED_PATHS_ESCAPE',
    message: 'optimize.allowedPaths contains a path outside target.repoPath',
    fix: [
      'All paths in optimize.allowedPaths must be inside target.repoPath',
      'This is a safety boundary — the optimizer will only edit files within this list',
    ],
  },
  E_OUTPUT_DIR_NOT_WRITABLE: {
    code: 'E_OUTPUT_DIR_NOT_WRITABLE',
    message: 'benchmark.output.dir is not writable',
    fix: [
      'Check directory permissions for the path set in benchmark.output.dir',
      'Or change benchmark.output.dir to a path you have write access to',
    ],
  },
  // ── Environment ────────────────────────────────────────────────────────────
  E_MISSING_API_KEY: {
    code: 'E_MISSING_API_KEY',
    message: 'API key environment variable is not set',
    fix: [
      'Export your OpenRouter API key before running: export OPENROUTER_API_KEY=sk-or-...',
      'Or add it to a .env file alongside your skill-optimizer.json',
      'Get a key at https://openrouter.ai/keys',
    ],
  },
  E_LEGACY_CONFIG: {
    code: 'E_LEGACY_CONFIG',
    message: 'Found skill-benchmark.json instead of skill-optimizer.json',
    fix: [
      'Rename skill-benchmark.json to skill-optimizer.json',
      'See CHANGELOG.md for any field renames between versions',
    ],
  },
  // ── Discovery ─────────────────────────────────────────────────────────────
  E_DISCOVERY_EMPTY: {
    code: 'E_DISCOVERY_EMPTY',
    message: 'Discovery found zero callable actions',
    fix: [
      'Check that target.discovery.sources points at the right entry file',
      'For SDK: should be your public API entry (e.g. src/index.ts)',
      'For CLI: should be the file that registers all subcommands',
      'For MCP: should be the file that registers all tools',
      'Add a fallback manifest: target.discovery.fallbackManifest or target.cli.commands / target.mcp.tools',
    ],
  },
  // ── Task generation ────────────────────────────────────────────────────────
  E_MAXTASKS_TOO_LOW: {
    code: 'E_MAXTASKS_TOO_LOW',
    message: 'benchmark.taskGeneration.maxTasks is less than the in-scope action count',
    fix: [
      'Raise benchmark.taskGeneration.maxTasks to at least the number of in-scope actions',
      'Run: skill-optimizer --dry-run --config ./skill-optimizer.json to see the action count',
      'Or narrow the scope with target.scope.exclude to reduce the action count',
    ],
  },
  E_COVERAGE_EXHAUSTED: {
    code: 'E_COVERAGE_EXHAUSTED',
    message: 'Task generation could not cover all in-scope actions after 2 retry passes',
    fix: [
      'Add guidance for the uncovered actions to your SKILL.md',
      'The error message above names the specific uncovered actions',
      'Or exclude them with target.scope.exclude if they should not be benchmarked',
    ],
  },
  // ── Optimizer runtime ──────────────────────────────────────────────────────
  E_DIRTY_GIT: {
    code: 'E_DIRTY_GIT',
    message: 'Target repo has uncommitted changes',
    fix: [
      'Commit or stash changes in target.repoPath before running the optimizer',
      'Run: git -C <repoPath> stash',
      'Or: git -C <repoPath> add -A && git -C <repoPath> commit -m "wip: before optimizer run"',
    ],
  },
  E_GIT_CHECKPOINT_FAILED: {
    code: 'E_GIT_CHECKPOINT_FAILED',
    message: 'Git checkpoint creation failed',
    fix: [
      'Check disk space and git permissions in target.repoPath',
      'Make sure the directory is a valid git repository',
      'Run: git -C <repoPath> status to verify git state',
    ],
  },
  E_VALIDATION_FAILED: {
    code: 'E_VALIDATION_FAILED',
    message: 'Configured validation command exited non-zero',
    fix: [
      'Fix the issue flagged by the validation command before retrying',
      'The failing command is listed in optimize.validation in your config',
      'Run the validation command manually to see the full error output',
    ],
  },
  // ── Init ──────────────────────────────────────────────────────────────────
  E_INIT_AUTO_LOW_CONFIDENCE: {
    code: 'E_INIT_AUTO_LOW_CONFIDENCE',
    message: 'init --auto --yes requires high confidence detection',
    fix: [
      'Run init interactively to review and confirm detection: skill-optimizer init --auto',
      'Or supply a pre-filled answers file: skill-optimizer init --answers answers.json',
      'See README for the answers.json format',
    ],
  },
  // ── Catch-all ─────────────────────────────────────────────────────────────
  E_UNEXPECTED: {
    code: 'E_UNEXPECTED',
    message: 'An unexpected error occurred',
    fix: [
      'Check the full error message and stack trace above for details',
      'File an issue at https://github.com/bucurdavid/skill-optimizer/issues with the full output',
    ],
  },
} as const satisfies Record<string, ErrorDef>;
