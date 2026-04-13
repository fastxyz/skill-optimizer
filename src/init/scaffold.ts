import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, join, basename } from 'node:path';
import type { WizardAnswers } from './answers.js';
import { importCommands } from '../import/index.js';

const KNOWN_MODELS: Record<string, { name: string; tier: 'flagship' | 'mid' | 'low' }> = {
  'openrouter/openai/gpt-4o': { name: 'GPT-4o', tier: 'flagship' },
  'openrouter/openai/gpt-4o-mini': { name: 'GPT-4o Mini', tier: 'mid' },
  'openrouter/anthropic/claude-sonnet-4-5': { name: 'Claude Sonnet 4.5', tier: 'flagship' },
  'openrouter/anthropic/claude-haiku-4-5': { name: 'Claude Haiku 4.5', tier: 'mid' },
  'openrouter/google/gemini-2.5-pro-preview': { name: 'Gemini 2.5 Pro', tier: 'flagship' },
  'openrouter/google/gemini-2.0-flash-001': { name: 'Gemini 2.0 Flash', tier: 'mid' },
  'openrouter/meta-llama/llama-3.3-70b-instruct': { name: 'Llama 3.3 70B', tier: 'mid' },
  'openrouter/mistralai/mistral-large-2411': { name: 'Mistral Large', tier: 'mid' },
  'openrouter/deepseek/deepseek-chat': { name: 'DeepSeek Chat', tier: 'mid' },
  'openrouter/qwen/qwen-2.5-72b-instruct': { name: 'Qwen 2.5 72B', tier: 'mid' },
};

function resolveModel(id: string): { id: string; name: string; tier: 'flagship' | 'mid' | 'low' } {
  const known = KNOWN_MODELS[id];
  if (known) return { id, ...known };
  const slug = id.split('/').pop() ?? id;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { id, name, tier: 'mid' };
}

export function buildConfigFromAnswers(answers: WizardAnswers, configDir: string): object {
  const { surface, repoPath, models, maxTasks, maxIterations, name } = answers;
  const projectName = name ?? basename(repoPath);

  // Paths stored in the JSON are relative to configDir so the config is portable
  const relRepo = relative(configDir, repoPath) || '.';

  const commonBenchmark = {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    format: 'pi',
    timeout: 240000,
    taskGeneration: { enabled: true, maxTasks, outputDir: './.skill-optimizer' },
    models: models.map(resolveModel),
    output: { dir: '../benchmark-results' },
    verdict: { perModelFloor: 0.6, targetWeightedAverage: 0.7 },
  };

  const commonOptimize = {
    model: models.includes('openrouter/openai/gpt-4o')
      ? 'openrouter/openai/gpt-4o'
      : models[0]!,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    allowedPaths: [join(relRepo, 'SKILL.md')],
    validation: [],
    maxIterations,
  };

  if (surface === 'sdk') {
    return {
      name: projectName,
      target: {
        surface: 'sdk',
        repoPath: relRepo,
        skill: join(relRepo, 'SKILL.md'),
        discovery: { mode: 'auto', sources: [join(relRepo, 'src/index.ts')] },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  const defaultEntry = surface === 'cli' ? 'src/cli.ts' : 'src/server.ts';
  const entryRelative = answers.entryFile ?? defaultEntry;

  if (surface === 'cli') {
    return {
      name: projectName,
      target: {
        surface: 'cli',
        repoPath: relRepo,
        skill: join(relRepo, 'SKILL.md'),
        discovery: { mode: 'auto', sources: [join(relRepo, entryRelative)] },
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
      repoPath: relRepo,
      skill: join(relRepo, 'SKILL.md'),
      discovery: { mode: 'auto', sources: [join(relRepo, entryRelative)] },
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
    writeFileSync(configPath, JSON.stringify(buildConfigFromAnswers(answers, configDir), null, 2) + '\n', 'utf-8');
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
      console.log('     Or run: npx skill-optimizer import-commands --from <entry-file>');
    }
  } else {
    console.log('  1. Edit skill-optimizer/.skill-optimizer/tools.json — replace template with your real MCP tools');
  }
  console.log('  2. Add a SKILL.md to your repo root explaining the surface to the model');
  console.log('  3. Run: npx skill-optimizer run --config ./skill-optimizer/skill-optimizer.json');
}
