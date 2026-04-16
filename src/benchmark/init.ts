import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function initBenchmark(targetDir: string = process.cwd(), surface: 'sdk' | 'cli' | 'mcp' | 'prompt' = 'sdk'): void {
  const generatedDir = resolve(targetDir, '.skill-optimizer');
  mkdirSync(generatedDir, { recursive: true });

  const configPath = resolve(generatedDir, 'skill-optimizer.json');

  if (existsSync(configPath)) {
    console.log(`[init] Skipping ${configPath} (already exists)`);
  } else {
    writeFileSync(configPath, JSON.stringify(buildConfig(surface), null, 2) + '\n', 'utf-8');
    console.log(`[init] Created ${configPath}`);
  }

  if (surface === 'cli') {
    const commandsPath = resolve(generatedDir, 'cli-commands.json');
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
      console.log(`[init] Created ${commandsPath} (template — edit with your real commands)`);
    }
  }

  if (surface === 'mcp') {
    const toolsPath = resolve(generatedDir, 'tools.json');
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
      console.log(`[init] Created ${toolsPath} (template — edit with your real tools)`);
    }
  }

  console.log('\n[init] Done!');
  console.log(`  Surface:    ${surface}`);
  console.log(`  Config:     ${configPath}`);
  console.log(`  Artifacts:  ${generatedDir}/`);
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Edit skill-optimizer.json:');
  console.log('       target.repoPath  → path to your repo (default: current dir)');
  console.log('       target.skill     → path to your SKILL.md');

  if (surface === 'sdk') {
    console.log('       target.discovery.sources → entry file(s) for SDK discovery');
  } else if (surface === 'cli') {
    console.log('       target.discovery.sources → CLI entry file (for code-first discovery)');
    console.log('       .skill-optimizer/cli-commands.json → replace template with your real commands');
    console.log('       (cli-commands.json is used as a fallback if code-first discovery finds nothing)');
  } else {
    console.log('       target.discovery.sources → MCP server file (for code-first discovery)');
    console.log('       .skill-optimizer/tools.json → replace template with your real tools');
    console.log('       (tools.json is used as a fallback if code-first discovery finds nothing)');
  }

  console.log('       benchmark.models → update with real OpenRouter model IDs');
  console.log('  2. Create SKILL.md — explain your surface to the model');
  console.log('  3. Run: skill-optimizer optimize --config ./.skill-optimizer/skill-optimizer.json');
}

function buildConfig(surface: 'sdk' | 'cli' | 'mcp' | 'prompt'): object {
  const commonBenchmark = {
    format: 'pi',
    timeout: 240000,
    taskGeneration: {
      enabled: true,
      maxTasks: 20,
      outputDir: '.',
    },
    models: [
      { id: 'openrouter/anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', tier: 'flagship' },
      { id: 'openrouter/deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', tier: 'flagship' },
      { id: 'openrouter/google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'mid' },
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
    model: 'openrouter/anthropic/claude-sonnet-4.6',
    allowedPaths: ['./SKILL.md'],
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

  if (surface === 'prompt') {
    return {
      name: 'my-prompt',
      target: {
        surface: 'prompt',
        repoPath: '..',
        skill: '../SKILL.md',
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
