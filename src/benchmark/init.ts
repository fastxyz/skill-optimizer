import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Scaffold benchmark config and surface-specific files for a new project.
 * All files are written into a `skill-optimizer/` subdirectory so they
 * don't clutter the project root.
 *
 * - sdk: creates skill-optimizer.json only (code-first discovery via sources)
 * - cli: creates skill-optimizer.json + cli-commands.json manifest template
 * - mcp: creates skill-optimizer.json + tools.json manifest template
 *
 * Tasks are never scaffolded — task generation (benchmark.taskGeneration.enabled)
 * handles them automatically at run time.
 */
export function initBenchmark(targetDir: string = process.cwd(), surface: 'sdk' | 'cli' | 'mcp' = 'sdk'): void {
  const configDir = resolve(targetDir, 'skill-optimizer');
  mkdirSync(configDir, { recursive: true });

  const configPath = resolve(configDir, 'skill-optimizer.json');

  // ── skill-optimizer.json ─────────────────────────────────────────────────
  // Paths use "../" because this config lives one level below the project root.
  if (existsSync(configPath)) {
    console.log(`[init] Skipping ${configPath} (already exists)`);
  } else {
    const config = buildConfig(surface);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`[init] Created ${configPath}`);
  }

  // ── Surface-specific companion files ─────────────────────────────────────
  if (surface === 'cli') {
    const commandsPath = resolve(configDir, 'cli-commands.json');
    if (existsSync(commandsPath)) {
      console.log(`[init] Skipping ${commandsPath} (already exists)`);
    } else {
      const commands = [
        {
          command: 'example-create',
          description: 'Create a new item',
          options: [
            { name: '--name', takesValue: true, description: 'Name for the item' },
          ],
        },
        {
          command: 'example-list',
          description: 'List all items',
          options: [
            { name: '--format', takesValue: true, description: 'Output format: json | table (default: table)' },
          ],
        },
      ];
      writeFileSync(commandsPath, JSON.stringify(commands, null, 2) + '\n', 'utf-8');
      console.log(`[init] Created ${commandsPath}`);
    }
  }

  if (surface === 'mcp') {
    const toolsPath = resolve(configDir, 'tools.json');
    if (existsSync(toolsPath)) {
      console.log(`[init] Skipping ${toolsPath} (already exists)`);
    } else {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_data',
            description: 'Get data for a given item ID',
            parameters: {
              type: 'object',
              properties: {
                item_id: { type: 'string', description: 'The item identifier' },
              },
              required: ['item_id'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'send_data',
            description: 'Send data to a recipient',
            parameters: {
              type: 'object',
              properties: {
                value: { type: 'string', description: 'The data to send' },
                recipient: { type: 'string', description: 'The recipient identifier' },
              },
              required: ['value', 'recipient'],
            },
          },
        },
      ];
      writeFileSync(toolsPath, JSON.stringify(tools, null, 2) + '\n', 'utf-8');
      console.log(`[init] Created ${toolsPath}`);
    }
  }

  // ── Next steps ────────────────────────────────────────────────────────────
  console.log('\n[init] Done! Next steps:');
  console.log('  1. Edit skill-optimizer/skill-optimizer.json:');
  console.log('       target.repoPath  → path to your repo');
  console.log('       target.skill     → path to your SKILL.md');

  if (surface === 'sdk') {
    console.log('       target.discovery.sources → entry file(s) for SDK discovery');
  } else if (surface === 'cli') {
    console.log('       target.discovery.sources → CLI entry file (for code-first discovery)');
    console.log('       skill-optimizer/cli-commands.json → replace example commands with your real commands');
    console.log('       (cli-commands.json is used as a fallback if code-first discovery finds nothing)');
  } else {
    console.log('       target.discovery.sources → MCP server file (for code-first discovery)');
    console.log('       skill-optimizer/tools.json → replace example tools with your real tools');
    console.log('       (tools.json is used as a fallback if code-first discovery finds nothing)');
  }

  console.log('       benchmark.models → update with real OpenRouter model IDs');
  console.log('  2. Run: npx tsx src/cli.ts run --config ./skill-optimizer/skill-optimizer.json');
}

function buildConfig(surface: 'sdk' | 'cli' | 'mcp'): object {
  const commonBenchmark = {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    format: 'pi',
    timeout: 240000,
    taskGeneration: {
      enabled: true,
      maxTasks: 20,
      outputDir: './.skill-optimizer',
    },
    models: [
      { id: 'openrouter/openai/gpt-4o', name: 'GPT-4o', tier: 'flagship' },
      { id: 'openrouter/google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', tier: 'mid' },
    ],
    output: {
      dir: '../benchmark-results',
    },
    verdict: {
      perModelFloor: 0.6,
      targetWeightedAverage: 0.7,
    },
  };

  const commonOptimize = {
    model: 'openrouter/anthropic/claude-sonnet-4-6',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    allowedPaths: ['../SKILL.md'],
    validation: [],
    maxIterations: 5,
  };

  if (surface === 'sdk') {
    return {
      name: 'my-sdk',
      target: {
        surface: 'sdk',
        repoPath: '..',
        skill: '../SKILL.md',
        discovery: {
          mode: 'auto',
          sources: ['../src/index.ts'],
        },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  if (surface === 'cli') {
    return {
      name: 'my-cli',
      target: {
        surface: 'cli',
        repoPath: '..',
        skill: '../SKILL.md',
        discovery: {
          mode: 'auto',
          sources: ['../src/cli.ts'],
        },
        cli: {
          commands: './cli-commands.json',
        },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  // mcp
  return {
    name: 'my-mcp',
    target: {
      surface: 'mcp',
      repoPath: '..',
      skill: '../SKILL.md',
      discovery: {
        mode: 'auto',
        sources: ['../src/server.ts'],
      },
      mcp: {
        tools: './tools.json',
      },
    },
    benchmark: commonBenchmark,
    optimize: commonOptimize,
  };
}
