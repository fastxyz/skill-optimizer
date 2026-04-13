import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type { WizardAnswers } from './answers.js';
import { importCommands } from '../import/index.js';

export function buildConfigFromAnswers(answers: WizardAnswers): object {
  const { surface, repoPath, models, maxTasks, maxIterations, name } = answers;
  const projectName = name ?? basename(repoPath);

  const commonBenchmark = {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    format: 'pi',
    timeout: 240000,
    taskGeneration: { enabled: true, maxTasks, outputDir: './.skill-optimizer' },
    models: models.map(id => ({ id })),
    output: { dir: '../benchmark-results' },
    verdict: { perModelFloor: 0.6, targetWeightedAverage: 0.7 },
  };

  const commonOptimize = {
    model: models.includes('openrouter/anthropic/claude-sonnet-4-6')
      ? 'openrouter/anthropic/claude-sonnet-4-6'
      : models[0]!,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    allowedPaths: ['../SKILL.md'],
    validation: [],
    maxIterations,
  };

  if (surface === 'sdk') {
    return {
      name: projectName,
      target: {
        surface: 'sdk',
        repoPath,
        skill: resolve(repoPath, 'SKILL.md'),
        discovery: { mode: 'auto', sources: [resolve(repoPath, 'src/index.ts')] },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  if (surface === 'cli') {
    return {
      name: projectName,
      target: {
        surface: 'cli',
        repoPath,
        skill: resolve(repoPath, 'SKILL.md'),
        discovery: {
          mode: 'auto',
          sources: [answers.entryFile ? resolve(repoPath, answers.entryFile) : resolve(repoPath, 'src/cli.ts')],
        },
        cli: { commands: './.skill-optimizer/cli-commands.json' },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  // mcp
  return {
    name: projectName,
    target: {
      surface: 'mcp',
      repoPath,
      skill: resolve(repoPath, 'SKILL.md'),
      discovery: {
        mode: 'auto',
        sources: [answers.entryFile ? resolve(repoPath, answers.entryFile) : resolve(repoPath, 'src/server.ts')],
      },
      mcp: { tools: './.skill-optimizer/tools.json' },
    },
    benchmark: commonBenchmark,
    optimize: commonOptimize,
  };
}

export async function scaffoldInit(answers: WizardAnswers, cwd: string): Promise<void> {
  const configDir = resolve(cwd, 'skill-optimizer');
  const generatedDir = resolve(configDir, '.skill-optimizer');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });

  const configPath = resolve(configDir, 'skill-optimizer.json');
  if (existsSync(configPath)) {
    console.log(`[init] Skipping ${configPath} (already exists)`);
  } else {
    writeFileSync(configPath, JSON.stringify(buildConfigFromAnswers(answers), null, 2) + '\n', 'utf-8');
    console.log(`[init] Created ${configPath}`);
  }

  if (answers.surface === 'cli') {
    const commandsPath = resolve(generatedDir, 'cli-commands.json');
    if (existsSync(commandsPath)) {
      console.log(`[init] Skipping ${commandsPath} (already exists)`);
    } else if (answers.entryFile) {
      console.log(`[init] Running import-commands from ${answers.entryFile}...`);
      try {
        await importCommands({
          from: answers.entryFile,
          out: commandsPath,
          scrape: false,
          depth: 2,
          cwd: answers.repoPath,
        });
      } catch (err) {
        console.warn(`[init] Warning: import-commands failed: ${err instanceof Error ? err.message : err}`);
        console.warn(`[init] Writing template cli-commands.json instead.`);
        writeCliTemplate(commandsPath);
      }
    } else {
      writeCliTemplate(commandsPath);
    }
  }

  if (answers.surface === 'mcp') {
    const toolsPath = resolve(generatedDir, 'tools.json');
    if (existsSync(toolsPath)) {
      console.log(`[init] Skipping ${toolsPath} (already exists)`);
    } else {
      writeMcpTemplate(toolsPath);
    }
  }

  printNextSteps(answers, configPath);
}

function writeCliTemplate(commandsPath: string): void {
  const commands = [
    {
      command: 'example-create',
      description: 'Create a new item',
      options: [{ name: '--name', takesValue: true, description: 'Name for the item' }],
    },
    {
      command: 'example-list',
      description: 'List all items',
      options: [{ name: '--format', takesValue: true, description: 'Output format: json | table (default: table)' }],
    },
  ];
  writeFileSync(commandsPath, JSON.stringify(commands, null, 2) + '\n', 'utf-8');
  console.log(`[init] Created ${commandsPath} (template — edit or run import-commands to replace)`);
}

function writeMcpTemplate(toolsPath: string): void {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_data',
        description: 'Get data for a given item ID',
        parameters: {
          type: 'object',
          properties: { item_id: { type: 'string', description: 'The item identifier' } },
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

function printNextSteps(answers: WizardAnswers, configPath: string): void {
  console.log('\n[init] Done! Next steps:');
  console.log(`  Config: ${configPath}`);
  if (answers.surface === 'sdk') {
    console.log('  1. Review target.discovery.sources in the config — points to your SDK entry file');
  } else if (answers.surface === 'cli') {
    if (answers.entryFile) {
      console.log('  1. Review skill-optimizer/.skill-optimizer/cli-commands.json — auto-extracted from your CLI');
    } else {
      console.log('  1. Edit skill-optimizer/.skill-optimizer/cli-commands.json — replace template with real commands');
      console.log('     Or run: skill-optimizer import-commands --from <entry-file>');
    }
  } else {
    console.log('  1. Edit skill-optimizer/.skill-optimizer/tools.json — replace template with your real MCP tools');
  }
  console.log('  2. Add a SKILL.md to your repo root explaining the surface to the model');
  console.log('  3. Run: skill-optimizer run --config ./skill-optimizer/skill-optimizer.json');
}
